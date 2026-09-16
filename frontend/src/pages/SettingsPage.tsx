import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  KeyRound,
  Laptop,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Trash2,
  User,
} from 'lucide-react'
import { http, errorMessage } from '../lib/api'
import { useAuth } from '../stores/auth'
import { useVault } from '../stores/vault'
import { toast } from '../stores/toast'
import { formatBytes, formatDate, Modal, Spinner } from '../components/ui'
import type { SessionInfo } from '../lib/types'

export default function SettingsPage() {
  const user = useAuth((state) => state.user)
  const changePassword = useAuth((state) => state.changePassword)
  const deleteAccount = useAuth((state) => state.deleteAccount)
  const logout = useAuth((state) => state.logout)
  const pinAvailable = useAuth((state) => state.pinAvailable)
  const setPin = useAuth((state) => state.setPin)
  const clearPin = useAuth((state) => state.clearPin)
  const navigate = useNavigate()

  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [pwOpen, setPwOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const { data } = await http.get<SessionInfo[]>('/auth/sessions/')
      setSessions(data)
    } catch {
      toast.error('failed to load sessions')
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  const used = user?.storage_used ?? 0
  const limit = user?.storage_limit ?? 1

  return (
    <section className="animate-fadeIn mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <div className="glass p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/15 text-purple-400">
            <User className="h-5 w-5" />
          </div>
          <h2 className="text-sm font-semibold text-white">account</h2>
        </div>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-white/5 bg-zinc-950/40 px-3.5 py-2.5">
            <dt className="text-[11px] text-zinc-500">username</dt>
            <dd className="font-medium text-zinc-100">@{user?.username}</dd>
          </div>
          <div className="rounded-xl border border-white/5 bg-zinc-950/40 px-3.5 py-2.5">
            <dt className="text-[11px] text-zinc-500">member since</dt>
            <dd className="font-medium text-zinc-100">{formatDate(user?.date_joined ?? null)}</dd>
          </div>
          <div className="rounded-xl border border-white/5 bg-zinc-950/40 px-3.5 py-2.5">
            <dt className="text-[11px] text-zinc-500">storage used</dt>
            <dd className="font-medium text-zinc-100">
              {formatBytes(used)} <span className="text-zinc-500">of {formatBytes(limit)}</span>
            </dd>
          </div>
          <div className="rounded-xl border border-white/5 bg-zinc-950/40 px-3.5 py-2.5">
            <dt className="text-[11px] text-zinc-500">last login</dt>
            <dd className="font-medium text-zinc-100">{formatDate(user?.last_login ?? null)}</dd>
          </div>
        </dl>
      </div>

      <div className="glass p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/15 text-indigo-400">
            <KeyRound className="h-5 w-5" />
          </div>
          <h2 className="flex-1 text-sm font-semibold text-white">security</h2>
          <button className="btn-ghost shrink-0 text-xs" onClick={() => setPwOpen(true)}>
            change password
          </button>
        </div>
        <p className="text-xs leading-relaxed text-zinc-500">
          your password derives the key that wraps your vault. changing it re-wraps the key on this
          device and signs out every other session. the server never learns either key.
        </p>
      </div>

      <div className="glass p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/15 text-indigo-400">
            <KeyRound className="h-5 w-5" />
          </div>
          <h2 className="flex-1 text-sm font-semibold text-white">unlock pin</h2>
          {pinAvailable ? (
            <div className="flex shrink-0 gap-2">
              <button className="btn-ghost text-xs" onClick={() => setPinOpen(true)}>
                change pin
              </button>
              <button
                className="btn-danger px-2.5 py-1 text-[11px]"
                onClick={() => {
                  clearPin()
                  toast.success('pin removed, password required on next visit')
                }}
              >
                remove
              </button>
            </div>
          ) : (
            <button className="btn-ghost shrink-0 text-xs" onClick={() => setPinOpen(true)}>
              set pin
            </button>
          )}
        </div>
        <p className="text-xs leading-relaxed text-zinc-500">
          {pinAvailable
            ? 'this device can unlock your vault with a 4-digit pin instead of your password. the pin re-encrypts your vault key locally — a weaker protection than your password.'
            : 'set a 4-digit pin so revisits on this device ask for the pin instead of your password. the pin re-encrypts your vault key stored locally — weaker than your password.'}
        </p>
      </div>

      <div className="glass p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/15 text-cyan-400">
            <Laptop className="h-5 w-5" />
          </div>
          <h2 className="flex-1 text-sm font-semibold text-white">active sessions</h2>
          <div className="flex shrink-0 gap-2">
            <button className="btn-ghost px-2.5 text-xs" onClick={() => void loadSessions()}>
              <RefreshCw className={`h-3 w-3 ${sessionsLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">refresh</span>
            </button>
            <button
              className="btn-ghost text-xs"
              onClick={async () => {
                try {
                  await http.post('/auth/logout-all/')
                  await logout()
                  navigate('/auth')
                } catch {
                  toast.error('failed to revoke sessions')
                }
              }}
            >
              <LogOut className="h-3 w-3" />
              <span className="hidden sm:inline">revoke all</span>
            </button>
          </div>
        </div>
        {sessionsLoading ? (
          <p className="py-6 text-center text-xs text-zinc-500">loading…</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div key={session.id} className="glass-soft flex items-center gap-3 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-xs font-medium text-zinc-200">
                    {session.device_name || 'unknown device'}
                    {session.current ? (
                      <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        this device
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {session.ip_address ?? 'unknown ip'} · last used {formatDate(session.last_used_at)}
                  </p>
                </div>
                {!session.current ? (
                  <button
                    className="btn-danger shrink-0 px-2.5 py-1 text-[11px]"
                    onClick={async () => {
                      try {
                        await http.delete(`/auth/sessions/${session.id}/`)
                        setSessions((prev) => prev.filter((item) => item.id !== session.id))
                      } catch {
                        toast.error('failed to revoke session')
                      }
                    }}
                  >
                    revoke
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass border-red-500/20 p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 text-red-400">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h2 className="text-sm font-semibold text-red-400/90">danger zone</h2>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-zinc-500">
          deleting your account permanently erases every note, task and file — encrypted or
          otherwise. this cannot be undone.
        </p>
        <button className="btn-danger" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-3.5 w-3.5" />
          delete account
        </button>
      </div>

      {pwOpen ? <PasswordModal onClose={() => setPwOpen(false)} onSubmit={changePassword} /> : null}
      {pinOpen ? (
        <PinModal
          hasPin={pinAvailable}
          onClose={() => setPinOpen(false)}
          onSubmit={async (pin) => {
            await setPin(pin)
            toast.success('pin saved')
          }}
        />
      ) : null}
      {deleteOpen ? (
        <DeleteAccountModal
          onClose={() => setDeleteOpen(false)}
          onSubmit={async (password) => {
            await deleteAccount(password)
            useVault.getState().reset()
            navigate('/auth')
          }}
        />
      ) : null}
    </section>
  )
}

function PasswordModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (current: string, next: string) => Promise<void>
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = current.length > 0 && next.length >= 8 && next === confirm

  return (
    <Modal
      title="Change password"
      subtitle="re-wraps your vault key"
      icon={
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-400">
          <KeyRound className="h-5 w-5" />
        </div>
      }
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!valid) return
          setBusy(true)
          setError(null)
          try {
            await onSubmit(current, next)
            toast.success('password changed, other sessions signed out')
            onClose()
          } catch (err) {
            setError(errorMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        <input
          type="password"
          className="input"
          placeholder="current password"
          autoComplete="current-password"
          autoFocus
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
        <input
          type="password"
          className="input"
          placeholder="new password (min 8 chars)"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
        <input
          type="password"
          className="input"
          placeholder="confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>
            cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!valid || busy}>
            {busy ? <Spinner className="h-3 w-3" /> : null}
            change
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PinModal({
  hasPin,
  onClose,
  onSubmit,
}: {
  hasPin: boolean
  onClose: () => void
  onSubmit: (pin: string) => Promise<void>
}) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = /^\d{4}$/.test(pin) && pin === confirm

  return (
    <Modal
      title={hasPin ? 'Change unlock pin' : 'Set unlock pin'}
      subtitle="works only on this device"
      icon={
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-400">
          <KeyRound className="h-5 w-5" />
        </div>
      }
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!valid) return
          setBusy(true)
          setError(null)
          try {
            await onSubmit(pin)
            onClose()
          } catch (err) {
            setError(errorMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        <p className="text-xs leading-relaxed text-zinc-400">
          Your vault key will be stored on this device encrypted with this pin. Next visit only
          asks for the pin — use "forgot pin" if you ever need your password instead.
        </p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          className="input text-center font-mono tracking-[0.5em]"
          placeholder="new pin"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          autoFocus
        />
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          className="input text-center font-mono tracking-[0.5em]"
          placeholder="confirm pin"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value.replace(/\D/g, '').slice(0, 4))}
        />
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>
            cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!valid || busy}>
            {busy ? <Spinner className="h-3 w-3" /> : null}
            save pin
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteAccountModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (password: string) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal
      title="Delete account permanently"
      icon={
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 text-red-400">
          <ShieldAlert className="h-5 w-5" />
        </div>
      }
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError(null)
          try {
            await onSubmit(password)
            onClose()
          } catch (err) {
            setError(errorMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        <p className="text-xs leading-relaxed text-zinc-400">
          type <span className="font-mono text-red-300">delete my data</span> to confirm. all
          encrypted items will be destroyed.
        </p>
        <input
          type="password"
          className="input"
          placeholder="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <input
          className="input"
          placeholder="delete my data"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
        />
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>
            cancel
          </button>
          <button
            type="submit"
            className="btn-danger"
            disabled={busy || !password || confirmText !== 'delete my data'}
          >
            {busy ? <Spinner className="h-3 w-3" /> : null}
            delete forever
          </button>
        </div>
      </form>
    </Modal>
  )
}
