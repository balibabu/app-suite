import { useEffect, type ReactNode } from 'react'
import { useToast } from '../stores/toast'

export function Toaster() {
  const toasts = useToast((state) => state.toasts)
  const dismiss = useToast((state) => state.dismiss)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((toastItem) => (
        <button
          key={toastItem.id}
          onClick={() => dismiss(toastItem.id)}
          className={`glass pointer-events-auto max-w-md cursor-pointer px-4 py-2.5 text-left text-sm shadow-2xl ${
            toastItem.kind === 'error'
              ? 'border-red-400/30 text-red-200'
              : toastItem.kind === 'success'
                ? 'border-emerald-400/30 text-emerald-200'
                : 'text-slate-200'
          }`}
        >
          {toastItem.message}
        </button>
      ))}
    </div>
  )
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-md p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}

export function SyncBadge({ sync }: { sync: 'synced' | 'pending' | 'error' }) {
  if (sync === 'synced') return null
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
        sync === 'pending' ? 'bg-amber-400/15 text-amber-300' : 'bg-red-400/15 text-red-300'
      }`}
    >
      {sync === 'pending' ? 'saving' : 'offline'}
    </span>
  )
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center">
      <div className="text-4xl opacity-60">{icon}</div>
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
