import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useVault } from '../stores/vault'
import { toast } from '../stores/toast'
import { EmptyState, Modal, SyncBadge } from '../components/ui'
import type { NotePlain, VaultItem } from '../lib/types'

function notePreview(note: VaultItem<NotePlain>): string {
  return note.plain.body.replace(/\s+/g, ' ').trim().slice(0, 120)
}

export default function NotesPage() {
  const notes = useVault((state) => state.notes)
  const ready = useVault((state) => state.ready)
  const createNote = useVault((state) => state.createNote)
  const trashItem = useVault((state) => state.trashItem)
  const { noteId } = useParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [confirmTrash, setConfirmTrash] = useState<string | null>(null)

  const sorted = useMemo(
    () =>
      Object.values(notes)
        .filter((note) => !note.deletedAt)
        .sort((a, b) => b.plain.edited - a.plain.edited),
    [notes],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return sorted
    return sorted.filter(
      (note) =>
        note.plain.title.toLowerCase().includes(needle) ||
        note.plain.body.toLowerCase().includes(needle),
    )
  }, [sorted, query])

  const active = noteId ? notes[noteId] : undefined

  const create = () => {
    const id = createNote()
    navigate(`/notes/${id}`)
  }

  if (!ready) {
    return <EmptyState icon="⏳" title="decrypting your notes…" />
  }

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex w-80 shrink-0 flex-col border-r border-white/5">
        <header className="flex items-center gap-2 p-3">
          <input
            className="input flex-1"
            placeholder="search notes…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button onClick={create} className="btn-primary shrink-0 px-3" title="new note">
            +
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-slate-500">
              {query ? 'no matches' : 'no notes yet — create one'}
            </p>
          ) : (
            filtered.map((note) => (
              <button
                key={note.id}
                onClick={() => navigate(`/notes/${note.id}`)}
                className={`mb-1 w-full cursor-pointer rounded-xl px-3 py-2.5 text-left transition ${
                  note.id === noteId
                    ? 'bg-white/10 shadow-inner'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-100">
                    {note.plain.title || 'untitled'}
                  </span>
                  <SyncBadge sync={note.sync} />
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">{notePreview(note)}</p>
              </button>
            ))
          )}
        </div>
      </section>
      <section className="min-w-0 flex-1">
        {active ? (
          <NoteEditor
            key={active.id}
            note={active}
            onTrash={() => setConfirmTrash(active.id)}
          />
        ) : (
          <EmptyState icon="📝" title="select a note" hint="pick one from the list or create a new note" />
        )}
      </section>
      {confirmTrash ? (
        <Modal title="Move note to trash?" onClose={() => setConfirmTrash(null)}>
          <p className="mb-5 text-sm text-slate-400">
            it will stay in trash until purged
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setConfirmTrash(null)}>
              cancel
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                const id = confirmTrash
                setConfirmTrash(null)
                try {
                  await trashItem('notes', id)
                  if (noteId === id) navigate('/notes')
                } catch {
                  toast.error('failed to trash note')
                }
              }}
            >
              move to trash
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function NoteEditor({ note, onTrash }: { note: VaultItem<NotePlain>; onTrash: () => void }) {
  const saveNote = useVault((state) => state.saveNote)
  const [title, setTitle] = useState(note.plain.title)
  const [body, setBody] = useState(note.plain.body)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const schedule = (nextTitle: string, nextBody: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      saveNote(note.id, { title: nextTitle, body: nextBody, edited: Date.now() })
    }, 500)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            schedule(event.target.value, body)
          }}
          placeholder="untitled"
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-white placeholder:text-slate-600 focus:outline-none"
        />
        <SyncBadge sync={note.sync} />
        <button onClick={onTrash} className="btn-ghost px-3 py-1.5 text-xs" title="move to trash">
          🗑
        </button>
      </header>
      <textarea
        value={body}
        onChange={(event) => {
          setBody(event.target.value)
          schedule(title, event.target.value)
        }}
        placeholder="start writing… everything is encrypted before it leaves this device"
        className="min-h-0 flex-1 resize-none bg-transparent px-5 py-4 text-sm leading-relaxed text-slate-200 placeholder:text-slate-600 focus:outline-none"
        spellCheck={false}
      />
    </div>
  )
}
