import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  Bold,
  ChevronRight,
  Code,
  CornerLeftUp,
  FileEdit,
  FilePlus,
  FileText,
  FolderOpen,
  Folder,
  FolderPlus,
  Heading2,
  Italic,
  List,
  Quote,
  Search,
  Strikethrough,
  Trash2,
  X,
} from 'lucide-react'
import { useVault } from '../stores/vault'
import { toast } from '../stores/toast'
import { EmptyState, Modal, Spinner, SyncBadge } from '../components/ui'
import Markdown from '../components/Markdown'
import type { NoteItem, NotePlain, VaultItem } from '../lib/types'

type EditorMode = 'write' | 'preview' | 'split'

function noteDate(note: VaultItem<NotePlain>): string {
  return new Date(note.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function NotesPage() {
  const folders = useVault((state) => state.folders)
  const notes = useVault((state) => state.notes)
  const ready = useVault((state) => state.ready)
  const createFolder = useVault((state) => state.createFolder)
  const createNote = useVault((state) => state.createNote)
  const trashItem = useVault((state) => state.trashItem)
  const trashFolder = useVault((state) => state.trashFolder)
  const { noteId } = useParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [confirmTrash, setConfirmTrash] = useState<
    { collection: 'folders' | 'notes'; id: string; name: string } | null
  >(null)

  const breadcrumbs = useMemo(() => {
    const crumbs: { id: string; name: string }[] = []
    let current = currentFolder ? folders[currentFolder] : undefined
    while (current) {
      crumbs.unshift({ id: current.id, name: current.plain.name })
      current = current.parent ? folders[current.parent] : undefined
    }
    return crumbs
  }, [currentFolder, folders])

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const activeFolders = Object.values(folders).filter(
      (folder) =>
        !folder.deletedAt &&
        folder.parent === currentFolder &&
        (!needle || folder.plain.name.toLowerCase().includes(needle)),
    )
    const activeNotes =
      needle || !currentFolder
        ? Object.values(notes).filter(
            (note) =>
              !note.deletedAt &&
              (needle
                ? note.plain.title.toLowerCase().includes(needle) ||
                  note.plain.body.toLowerCase().includes(needle)
                : note.folder === null),
          )
        : Object.values(notes).filter((note) => !note.deletedAt && note.folder === currentFolder)
    return [
      ...activeFolders.sort((a, b) => a.plain.name.localeCompare(b.plain.name)),
      ...activeNotes.sort((a, b) => b.plain.edited - a.plain.edited),
    ]
  }, [folders, notes, currentFolder, query])

  const countChildren = (folderId: string) =>
    Object.values(folders).filter((folder) => !folder.deletedAt && folder.parent === folderId).length +
    Object.values(notes).filter((note) => !note.deletedAt && note.folder === folderId).length

  const goUp = () => {
    const parent = currentFolder ? folders[currentFolder]?.parent ?? null : null
    setCurrentFolder(parent)
  }

  const active = noteId ? notes[noteId] : undefined

  const create = () => {
    const id = createNote(currentFolder)
    navigate(`/notes/${id}`)
  }

  if (!ready) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner className="h-6 w-6 text-indigo-400" />
      </div>
    )
  }

  return (
    <section className="animate-fadeIn flex flex-col" style={{ minHeight: '60vh' }}>
      <div className="glass mb-4 flex flex-col gap-3 p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="scrollbar-none flex w-full items-center gap-2 overflow-x-auto pb-1 sm:w-auto sm:pb-0">
          <button
            onClick={() => setCurrentFolder(null)}
            title="suite home"
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Notes
          </button>

          {currentFolder ? (
            <button
              onClick={goUp}
              title="go to parent directory"
              className="shrink-0 cursor-pointer rounded-lg border border-white/10 bg-white/5 p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <CornerLeftUp className="h-3.5 w-3.5" />
            </button>
          ) : null}

          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setCurrentFolder(null)}
              className={`shrink-0 transition hover:text-indigo-400 ${
                currentFolder === null ? 'font-semibold text-white' : 'text-zinc-400'
              }`}
            >
              root
            </button>
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.id} className="flex shrink-0 items-center gap-1">
                <ChevronRight className="h-3 w-3 text-zinc-600" />
                <button
                  onClick={() => setCurrentFolder(crumb.id)}
                  className={`max-w-[120px] truncate transition hover:text-indigo-400 ${
                    index === breadcrumbs.length - 1 ? 'font-semibold text-white' : 'text-zinc-400'
                  }`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
          <div className="field w-full sm:w-44">
            <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <input
              type="text"
              placeholder="Search..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button
            onClick={() => {
              setNewFolderName('')
              setFolderModalOpen(true)
            }}
            className="btn-warn shrink-0 whitespace-nowrap"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Category</span>
          </button>
          <button onClick={create} className="btn-primary shrink-0 whitespace-nowrap">
            <FilePlus className="h-3.5 w-3.5" />
            New Note
          </button>
        </div>
      </div>

      <div className="glass relative overflow-y-auto border-white/10 bg-zinc-900/30 p-4 sm:p-6">
        {items.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="h-8 w-8" />}
            title={query ? 'no matches found' : 'folder is empty'}
            hint={
              query
                ? 'nothing in this vault matches your search'
                : 'create a new nested category or a markdown note inside this directory'
            }
            action={
              query ? null : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setNewFolderName('')
                      setFolderModalOpen(true)
                    }}
                    className="btn-ghost"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    category
                  </button>
                  <button onClick={create} className="btn-primary">
                    <FilePlus className="h-3.5 w-3.5" />
                    note
                  </button>
                </div>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((item) => {
              const isFolder = 'parent' in item
              const name = isFolder ? item.plain.name : item.plain.title || 'untitled'
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (isFolder) {
                      setCurrentFolder(item.id)
                      setQuery('')
                    } else {
                      navigate(`/notes/${item.id}`)
                    }
                  }}
                  className={`group relative flex cursor-pointer flex-col items-center rounded-xl border p-3.5 text-center backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
                    !isFolder && item.id === noteId
                      ? 'border-indigo-500/40 bg-zinc-800/60 shadow-lg shadow-indigo-500/10'
                      : 'border-white/5 bg-zinc-900/50 hover:border-white/15 hover:bg-zinc-800/60'
                  }`}
                >
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      setConfirmTrash({
                        collection: isFolder ? 'folders' : 'notes',
                        id: item.id,
                        name,
                      })
                    }}
                    title="Delete"
                    className="absolute top-2 right-2 cursor-pointer rounded-md bg-red-500/10 p-1 text-red-400 opacity-0 transition hover:bg-red-500/20 group-hover:opacity-100 no-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>

                  {isFolder ? (
                    <div className="mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-inner transition-transform group-hover:scale-105">
                      <Folder className="h-7 w-7" />
                    </div>
                  ) : (
                    <div className="mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 shadow-inner transition-transform group-hover:scale-105">
                      <FileText className="h-7 w-7" />
                    </div>
                  )}

                  <span className="w-full truncate px-1 text-xs font-medium text-zinc-200 transition-colors group-hover:text-indigo-300">
                    {name}
                  </span>

                  {isFolder ? (
                    <span className="mt-1 text-[10px] text-zinc-500">{countChildren(item.id)} items</span>
                  ) : (
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500">
                      <SyncBadge sync={item.sync} />
                      {noteDate(item)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {active ? (
        <NoteEditor
          key={active.id}
          note={active}
          folders={folders}
          onClose={() => navigate('/notes', { replace: true })}
          onTrash={() =>
            setConfirmTrash({
              collection: 'notes',
              id: active.id,
              name: active.plain.title || 'untitled',
            })
          }
        />
      ) : null}

      {folderModalOpen ? (
        <Modal
          title="Create new category"
          subtitle="nested inside current directory"
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
              <FolderPlus className="h-5 w-5" />
            </div>
          }
          onClose={() => setFolderModalOpen(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              createFolder(currentFolder, newFolderName.trim() || 'Untitled Category')
              setFolderModalOpen(false)
            }}
          >
            <input
              autoFocus
              className="input mb-4"
              placeholder="category name (e.g. work, ideas, gaming)"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
            />
            <div className="flex items-center justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setFolderModalOpen(false)}>
                cancel
              </button>
              <button type="submit" className="btn bg-amber-400 text-black shadow-lg shadow-amber-400/20 hover:bg-amber-300">
                create category
              </button>
              </div>
          </form>
        </Modal>
      ) : null}

      {confirmTrash ? (
        <Modal
          title={`Delete "${confirmTrash.name}"?`}
          subtitle={
            confirmTrash.collection === 'folders'
              ? 'nested categories and notes inside will move to trash too'
              : 'the note will move to trash'
          }
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 text-red-400">
              <Trash2 className="h-5 w-5" />
            </div>
          }
          onClose={() => setConfirmTrash(null)}
        >
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setConfirmTrash(null)}>
              cancel
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                const target = confirmTrash
                setConfirmTrash(null)
                try {
                  if (target.collection === 'folders') {
                    await trashFolder(target.id)
                    if (currentFolder === target.id) setCurrentFolder(null)
                  } else {
                    await trashItem('notes', target.id)
                    if (noteId === target.id) navigate('/notes', { replace: true })
                  }
                } catch {
                  toast.error('failed to delete')
                }
              }}
            >
              delete
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}

