import { create } from 'zustand'
import axios from 'axios'
import { ensureAccess, errorMessage, http } from '../lib/api'
import { decryptBlob, encryptBlob, encryptBytes, decryptBytes } from '../lib/crypto'
import { useAuth } from './auth'
import type {
  CollectionKey,
  FileItem,
  FilePlain,
  FolderItem,
  FolderPlain,
  ListPlain,
  NoteItem,
  NotePlain,
  SyncState,
  TaskItem,
  TaskPlain,
  VaultItem,
  WireItem,
} from '../lib/types'

const ENDPOINTS: Record<CollectionKey, string> = {
  folders: 'notes/folders',
  fileFolders: 'files/folders',
  notes: 'notes',
  lists: 'tasks/lists',
  tasks: 'tasks/tasks',
  files: 'files',
}

const PUSH_DEBOUNCE_MS = 700

const pushTimers = new Map<string, ReturnType<typeof setTimeout>>()
const encryptedUploads = new Map<string, Uint8Array>()

function master(): CryptoKey {
  const key = useAuth.getState().masterKey
  if (!key) throw new Error('vault is locked')
  return key
}

function baseItem<P>(id: string, plain: P): VaultItem<P> {
  const now = new Date().toISOString()
  return {
    id,
    plain,
    formatVersion: 1,
    itemVersion: 0,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    sync: 'pending',
  }
}

function toWireBody(collection: CollectionKey, item: VaultItem<unknown>, blob: string, withBase: boolean) {
  const body: Record<string, unknown> = {
    format_version: item.formatVersion,
    [collection === 'files' ? 'meta_ciphertext' : 'content']: blob,
  }
  if (collection === 'tasks') body.task_list = (item as TaskItem).taskList
  if (collection === 'notes') body.folder = (item as NoteItem).folder
  if (collection === 'files') body.folder = (item as FileItem).folder
  if (collection === 'folders' || collection === 'fileFolders') body.parent = (item as FolderItem).parent
  if (withBase && item.itemVersion > 0) body.base_version = item.itemVersion
  return body
}

interface VaultState {
  ready: boolean
  syncing: boolean
  syncError: string | null
  lastSync: Record<CollectionKey, string | null>
  folders: Record<string, FolderItem>
  fileFolders: Record<string, FolderItem>
  notes: Record<string, NoteItem>
  lists: Record<string, VaultItem<ListPlain>>
  tasks: Record<string, TaskItem>
  files: Record<string, FileItem>
  reset: () => void
  syncAll: () => Promise<void>
  createFolder: (parent: string | null, name: string) => string
  renameFolder: (id: string, name: string) => void
  moveFolder: (id: string, parent: string | null) => void
  renameNote: (id: string, title: string) => void
  toggleNotePin: (id: string) => void
  toggleFolderPin: (id: string) => void
  moveNote: (id: string, folder: string | null) => void
  createNote: (folder: string | null) => string
  saveNote: (id: string, plain: NotePlain) => void
  createList: (name: string) => string
  renameList: (id: string, name: string) => void
  createTask: (listId: string | null, title: string) => void
  saveTask: (id: string, plain: TaskPlain, taskList?: string | null) => void
  trashItem: (collection: CollectionKey, id: string) => Promise<void>
  trashFolder: (id: string) => Promise<void>
  createFileFolder: (parent: string | null, name: string) => string
  renameFileFolder: (id: string, name: string) => void
  moveFileFolder: (id: string, parent: string | null) => void
  trashFileFolder: (id: string) => Promise<void>
  moveFile: (id: string, folder: string | null) => void
  renameFile: (id: string, name: string) => void
  restoreItem: (collection: CollectionKey, id: string) => Promise<void>
  purgeItem: (collection: CollectionKey, id: string) => Promise<void>
  uploadFile: (file: File, folder?: string | null) => Promise<void>
  retryUpload: (id: string) => Promise<void>
  downloadFile: (id: string) => Promise<void>
  uploadAbort: (id: string) => Promise<void>
}

