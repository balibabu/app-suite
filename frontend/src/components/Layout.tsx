import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { useVault } from '../stores/vault'
import { toast } from '../stores/toast'
import { formatBytes } from './ui'

const NAV = [
  { to: '/notes', label: 'Notes', icon: '📝' },
  { to: '/tasks', label: 'Tasks', icon: '✓' },
  { to: '/files', label: 'Files', icon: '🗂' },
  { to: '/trash', label: 'Trash', icon: '🗑' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

export default function Layout() {
  const user = useAuth((state) => state.user)
  const logout = useAuth((state) => state.logout)
  const syncAll = useVault((state) => state.syncAll)
  const syncing = useVault((state) => state.syncing)
  const syncError = useVault((state) => state.syncError)
  const navigate = useNavigate()

  useEffect(() => {
    void syncAll()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void syncAll()
    }, 30_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncAll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [syncAll])

  useEffect(() => {
    if (syncError) toast.error(`sync failed: ${syncError}`)
  }, [syncError])

  const used = user?.storage_used ?? 0
  const limit = user?.storage_limit ?? 1
  const pct = Math.min(100, Math.round((used / limit) * 100))

  return (
    <div className="flex h-full">
      <div className="blob top-[-10%] left-[-5%] h-96 w-96 bg-indigo-600/30" />
      <div className="blob right-[-5%] bottom-[-10%] h-96 w-96 bg-violet-600/20" />
      <aside className="glass m-3 mr-0 flex w-60 shrink-0 flex-col gap-1 p-3">
        <div className="mb-4 flex items-center gap-2.5 px-2 pt-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-lg shadow-lg shadow-indigo-950/50">
            🔐
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tracking-tight text-white">AppSuite</p>
            <p className="text-[10px] text-slate-500">end-to-end encrypted</p>
          </div>
          {syncing ? (
            <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" title="syncing" />
          ) : null}
        </div>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? 'bg-white/10 text-white shadow-inner'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`
            }
          >
            <span className="w-5 text-center">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        <div className="mt-auto space-y-3 px-1 pb-1">
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-slate-500">
              <span>storage</span>
              <span>
                {formatBytes(used)} / {formatBytes(limit)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
            <span className="truncate text-xs text-slate-400">@{user?.username ?? ''}</span>
            <button
              onClick={async () => {
                await logout()
                navigate('/auth')
              }}
              className="cursor-pointer text-xs font-semibold text-indigo-300 hover:text-indigo-200"
            >
              lock
            </button>
          </div>
        </div>
      </aside>
      <main className="m-3 min-w-0 flex-1 overflow-hidden">
        <div className="glass flex h-full flex-col overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
