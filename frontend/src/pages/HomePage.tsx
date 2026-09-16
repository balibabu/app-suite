import { useNavigate } from 'react-router-dom'
import { ArrowRight, CheckSquare, FileText, HardDrive, Settings, Trash2 } from 'lucide-react'
import { useVault } from '../stores/vault'
import { StatusTag } from '../components/ui'

const APPS = [
  {
    id: 'notes',
    to: '/notes',
    name: 'Notes & Wiki',
    category: 'Productivity',
    description: 'Markdown notes with live preview, Discord-style spoilers and instant encrypted sync.',
    icon: FileText,
    accent: 'border-indigo-500/30 bg-indigo-500/15 text-indigo-400',
  },
  {
    id: 'tasks',
    to: '/tasks',
    name: 'Tasks & Sprints',
    category: 'Productivity',
    description: 'Checklist boards with lists, due dates and subtask notes — all end-to-end encrypted.',
    icon: CheckSquare,
    accent: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
  },
  {
    id: 'files',
    to: '/files',
    name: 'Cloud Storage',
    category: 'System',
    description: 'Encrypted object storage. Files are sealed in your browser before they ever leave.',
    icon: HardDrive,
    accent: 'border-blue-500/30 bg-blue-500/15 text-blue-400',
  },
  {
    id: 'trash',
    to: '/trash',
    name: 'Trash & Recovery',
    category: 'System',
    description: 'Restore or permanently purge trashed notes, tasks, lists and files.',
    icon: Trash2,
    accent: 'border-zinc-500/30 bg-zinc-500/15 text-zinc-400',
  },
  {
    id: 'settings',
    to: '/settings',
    name: 'System Config',
    category: 'System',
    description: 'Sessions, password rotation and account controls for your vault.',
    icon: Settings,
    accent: 'border-purple-500/30 bg-purple-500/15 text-purple-400',
  },
]

export default function HomePage() {
  const navigate = useNavigate()
  const notes = useVault((state) => state.notes)
  const tasks = useVault((state) => state.tasks)
  const files = useVault((state) => state.files)

  const countFor = (id: string) => {
    if (id === 'notes') return Object.values(notes).filter((note) => !note.deletedAt).length
    if (id === 'tasks') return Object.values(tasks).filter((task) => !task.deletedAt).length
    if (id === 'files') return Object.values(files).filter((file) => !file.deletedAt).length
    return null
  }

  return (
    <section className="animate-fadeIn">
      <div className="mb-6 text-center sm:text-left">
        <h2 className="mb-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Workspace & Applications
        </h2>
        <p className="mx-auto max-w-xl text-sm text-zinc-400 sm:mx-0">
          Every app below stores ciphertext only — the server can never read your notes, tasks or
          files.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
        {APPS.map((app) => {
          const count = countFor(app.id)
          const Icon = app.icon
          return (
            <button
              key={app.id}
              onClick={() => navigate(app.to)}
              className="group relative flex cursor-pointer flex-col justify-between rounded-2xl border border-white/10 bg-zinc-900/55 p-5 text-left transition-[transform,border-color,background-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-zinc-800/60 hover:shadow-2xl hover:shadow-indigo-500/10"
            >
              <div className="mb-4 flex items-start justify-between">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-transform group-hover:scale-110 ${app.accent}`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <StatusTag active />
              </div>

              <div>
                <h3 className="flex items-center gap-2 font-semibold text-zinc-100 transition-colors group-hover:text-indigo-300">
                  {app.name}
                  <ArrowRight className="h-4 w-4 -translate-x-2 text-indigo-400 opacity-0 transition-[transform,opacity] group-hover:translate-x-0 group-hover:opacity-100" />
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">{app.description}</p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-[11px] text-zinc-500">
                <span>{app.category}</span>
                <span>{count !== null ? `${count} items` : 'v1.0'}</span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
