import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()

  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [pwOpen, setPwOpen] = useState(false)
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
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <section className="glass p-5">
          <h2 className="mb-4 text-sm font-semibold tracking-wide text-slate-400 uppercase">account</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-slate-500">username</dt>
              <dd className="font-medium text-slate-100">@{user?.username}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">member since</dt>
              <dd className="font-medium text-slate-100">{formatDate(user?.date_joined ?? null)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">storage used</dt>
              <dd className="font-medium text-slate-100">
                {formatBytes(used)} <span className="text-slate-500">of {formatBytes(limit)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">last login</dt>
              <dd className="font-medium text-slate-100">{formatDate(user?.last_login ?? null)}</dd>
            </div>
          </dl>
        </section>

        <section className="glass p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">security</h2>
            <button className="btn-ghost text-xs" onClick={() => setPwOpen(true)}>
              change password
            </button>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            your password derives the key that wraps your vault. changing it re-wraps the key on
            this device and signs out every other session. the server never learns either key.
          </p>
        </section>

        <section className="glass p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
              active sessions
            </h2>
            <div className="flex gap-2">
              <button className="btn-ghost text-xs" onClick={() => void loadSessions()}>
                refresh
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
                revoke all &amp; sign out
              </button>
            </div>
          </div>
          {sessionsLoading ? (
            <p className="py-6 text-center text-xs text-slate-500">loading…</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div key={session.id} className="glass-soft flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-200">
                      {session.device_name || 'unknown device'}
                      {session.current ? (
                        <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          this device
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {session.ip_address ?? 'unknown ip'} · last used {formatDate(session.last_used_at)}
                    </p>
                  </div>
                  {!session.current ? (
                    <button
                      className="btn-danger px-2.5 py-1 text-[11px]"
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
        </section>

        <section className="glass border-red-400/20 p-5">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-red-400/80 uppercase">
            danger zone
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            deleting your account permanently erases every note, task and file — encrypted or
            otherwise. this cannot be undone.
          </p>
          <button className="btn-danger" onClick={() => setDeleteOpen(true)}>
            delete account
          </button>
        </section>
      </div>

      {pwOpen ? <PasswordModal onClose={() => setPwOpen(false)} onSubmit={changePassword} /> : null}
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
    </div>
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
    <Modal title="Change password" onClose={onClose}>
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
          autoFocus
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
        <input
          type="password"
          className="input"
          placeholder="new password (min 8 chars)"
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
        <input
          type="password"
          className="input"
          placeholder="confirm new password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!valid || busy}>
            {busy ? <Spinner /> : null}
            change
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
    <Modal title="Delete account permanently" onClose={onClose}>
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
        <p className="text-xs leading-relaxed text-slate-400">
          type <span className="font-mono text-red-300">delete my data</span> to confirm. all
          encrypted items will be destroyed.
        </p>
        <input
          type="password"
          className="input"
          placeholder="password"
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
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            cancel
          </button>
          <button
            type="submit"
            className="btn-danger"
            disabled={busy || !password || confirmText !== 'delete my data'}
          >
            {busy ? <Spinner /> : null}
            delete forever
          </button>
        </div>
      </form>
    </Modal>
  )
}
