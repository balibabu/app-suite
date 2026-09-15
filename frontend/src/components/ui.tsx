import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useToast } from '../stores/toast'

export function Toaster() {
  const toasts = useToast((state) => state.toasts)
  const dismiss = useToast((state) => state.dismiss)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {toasts.map((toastItem) => {
        const isError = toastItem.kind === 'error'
        const isSuccess = toastItem.kind === 'success'
        return (
          <div
            key={toastItem.id}
            className={`animate-toastIn pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-3.5 shadow-2xl backdrop-blur-2xl ${
              isError
                ? 'border-red-500/30 bg-zinc-900/90'
                : isSuccess
                  ? 'border-emerald-500/30 bg-zinc-900/90'
                  : 'border-amber-500/30 bg-zinc-900/90'
            }`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                isError
                  ? 'border-red-500/25 bg-red-500/10 text-red-400'
                  : isSuccess
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                    : 'border-indigo-500/25 bg-indigo-500/10 text-indigo-400'
              }`}
            >
              {isError ? (
                <AlertCircle className="h-4 w-4" />
              ) : isSuccess ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Info className="h-4 w-4" />
              )}
            </div>
            <p className="text-xs leading-relaxed text-zinc-300">{toastItem.message}</p>
            <button
              onClick={() => dismiss(toastItem.id)}
              className="ml-auto shrink-0 cursor-pointer text-zinc-500 transition hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function Modal({
  icon,
  title,
  subtitle,
  children,
  onClose,
}: {
  icon?: ReactNode
  title: string
  subtitle?: string
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
  return createPortal(
    <div
      className="animate-fadeIn fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-sm border-white/10 bg-zinc-900/95 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          {icon ? <div className="shrink-0">{icon}</div> : null}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
            {subtitle ? <p className="text-xs text-zinc-400">{subtitle}</p> : null}
          </div>
          <button
            onClick={onClose}
            className="ml-auto shrink-0 cursor-pointer rounded-lg border border-white/10 bg-white/5 p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
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
      title={sync === 'pending' ? 'saving…' : 'sync failed'}
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
        sync === 'pending' ? 'animate-pulse bg-amber-400' : 'bg-red-400'
      }`}
    />
  )
}

export function StatusTag({ active }: { active: boolean }) {
  return active ? (
    <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-emerald-400 uppercase">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      Active
    </span>
  ) : null
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-500">
        {icon}
      </div>
      <h4 className="mb-1 text-sm font-semibold text-zinc-300">{title}</h4>
      {hint ? <p className="mb-4 max-w-xs text-xs leading-relaxed text-zinc-500">{hint}</p> : null}
      {action}
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
