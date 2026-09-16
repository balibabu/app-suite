import { useMemo, useState } from 'react'
import { CheckCircle2, FileText, Folder, HardDrive, ListTodo, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { useVault } from '../stores/vault'
import { toast } from '../stores/toast'
import { EmptyState, formatBytes, formatDate } from '../components/ui'
import type { CollectionKey } from '../lib/types'

interface TrashEntry {
  id: string
  collection: CollectionKey
  kind: 'note' | 'list' | 'task' | 'file' | 'folder' | 'fileFolder'
  label: string
  detail: string
  updatedAt: string
}

const KIND_ICONS = {
  note: FileText,
  task: CheckCircle2,
  list: ListTodo,
  file: HardDrive,
  folder: Folder,
  fileFolder: Folder,
} as const

export default function TrashPage() {
  const folders = useVault((state) => state.folders)
  const fileFolders = useVault((state) => state.fileFolders)
  const notes = useVault((state) => state.notes)
  const lists = useVault((state) => state.lists)
  const tasks = useVault((state) => state.tasks)
  const files = useVault((state) => state.files)
  const restoreItem = useVault((state) => state.restoreItem)
  const purgeItem = useVault((state) => state.purgeItem)
  const [filter, setFilter] = useState<'all' | 'note' | 'task' | 'list' | 'file' | 'folder' | 'fileFolder'>('all')

  const entries = useMemo<TrashEntry[]>(() => {
    const result: TrashEntry[] = []
    for (const folder of Object.values(folders)) {
      if (folder.deletedAt)
        result.push({
          id: folder.id,
          collection: 'folders',
          kind: 'folder',
          label: folder.plain.name,
          detail: 'category',
          updatedAt: folder.deletedAt,
        })
    }
    for (const folder of Object.values(fileFolders)) {
      if (folder.deletedAt)
        result.push({
          id: folder.id,
          collection: 'fileFolders',
          kind: 'fileFolder',
          label: folder.plain.name,
          detail: 'file folder',
          updatedAt: folder.deletedAt,
        })
    }
    for (const note of Object.values(notes)) {
      if (note.deletedAt)
        result.push({
          id: note.id,
          collection: 'notes',
          kind: 'note',
          label: note.plain.title || 'untitled note',
          detail: note.plain.body.slice(0, 80),
          updatedAt: note.deletedAt,
        })
    }
    for (const list of Object.values(lists)) {
      if (list.deletedAt)
        result.push({
          id: list.id,
          collection: 'lists',
          kind: 'list',
          label: list.plain.name,
          detail: 'task list',
          updatedAt: list.deletedAt,
        })
    }
    for (const task of Object.values(tasks)) {
      if (task.deletedAt)
        result.push({
          id: task.id,
          collection: 'tasks',
          kind: 'task',
          label: task.plain.title,
          detail: task.plain.done ? 'completed task' : 'task',
          updatedAt: task.deletedAt,
        })
    }
    for (const file of Object.values(files)) {
      if (file.deletedAt)
        result.push({
          id: file.id,
          collection: 'files',
          kind: 'file',
          label: file.plain.name,
          detail: formatBytes(file.plain.size),
          updatedAt: file.deletedAt,
        })
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [folders, fileFolders, notes, lists, tasks, files])

  const filtered = filter === 'all' ? entries : entries.filter((entry) => entry.kind === filter)

  const emptyTrash = async () => {
    for (const entry of entries) {
      const record = useVault.getState()[entry.collection] as Record<string, unknown>
      if (!(entry.id in record)) continue
      try {
        await purgeItem(entry.collection, entry.id)
      } catch {
        toast.error('failed to purge some items')
        return
      }
    }
  }

  return (
    <section className="animate-fadeIn flex flex-col" style={{ minHeight: '60vh' }}>
      <div className="glass mb-4 flex flex-col gap-3 p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-500/30 bg-zinc-500/15 text-zinc-400">
            <Trash2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Trash & Recovery</h2>
            <p className="text-[11px] text-zinc-500">
              {entries.length} {entries.length === 1 ? 'item' : 'items'} pending permanent removal
            </p>
          </div>
        </div>
        {entries.length > 0 ? (
          <button className="btn-danger shrink-0" onClick={() => void emptyTrash()}>
            empty trash ({entries.length})
          </button>
        ) : null}
      </div>

      <div className="glass border-white/10 bg-zinc-900/30 p-4 sm:p-6">
        <div className="scrollbar-none mb-4 flex items-center gap-1.5 overflow-x-auto">
          {(['all', 'note', 'task', 'list', 'file', 'folder', 'fileFolder'] as const).map((kind) => (
            <button
              key={kind}
              onClick={() => setFilter(kind)}
              className={`shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${
                filter === kind
                  ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
                  : 'border-white/10 bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300'
              }`}
            >
              {kind}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Trash2 className="h-8 w-8" />}
            title="trash is empty"
            hint="deleted items appear here before permanent removal"
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => {
              const Icon = KIND_ICONS[entry.kind]
              return (
                <div
                  key={`${entry.kind}:${entry.id}`}
                  className="glass-soft group flex items-center gap-3 p-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">{entry.label}</p>
                    <p className="truncate text-[11px] text-zinc-500">
                      {entry.kind} · {entry.detail || '—'} · {formatDate(entry.updatedAt)}
                    </p>
                  </div>
                  <button
                    className="btn-ghost shrink-0 px-2.5 py-1.5 text-[11px]"
                    onClick={async () => {
                      try {
                        await restoreItem(entry.collection, entry.id)
                        toast.success('item restored')
                      } catch {
                        toast.error('failed to restore')
                      }
                    }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span className="hidden sm:inline">restore</span>
                  </button>
                  <button
                    className="btn-danger shrink-0 px-2.5 py-1.5 text-[11px]"
                    onClick={async () => {
                      try {
                        await purgeItem(entry.collection, entry.id)
                      } catch {
                        toast.error('failed to delete permanently')
                      }
                    }}
                  >
                    <XCircle className="h-3 w-3" />
                    <span className="hidden sm:inline">delete forever</span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
