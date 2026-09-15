import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { FileText, CheckSquare, HardDrive, Trash2, Settings, LayoutGrid } from 'lucide-react'
import { useAuth } from '../stores/auth'
import { useVault } from '../stores/vault'
import { toast } from '../stores/toast'

const NAV = [
  { to: '/', label: 'Suite', icon: LayoutGrid },
  { to: '/notes', label: 'Notes', icon: FileText },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/files', label: 'Files', icon: HardDrive },
  { to: '/trash', label: 'Trash', icon: Trash2 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function useClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])
  return time
}

export default function Layout() {
  const user = useAuth((state) => state.user)
  const logout = useAuth((state) => state.logout)
  const syncAll = useVault((state) => state.syncAll)
  const syncing = useVault((state) => state.syncing)
  const syncError = useVault((state) => state.syncError)
  const navigate = useNavigate()
  const clock = useClock()

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

  const initials = (user?.username ?? 'a').slice(0, 2).toUpperCase()

  return (
    <div className="relative flex min-h-full flex-col">
      <div className="orb -top-[15%] -left-[10%] h-[500px] w-[500px] bg-indigo-600/15 blur-[120px]" />
      <div className="orb top-[40%] -right-[15%] h-[600px] w-[600px] bg-violet-600/15 blur-[140px]" />
      <div className="orb -bottom-[10%] left-[20%] h-[500px] w-[500px] bg-cyan-600/10 blur-[130px]" />

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-zinc-950/60 px-4 py-3.5 backdrop-blur-xl sm:px-8">
        <button
          onClick={() => navigate('/')}
          title="suite home"
          className="flex cursor-pointer items-center gap-3"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/20">
            <LayoutGrid className="h-5 w-5 text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-sm font-semibold tracking-wide text-zinc-100">AetherSuite</h1>
            <p className="text-[11px] text-zinc-400">encrypted workspace</p>
          </div>
        </button>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <span className="font-mono text-xs font-medium text-zinc-300">{clock}</span>
            <div className="flex items-center justify-end gap-1.5 text-[10px] text-emerald-400">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  syncError ? 'bg-red-400' : syncing ? 'animate-pulse bg-amber-400' : 'animate-pulse bg-emerald-400'
                }`}
              />
              {syncError ? 'sync error' : syncing ? 'syncing' : 'system online'}
            </div>
          </div>
          <button
            onClick={async () => {
              await logout()
              navigate('/auth')
            }}
            title={`lock @${user?.username ?? ''}`}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-zinc-900/80 text-xs font-medium text-zinc-300 transition hover:border-indigo-500/50 hover:text-white"
          >
            {initials}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-3 pb-24 sm:px-8 sm:py-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-zinc-950/80 px-2 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-2xl sm:hidden">
        <div className="flex items-center justify-around">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium transition ${
                  isActive ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
