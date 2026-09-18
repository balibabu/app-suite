import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Info, Pencil } from 'lucide-react'
import { Modal } from './ui'

export interface MenuAction {
  key: string
  label: string
  icon: typeof Pencil
  danger?: boolean
  hidden?: boolean
  onSelect: () => void
}

export function ItemMenu({ actions, className = '' }: { actions: MenuAction[]; className?: string }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const visible = actions.filter((action) => !action.hidden)

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        title="more actions"
        aria-label="more actions"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/10 hover:text-white ${
          open ? 'opacity-100 bg-white/10 text-white' : 'opacity-0 group-hover:opacity-100 no-hover:opacity-100'
        }`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open ? (
        <div
          onClick={(event) => event.stopPropagation()}
          className="animate-fadeIn absolute top-full right-0 z-30 mt-1 w-40 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 p-1 shadow-2xl backdrop-blur-md"
        >
          {visible.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.key}
                onClick={(event) => {
                  event.stopPropagation()
                  setOpen(false)
                  action.onSelect()
                }}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition ${
                  action.danger
                    ? 'text-red-400 hover:bg-red-500/15'
                    : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {action.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function buildFolderPath(
  folders: Record<string, { plain: { name: string }; parent: string | null }>,
  id: string | null,
): string {
  const parts: string[] = []
  let current = id ? folders[id] : undefined
  while (current) {
    parts.unshift(current.plain.name)
    current = current.parent ? folders[current.parent] : undefined
  }
  return ['root', ...parts].join(' / ')
}

export interface PropertyRow {
  label: string
  value: ReactNode
}

export function PropertiesModal({
  name,
  rows,
  onClose,
}: {
  name: string
  rows: PropertyRow[]
  onClose: () => void
}) {
  return (
    <Modal
      title="Properties"
      subtitle={name}
      icon={
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-400">
          <Info className="h-5 w-5" />
        </div>
      }
      onClose={onClose}
    >
      <dl className="mb-5 space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 text-xs">
            <dt className="shrink-0 text-zinc-500">{row.label}</dt>
            <dd className="min-w-0 truncate text-right font-mono text-zinc-300" title={typeof row.value === 'string' ? row.value : undefined}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex justify-end">
        <button className="btn-ghost" onClick={onClose}>
          close
        </button>
      </div>
    </Modal>
  )
}
