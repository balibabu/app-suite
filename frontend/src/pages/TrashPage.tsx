import { useMemo, useState } from 'react'
import { useVault } from '../stores/vault'
import { toast } from '../stores/toast'
import { EmptyState, formatBytes } from '../components/ui'
import type { CollectionKey } from '../lib/types'

interface TrashEntry {
  id: string
  collection: CollectionKey
  kind: 'note' | 'list' | 'task' | 'file'
  label: string
  detail: string
  updatedAt: string
}

export default function TrashPage() {
  const notes = useVault((state) => state.notes)
  const lists = useVault((state) => state.lists)
  const tasks = useVault((state) => state.tasks)
  const files = useVault((state) => state.files)
  const restoreItem = useVault((state) => state.restoreItem)
  const purgeItem = useVault((state) => state.purgeItem)
  const [filter, setFilter] = useState<'all' | 'note' | 'task' | 'list' | 'file'>('all')

  const entries = useMemo<TrashEntry[]>(() => {
    const result: TrashEntry[] = []
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
  }, [notes, lists, tasks, files])

  const filtered = filter === 'all' ? entries : entries.filter((entry) => entry.kind === filter)

  const emptyTrash = async () => {
    for (const entry of entries) {
      try {
        await purgeItem(entry.collection, entry.id)
      } catch {
        toast.error('failed to purge some items')
        return
      }
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-white/5 p-4">
        {(['all', 'note', 'task', 'list', 'file'] as const).map((kind) => (
          <button
            key={kind}
            onClick={() => setFilter(kind)}
            className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === kind ? 'bg-white/10 text-white' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
            }`}
          >
            {kind}
          </button>
        ))}
        <span className="flex-1" />
        {entries.length > 0 ? (
          <button className="btn-danger text-xs" onClick={emptyTrash}>
            empty trash ({entries.length})
          </button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <EmptyState icon="🗑" title="trash is empty" hint="deleted items appear here before permanent removal" />
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => (
              <div key={`${entry.kind}:${entry.id}`} className="glass-soft flex items-center gap-3 p-3">
                <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                  {entry.kind}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{entry.label}</p>
                  <p className="truncate text-xs text-slate-500">{entry.detail}</p>
                </div>
                <button
                  className="btn-ghost px-3 py-1.5 text-xs"
                  onClick={async () => {
                    try {
                      await restoreItem(entry.collection, entry.id)
                    } catch {
                      toast.error('failed to restore')
                    }
                  }}
                >
                  restore
                </button>
                <button
                  className="btn-danger px-3 py-1.5 text-xs"
                  onClick={async () => {
                    try {
                      await purgeItem(entry.collection, entry.id)
                    } catch {
                      toast.error('failed to delete permanently')
                    }
                  }}
                >
                  delete forever
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