const SNIPPETS: { icon: typeof Bold; label: string; before: string; after: string }[] = [
  { icon: Bold, label: 'Bold', before: '**', after: '**' },
  { icon: Italic, label: 'Italic', before: '*', after: '*' },
  { icon: Strikethrough, label: 'Strikethrough', before: '~~', after: '~~' },
  { icon: Code, label: 'Code', before: '`', after: '`' },
  { icon: Heading2, label: 'Heading', before: '## ', after: '' },
  { icon: List, label: 'List', before: '- ', after: '' },
  { icon: Quote, label: 'Quote', before: '> ', after: '' },
]

function NoteEditor({
  note,
  folders,
  onClose,
  onTrash,
}: {
  note: NoteItem
  folders: Record<string, { id: string; plain: { name: string }; parent: string | null; deletedAt: string | null }>
  onClose: () => void
  onTrash: () => void
}) {
  const saveNote = useVault((state) => state.saveNote)
  const moveNote = useVault((state) => state.moveNote)
  const [title, setTitle] = useState(note.plain.title)
  const [body, setBody] = useState(note.plain.body)
  const [mode, setMode] = useState<EditorMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'write' : 'split',
  )
  const [confirmClose, setConfirmClose] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const dirty = title !== note.plain.title || body !== note.plain.body

  const requestClose = () => {
    if (dirty) {
      setConfirmClose(true)
      return
    }
    onClose()
  }

  const saveAndClose = () => {
    saveNote(note.id, { title, body, edited: Date.now() })
    onClose()
  }

  const insertSyntax = (before: string, after: string) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = body.substring(start, end)
    const next = body.substring(0, start) + before + selected + after + body.substring(end)
    setBody(next)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + before.length, end + before.length)
    })
  }

  const folderOptions = Object.values(folders).filter((folder) => !folder.deletedAt)

  return createPortal(
    <div className="animate-fadeIn fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md sm:p-6">
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-zinc-900/90 shadow-2xl backdrop-blur-2xl sm:h-[94vh] sm:max-w-6xl sm:rounded-2xl sm:border sm:border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-950/40 px-4 py-3">
          <div className="mr-4 flex flex-1 items-center gap-2">
            <FileEdit className="h-4 w-4 shrink-0 text-indigo-400" />
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full max-w-sm border-b border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-white transition outline-none placeholder:text-zinc-600 hover:border-white/20 focus:border-indigo-500"
              placeholder="Note title..."
            />
            <SyncBadge sync={note.sync} />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-white/10 bg-zinc-800/80 p-0.5 text-xs">
              {(['write', 'preview', 'split'] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className={`cursor-pointer rounded-md px-2.5 py-1 capitalize transition ${
                    value === 'split' ? 'hidden md:block' : ''
                  } ${mode === value ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
                >
                  {value}
                </button>
              ))}
            </div>

            <button
              onClick={onTrash}
              title="move to trash"
              className="cursor-pointer rounded-lg border border-white/10 bg-white/5 p-1.5 text-zinc-400 transition hover:bg-red-500/20 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={requestClose}
              className="cursor-pointer rounded-lg border border-white/10 bg-white/5 p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto border-b border-white/5 bg-zinc-950/60 px-4 py-2">
          {SNIPPETS.map(({ icon: Icon, label, before, after }) => (
            <button
              key={label}
              onClick={() => insertSyntax(before, after)}
              title={label}
              className="shrink-0 cursor-pointer rounded bg-white/5 p-1.5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
          <button
            onClick={() => insertSyntax('```\n', '\n```')}
            title="Code block"
            className="shrink-0 cursor-pointer rounded bg-white/5 px-2 py-1.5 font-mono text-[10px] text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            code
          </button>
          <button
            onClick={() => insertSyntax('||', '||')}
            title="Spoiler"
            className="shrink-0 cursor-pointer rounded bg-white/5 px-2 py-1.5 font-mono text-[10px] text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            ||spoiler||
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Folder className="h-3 w-3 text-zinc-500" />
            <select
              className="cursor-pointer rounded bg-zinc-950/80 px-1.5 py-1 text-[10px] text-zinc-400 outline-none"
              value={note.folder ?? ''}
              onChange={(event) => moveNote(note.id, event.target.value || null)}
            >
              <option className="input-option" value="">
                root
              </option>
              {folderOptions.map((folder) => (
                <option className="input-option" key={folder.id} value={folder.id}>
                  {folder.plain.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div
            className={`h-full flex-1 overflow-hidden p-4 ${mode === 'split' ? 'border-r border-white/10' : ''}`}
            style={{ display: mode === 'preview' ? 'none' : undefined }}
          >
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Tab') {
                  event.preventDefault()
                  insertSyntax('  ', '')
                }
              }}
              placeholder="Write your note with markdown — **bold**, *italic*, ```code```, ||spoiler||..."
              className="h-full w-full resize-none bg-transparent font-mono text-sm leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600"
              spellCheck={false}
            />
          </div>
          <div
            className="h-full flex-1 overflow-y-auto bg-zinc-950/20 p-5"
            style={{ display: mode === 'write' ? 'none' : undefined }}
          >
            <Markdown source={body} />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/5 bg-zinc-950/40 px-4 py-2.5 text-xs text-zinc-500">
          <span>{body.length} characters</span>
          <button onClick={saveAndClose} className="btn-primary">
            save & close
          </button>
        </div>
      </div>

      {confirmClose ? (
        <Modal
          title="unsaved changes"
          subtitle="this note has edits that are not saved yet"
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
          }
          onClose={() => setConfirmClose(false)}
        >
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setConfirmClose(false)}>
              keep editing
            </button>
            <button className="btn-danger" onClick={onClose}>
              discard
            </button>
            <button className="btn-primary" onClick={saveAndClose}>
              save
            </button>
          </div>
        </Modal>
      ) : null}
    </div>,
    document.body,
  )
}