export const useVault = create<VaultState>((set, get) => {
  function patchItem(collection: CollectionKey, id: string, patch: Record<string, unknown>) {
    set((state) => {
      const record = { ...(state[collection] as Record<string, unknown>) }
      const current = record[id] as Record<string, unknown> | undefined
      if (!current) return state
      record[id] = { ...current, ...patch }
      return { [collection]: record } as unknown as Partial<VaultState>
    })
  }

  function makeItem<P>(wire: WireItem, plain: P): VaultItem<P> {
    return {
      id: wire.id,
      plain,
      formatVersion: wire.format_version,
      itemVersion: wire.item_version,
      deletedAt: wire.deleted_at,
      createdAt: wire.created_at,
      updatedAt: wire.updated_at,
      sync: 'synced',
    }
  }

  async function applyServerItems(collection: CollectionKey, wires: WireItem[]): Promise<void> {
    const key = master()
    for (const wire of wires) {
      const raw = wire.content ?? wire.meta_ciphertext ?? ''
      if (!raw) continue
      const plain = JSON.parse(await decryptBlob(key, raw))
      set((state) => {
        const record = { ...(state[collection] as Record<string, unknown>) }
        const existing = record[wire.id] as { sync?: SyncState } | undefined
        if (existing?.sync === 'pending') return state
        switch (collection) {
          case 'folders':
          case 'fileFolders':
            record[wire.id] = { ...makeItem<FolderPlain>(wire, plain), parent: wire.parent ?? null }
            break
          case 'notes':
            record[wire.id] = { ...makeItem<NotePlain>(wire, plain), folder: wire.folder ?? null }
            break
          case 'lists':
            record[wire.id] = makeItem<ListPlain>(wire, plain)
            break
          case 'tasks': {
            const item: TaskItem = { ...makeItem<TaskPlain>(wire, plain), taskList: wire.task_list ?? null }
            record[wire.id] = item
            break
          }
          case 'files': {
            const previous = record[wire.id] as FileItem | undefined
            const item: FileItem = {
              ...makeItem<FilePlain>(wire, plain),
              folder: wire.folder ?? null,
              stored: wire.stored ?? false,
              serverSize: wire.size ?? 0,
              uploadProgress: previous?.uploadProgress ?? null,
              uploadError: null,
            }
            record[wire.id] = item
            break
          }
        }
        return { [collection]: record } as unknown as Partial<VaultState>
      })
    }
  }

  async function syncCollection(collection: CollectionKey): Promise<void> {
    const since = get().lastSync[collection]
    const query = since ? `?updated_since=${encodeURIComponent(since)}` : ''
    const { data } = await http.get<WireItem[]>(`/${ENDPOINTS[collection]}/${query}`)
    await applyServerItems(collection, data)
    const last = data.length > 0 ? data[data.length - 1].updated_at : null
    if (last) {
      set((state) => ({ lastSync: { ...state.lastSync, [collection]: last } }))
    }
  }

  async function pushItem(collection: CollectionKey, id: string): Promise<void> {
    const state = get()
    const item = (state[collection] as Record<string, VaultItem<unknown> | undefined>)[id]
    if (!item || item.sync !== 'pending' || item.deletedAt) return
    const blob = await encryptBlob(master(), JSON.stringify(item.plain))
    const body = toWireBody(collection, item, blob, true)
    try {
      const { data } = await http.put<WireItem>(`/${ENDPOINTS[collection]}/${id}/`, body)
      patchItem(collection, id, {
        itemVersion: data.item_version,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        sync: 'synced',
      })
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        const code = (error.response.data as { code?: string })?.code
        if (code === 'version_conflict') {
          const { data } = await http.put<WireItem>(`/${ENDPOINTS[collection]}/${id}/`, toWireBody(collection, item, blob, false))
          patchItem(collection, id, {
            itemVersion: data.item_version,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            sync: 'synced',
          })
          return
        }
      }
      patchItem(collection, id, { sync: 'error' })
      throw error
    }
  }

  function schedulePush(collection: CollectionKey, id: string, immediate = false) {
    const timerKey = `${collection}:${id}`
    const existing = pushTimers.get(timerKey)
    if (existing) clearTimeout(existing)
    const run = () => {
      pushTimers.delete(timerKey)
      pushItem(collection, id).catch(() => undefined)
    }
    if (immediate) {
      run()
      return
    }
    pushTimers.set(timerKey, setTimeout(run, PUSH_DEBOUNCE_MS))
  }

  function cancelPush(collection: CollectionKey, id: string) {
    const timerKey = `${collection}:${id}`
    const existing = pushTimers.get(timerKey)
    if (existing) {
      clearTimeout(existing)
      pushTimers.delete(timerKey)
    }
  }

  function insertItem<P>(collection: CollectionKey, item: VaultItem<P>) {
    set((state) => {
      const record = { ...(state[collection] as Record<string, unknown>) }
      record[item.id] = item
      return { [collection]: record } as unknown as Partial<VaultState>
    })
  }

  function folderDescendants(collection: 'folders' | 'fileFolders', id: string): Set<string> {
    const descendants = new Set([id])
    let grew = true
    while (grew) {
      grew = false
      for (const folder of Object.values(get()[collection])) {
        if (!descendants.has(folder.id) && folder.parent && descendants.has(folder.parent)) {
          descendants.add(folder.id)
          grew = true
        }
      }
    }
    return descendants
  }

  function cascadeFolders(
    collection: 'folders' | 'fileFolders',
    state: VaultState,
    ids: Set<string>,
    deletedAt: string | null,
  ): Partial<VaultState> {
    const folders = { ...state[collection] }
    for (const folderId of ids) {
      if (folders[folderId]) folders[folderId] = { ...folders[folderId], deletedAt, sync: 'synced' as SyncState }
    }
    if (collection === 'fileFolders') {
      const files = { ...state.files }
      for (const file of Object.values(files)) {
        if (file.folder && ids.has(file.folder)) {
          files[file.id] = { ...file, deletedAt, sync: 'synced' as SyncState }
        }
      }
      return { fileFolders: folders, files }
    }
    const notes = { ...state.notes }
    for (const note of Object.values(notes)) {
      if (note.folder && ids.has(note.folder)) {
        notes[note.id] = { ...note, deletedAt, sync: 'synced' as SyncState }
      }
    }
    return { folders, notes }
  }

  return {
    ready: false,
    syncing: false,
    syncError: null,
    lastSync: { folders: null, fileFolders: null, notes: null, lists: null, tasks: null, files: null },
    folders: {},
    fileFolders: {},
    notes: {},
    lists: {},
    tasks: {},
    files: {},

    reset() {
      for (const timer of pushTimers.values()) clearTimeout(timer)
      pushTimers.clear()
      encryptedUploads.clear()
      set({
        ready: false,
        syncing: false,
        syncError: null,
        lastSync: { folders: null, fileFolders: null, notes: null, lists: null, tasks: null, files: null },
        folders: {},
        fileFolders: {},
        notes: {},
        lists: {},
        tasks: {},
        files: {},
      })
    },

    async syncAll() {
      if (get().syncing) return
      set({ syncing: true, syncError: null })
      try {
        await ensureAccess()
        await Promise.all((Object.keys(ENDPOINTS) as CollectionKey[]).map((collection) => syncCollection(collection)))
        set({ ready: true, syncing: false })
      } catch (error) {
        set({ syncing: false, ready: true, syncError: errorMessage(error) })
      }
    },

    createFolder(parent, name) {
      const id = crypto.randomUUID()
      const item: FolderItem = {
        ...baseItem<FolderPlain>(id, { name }),
        parent,
      }
      insertItem<FolderPlain>('folders', item)
      schedulePush('folders', id, true)
      return id
    },

    renameFolder(id, name) {
      const folder = get().folders[id]
      if (!folder) return
      patchItem('folders', id, { plain: { ...folder.plain, name }, sync: 'pending' })
      schedulePush('folders', id)
    },

    toggleFolderPin(id) {
      const folder = get().folders[id]
      if (!folder) return
      patchItem('folders', id, { plain: { ...folder.plain, pinned: !folder.plain.pinned }, sync: 'pending' })
      schedulePush('folders', id)
    },

    moveFolder(id, parent) {
      patchItem('folders', id, { parent, sync: 'pending' })
      schedulePush('folders', id, true)
    },

    renameNote(id, title) {
      const note = get().notes[id]
      if (!note) return
      patchItem('notes', id, { plain: { ...note.plain, title, edited: Date.now() }, sync: 'pending' })
      schedulePush('notes', id)
    },

    toggleNotePin(id) {
      const note = get().notes[id]
      if (!note) return
      patchItem('notes', id, { plain: { ...note.plain, pinned: !note.plain.pinned }, sync: 'pending' })
      schedulePush('notes', id)
    },

    moveNote(id, folder) {
      patchItem('notes', id, { folder, sync: 'pending' })
      schedulePush('notes', id, true)
    },

    createNote(folder) {
      const id = crypto.randomUUID()
      const item: NoteItem = {
        ...baseItem<NotePlain>(id, { title: '', body: '', edited: Date.now() }),
        folder,
      }
      insertItem<NotePlain>('notes', item)
      schedulePush('notes', id, true)
      return id
    },

    saveNote(id, plain) {
      patchItem('notes', id, { plain: { ...plain, edited: Date.now() }, sync: 'pending' })
      schedulePush('notes', id)
    },

    createList(name) {
      const id = crypto.randomUUID()
      insertItem<ListPlain>('lists', baseItem(id, { name }))
      schedulePush('lists', id, true)
      return id
    },

    renameList(id, name) {
      patchItem('lists', id, { plain: { name }, sync: 'pending' })
      schedulePush('lists', id)
    },

    createTask(listId, title) {
      const id = crypto.randomUUID()
      const item: TaskItem = {
        ...baseItem<TaskPlain>(id, { title, done: false, notes: '', due: null }),
        taskList: listId,
      }
      insertItem<TaskPlain>('tasks', item)
      schedulePush('tasks', id, true)
      return id
    },

    saveTask(id, plain, taskList) {
      const patch: Record<string, unknown> = { plain, sync: 'pending' }
      if (taskList !== undefined) patch.taskList = taskList
      patchItem('tasks', id, patch)
      schedulePush('tasks', id)
    },

    async trashItem(collection, id) {
      cancelPush(collection, id)
      await http.delete(`/${ENDPOINTS[collection]}/${id}/`)
      patchItem(collection, id, { deletedAt: new Date().toISOString(), sync: 'synced' })
    },

    async trashFolder(id) {
      const now = new Date().toISOString()
      const descendants = folderDescendants('folders', id)
      for (const folderId of descendants) cancelPush('folders', folderId)
      for (const note of Object.values(get().notes)) {
        if (note.folder && descendants.has(note.folder)) cancelPush('notes', note.id)
      }
      await http.delete(`/notes/folders/${id}/`)
      set((state) => cascadeFolders('folders', state, descendants, now))
    },

    createFileFolder(parent, name) {
      const id = crypto.randomUUID()
      const item: FolderItem = {
        ...baseItem<FolderPlain>(id, { name }),
        parent,
      }
      insertItem<FolderPlain>('fileFolders', item)
      schedulePush('fileFolders', id, true)
      return id
    },

    renameFileFolder(id, name) {
      patchItem('fileFolders', id, { plain: { name }, sync: 'pending' })
      schedulePush('fileFolders', id)
    },

    moveFileFolder(id, parent) {
      patchItem('fileFolders', id, { parent, sync: 'pending' })
      schedulePush('fileFolders', id, true)
    },

    async trashFileFolder(id) {
      const now = new Date().toISOString()
      const descendants = folderDescendants('fileFolders', id)
      for (const folderId of descendants) cancelPush('fileFolders', folderId)
      for (const file of Object.values(get().files)) {
        if (file.folder && descendants.has(file.folder)) cancelPush('files', file.id)
      }
      await http.delete(`/files/folders/${id}/`)
      set((state) => cascadeFolders('fileFolders', state, descendants, now))
    },

    moveFile(id, folder) {
      patchItem('files', id, { folder, sync: 'pending' })
      schedulePush('files', id, true)
    },

    renameFile(id, name) {
      const file = get().files[id]
      if (!file) return
      patchItem('files', id, { plain: { ...file.plain, name }, sync: 'pending' })
      schedulePush('files', id)
    },

    async restoreItem(collection, id) {
      const { data } = await http.post<WireItem>(`/${ENDPOINTS[collection]}/${id}/restore/`)
      if (collection === 'folders' || collection === 'fileFolders') {
        set((state) => cascadeFolders(collection, state, folderDescendants(collection, id), null))
        patchItem(collection, id, { itemVersion: data.item_version, updatedAt: data.updated_at })
        return
      }
      patchItem(collection, id, {
        deletedAt: null,
        itemVersion: data.item_version,
        updatedAt: data.updated_at,
        sync: 'synced',
      })
    },

    async purgeItem(collection, id) {
      cancelPush(collection, id)
      await http.delete(`/${ENDPOINTS[collection]}/${id}/?purge=true`)
      if (collection === 'folders' || collection === 'fileFolders') {
        const descendants = folderDescendants(collection, id)
        for (const folderId of descendants) cancelPush(collection, folderId)
        set((state) => {
          const folders = { ...state[collection] }
          for (const folderId of descendants) delete folders[folderId]
          if (collection === 'fileFolders') {
            const files = { ...state.files }
            for (const file of Object.values(files)) {
              if (file.folder && descendants.has(file.folder)) delete files[file.id]
            }
            return { fileFolders: folders, files }
          }
          const notes = { ...state.notes }
          for (const note of Object.values(notes)) {
            if (note.folder && descendants.has(note.folder)) delete notes[note.id]
          }
          return { folders, notes }
        })
      } else {
        set((state) => {
          const record = { ...(state[collection] as Record<string, unknown>) }
          delete record[id]
          return { [collection]: record } as unknown as Partial<VaultState>
        })
      }
      if (collection === 'files' || collection === 'fileFolders') {
        await useAuth.getState().refreshMe().catch(() => undefined)
      }
    },

    async uploadFile(file, folder = null) {
      const id = crypto.randomUUID()
      const meta: FilePlain = {
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        uploaded: Date.now(),
      }
      const item: FileItem = {
        ...baseItem<FilePlain>(id, meta),
        folder,
        stored: false,
        serverSize: 0,
        uploadProgress: 0,
        uploadError: null,
      }
      insertItem('files', item)
      const metaBlob = await encryptBlob(master(), JSON.stringify(meta))
      const { data: created } = await http.post<WireItem>('/files/', {
        id,
        meta_ciphertext: metaBlob,
        format_version: 1,
        folder,
      })
      patchItem('files', id, { itemVersion: created.item_version, createdAt: created.created_at, updatedAt: created.updated_at, sync: 'synced' })
      const encrypted = await encryptBytes(master(), new Uint8Array(await file.arrayBuffer()))
      encryptedUploads.set(id, encrypted)
      await pushContent(id)
      await useAuth.getState().refreshMe().catch(() => undefined)
    },

    async retryUpload(id) {
      if (!encryptedUploads.has(id)) throw new Error('encrypted payload unavailable, upload the file again')
      patchItem('files', id, { uploadError: null, uploadProgress: 0 })
      await pushContent(id)
      await useAuth.getState().refreshMe().catch(() => undefined)
    },

    async downloadFile(id) {
      const item = get().files[id]
      if (!item) return
      const { data } = await http.get(`/files/${id}/content/`, {
        responseType: 'arraybuffer',
      })
      const bytes = await decryptBytes(master(), new Uint8Array(data))
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: item.plain.mime })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = item.plain.name
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    },

    async uploadAbort(id) {
      encryptedUploads.delete(id)
      await get().purgeItem('files', id)
    },
  }

  async function pushContent(id: string): Promise<void> {
    const encrypted = encryptedUploads.get(id)
    if (!encrypted) throw new Error('nothing to upload')
    try {
      const { data } = await http.put<WireItem>(`/files/${id}/content/`, encrypted.buffer as ArrayBuffer, {
        headers: { 'Content-Type': 'application/octet-stream' },
        onUploadProgress: (event) => {
          if (event.total) {
            patchItem('files', id, { uploadProgress: Math.round((event.loaded / event.total) * 100) })
          }
        },
      })
      encryptedUploads.delete(id)
      patchItem('files', id, { stored: true, serverSize: data.size ?? 0, itemVersion: data.item_version, updatedAt: data.updated_at, uploadProgress: null })
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 413) {
        await get().purgeItem('files', id)
        throw new Error('file exceeds size or storage limit')
      }
      patchItem('files', id, { uploadError: errorMessage(error), uploadProgress: null })
      throw error
    }
  }
})

