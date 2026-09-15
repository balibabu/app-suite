import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, Lock, ShieldCheck } from 'lucide-react'
import { useAuth } from '../stores/auth'
import { store } from '../lib/storage'
import { Spinner } from '../components/ui'

type Mode = 'login' | 'register' | 'unlock'

export default function AuthPage() {
  const status = useAuth((state) => state.status)
  const busy = useAuth((state) => state.busy)
  const error = useAuth((state) => state.error)
  const login = useAuth((state) => state.login)
  const register = useAuth((state) => state.register)
  const unlock = useAuth((state) => state.unlock)
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  useEffect(() => {
    if (status === 'locked') setMode('unlock')
    if (status === 'unlocked') navigate('/', { replace: true })
  }, [status, navigate])

  useEffect(() => {
    if (status === 'locked') {
      const stored = store.get('username')
      if (stored) setUsername(stored)
    }
  }, [status])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      if (mode === 'login') await login(username, password)
      else if (mode === 'register') await register(username, password)
      else await unlock(password)
      navigate('/', { replace: true })
    } catch {
      /* error surfaced via store */
    }
  }

  if (status === 'boot') {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6 text-indigo-400" />
      </div>
    )
  }

  const title =
    mode === 'register' ? 'Create your vault' : mode === 'unlock' ? 'Vault locked' : 'Welcome back'
  const subtitle =
    mode === 'register'
      ? 'Your password never leaves this device. It cannot be recovered if lost.'
      : mode === 'unlock'
        ? `Re-enter your password to unlock @${username}'s vault.`
        : 'Zero-knowledge login — the server never sees your password.'

  const usernameValid = /^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username.trim().toLowerCase())
  const passwordValid = password.length >= 8
  const confirmValid = mode !== 'register' || password === confirm
  const canSubmit =
    !busy &&
    (mode === 'unlock' ? password.length > 0 : usernameValid && passwordValid && confirmValid)

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden p-4">
      <div className="orb -top-[15%] -left-[10%] h-[500px] w-[500px] bg-indigo-600/15 blur-[120px]" />
      <div className="orb top-[40%] -right-[15%] h-[600px] w-[600px] bg-violet-600/15 blur-[140px]" />
      <div className="orb -bottom-[10%] left-[20%] h-[500px] w-[500px] bg-cyan-600/10 blur-[130px]" />

      <div className="glass w-full max-w-md p-7 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/20">
            <LayoutGrid className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">AetherSuite</h1>
            <p className="text-[11px] text-zinc-400">notes · tasks · files, end-to-end encrypted</p>
          </div>
        </div>

        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3.5 py-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-400" />
          <p className="text-[11px] leading-relaxed text-zinc-400">
            SRP-6a authentication with a wrapped vault key — plaintext never touches the wire.
          </p>
        </div>

        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 mb-6 text-xs leading-relaxed text-zinc-400">{subtitle}</p>

        <form onSubmit={submit} className="space-y-4">
          {mode !== 'unlock' ? (
            <div>
              <label className="label" htmlFor="username">
                username
              </label>
              <input
                id="username"
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value.toLowerCase())}
                placeholder="lowercase letters, digits, . - _"
                autoComplete="username"
                autoFocus
              />
              {mode === 'register' && username.length > 0 && !usernameValid ? (
                <p className="mt-1.5 text-xs text-amber-400">
                  3–32 chars: a–z, 0–9, dot, dash, underscore
                </p>
              ) : null}
            </div>
          ) : null}
          <div>
            <label className="label" htmlFor="password">
              password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'register' ? 'at least 8 characters' : ''}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              autoFocus={mode === 'unlock'}
            />
          </div>
          {mode === 'register' ? (
            <div>
              <label className="label" htmlFor="confirm">
                confirm password
              </label>
              <input
                id="confirm"
                type="password"
                className="input"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
              />
              {confirm.length > 0 && !confirmValid ? (
                <p className="mt-1.5 text-xs text-amber-400">passwords do not match</p>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn-primary w-full py-2.5 text-sm" disabled={!canSubmit}>
            {busy ? <Spinner /> : null}
            {mode === 'register' ? 'Create account' : mode === 'unlock' ? 'Unlock' : 'Sign in'}
          </button>
        </form>

        {mode !== 'unlock' ? (
          <p className="mt-6 text-center text-xs text-zinc-500">
            {mode === 'login' ? "don't have a vault? " : 'already have a vault? '}
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setPassword('')
                setConfirm('')
              }}
              className="cursor-pointer font-semibold text-indigo-400 hover:text-indigo-300"
            >
              {mode === 'login' ? 'create one' : 'sign in'}
            </button>
          </p>
        ) : (
          <button
            onClick={async () => {
              await useAuth.getState().logout()
            }}
            className="mt-6 flex w-full cursor-pointer items-center justify-center gap-1.5 text-center text-xs text-zinc-500 transition hover:text-zinc-300"
          >
            <Lock className="h-3 w-3" />
            sign in as a different user
          </button>
        )}
      </div>
    </div>
  )
}
