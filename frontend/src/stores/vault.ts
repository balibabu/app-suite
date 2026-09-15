import { create } from 'zustand'
import axios from 'axios'
import { errorMessage, http, API_URL } from '../lib/api'
import { decryptBlob, encryptBlob, encryptBytes, decryptBytes } from '../lib/crypto'
import { useAuth } from './auth'
import type {
  CollectionKey,
  FileItem,
  FilePlain,
  ListPlain,
  NotePlain,
  SyncState,
  TaskItem,
  TaskPlain,
  VaultItem,
  WireItem,
} from '../lib/types'

const ENDPOINTS: Record<CollectionKey, string> = {
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
  if (withBase && item.itemVersion > 0) body.base_version = item.itemVersion
  return body
}

interface VaultState {
  ready: boolean
  syncing: boolean
  syncError: string | null
  lastSync: Record<CollectionKey, string | null>
  notes: Record<string, VaultItem<NotePlain>>
  lists: Record<string, VaultItem<ListPlain>>
  tasks: Record<string, TaskItem>
  files: Record<string, FileItem>
  reset: () => void
  syncAll: () => Promise<void>
  createNote: () => string
  saveNote: (id: string, plain: NotePlain) => void
  createList: (name: string) => string
  renameList: (id: string, name: string) => void
  createTask: (listId: string | null, title: string) => void
  saveTask: (id: string, plain: TaskPlain, taskList?: string | null) => void
  trashItem: (collection: CollectionKey, id: string) => Promise<void>
  restoreItem: (collection: CollectionKey, id: string) => Promise<void>
  purgeItem: (collection: CollectionKey, id: string) => Promise<void>
  uploadFile: (file: File) => Promise<void>
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
          case 'notes':
            record[wire.id] = makeItem<NotePlain>(wire, plain)
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

  return {
    ready: false,
    syncing: false,
    syncError: null,
    lastSync: { notes: null, lists: null, tasks: null, files: null },
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
        lastSync: { notes: null, lists: null, tasks: null, files: null },
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
        await Promise.all((Object.keys(ENDPOINTS) as CollectionKey[]).map((collection) => syncCollection(collection)))
        set({ ready: true, syncing: false })
      } catch (error) {
        set({ syncing: false, ready: true, syncError: errorMessage(error) })
      }
    },

    createNote() {
      const id = crypto.randomUUID()
      insertItem<NotePlain>('notes', baseItem(id, { title: '', body: '', edited: Date.now() }))
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

    async restoreItem(collection, id) {
      const { data } = await http.post<WireItem>(`/${ENDPOINTS[collection]}/${id}/restore/`)
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
      set((state) => {
        const record = { ...(state[collection] as Record<string, unknown>) }
        delete record[id]
        return { [collection]: record } as unknown as Partial<VaultState>
      })
      if (collection === 'files') {
        await useAuth.getState().refreshMe().catch(() => undefined)
      }
    },

    async uploadFile(file) {
      const id = crypto.randomUUID()
      const meta: FilePlain = {
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        uploaded: Date.now(),
      }
      const item: FileItem = {
        ...baseItem<FilePlain>(id, meta),
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
      const { data } = await http.get(`${API_URL}/files/${id}/content/`, {
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

