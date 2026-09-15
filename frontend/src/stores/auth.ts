import { create } from 'zustand'
import { bare, errorMessage, ensureAccess, http } from '../lib/api'
import { toHex, randomBytes, fromB64, toB64 } from '../lib/bytes'
import { deriveVerifier, clientEphemeral, clientSession } from '../lib/srp'
import {
  generateIdentity,
  generateMasterKey,
  importMasterKey,
  unwrapVault,
  wrapVault,
} from '../lib/crypto'
import { store } from '../lib/storage'
import type { LoginResponse, Me, Tokens } from '../lib/types'

export type AuthStatus = 'boot' | 'anonymous' | 'locked' | 'unlocked'

function deviceName(): string {
  if (typeof navigator === 'undefined') return 'web'
  return navigator.userAgent.slice(0, 128) || 'web'
}

function persistTokens(access: string, refresh: string) {
  store.set('access', access)
  store.set('refresh', refresh)
}

async function finishLogin(user: Me, tokens: Tokens, saltHex: string, password: string) {
  const { master } = await unwrapVault(password, saltHex, user.wrapped_private_key)
  persistTokens(tokens.access, tokens.refresh)
  store.set('username', user.username)
  store.set('wrapped', user.wrapped_private_key)
  store.sessionSet('master', toB64(master))
  const key = await importMasterKey(master)
  return { user, key, master }
}

interface AuthState {
  status: AuthStatus
  user: Me | null
  masterKey: CryptoKey | null
  busy: boolean
  error: string | null
  boot: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  unlock: (password: string) => Promise<void>
  logout: () => Promise<void>
  forceExpired: () => void
  refreshMe: () => Promise<void>
  changePassword: (current: string, next: string) => Promise<void>
  deleteAccount: (password: string) => Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'boot',
  user: null,
  masterKey: null,
  busy: false,
  error: null,

  async boot() {
    const refresh = store.get('refresh')
    const masterB64 = store.sessionGet('master')
    if (!refresh) {
      set({ status: 'anonymous' })
      return
    }
    if (masterB64) {
      try {
        const key = await importMasterKey(fromB64(masterB64))
        await ensureAccess()
        const { data } = await http.get<Me>('/auth/me/')
        set({ status: 'unlocked', masterKey: key, user: data })
        store.set('wrapped', data.wrapped_private_key)
        return
      } catch {
        store.clearAll()
        set({ status: 'anonymous' })
        return
      }
    }
    set({ status: 'locked' })
  },

  async login(username, password) {
    set({ busy: true, error: null })
    try {
      const normalized = username.trim().toLowerCase()
      const { data: challenge } = await bare.post('/auth/login/challenge/', {
        username: normalized,
        purpose: 'login',
      })
      const ephemeral = await clientEphemeral()
      const session = await clientSession(
        ephemeral.private,
        challenge.server_public_ephemeral,
        challenge.srp_salt,
        normalized,
        password,
      )
      const { data } = await bare.post<LoginResponse>('/auth/login/', {
        srp_session_id: challenge.srp_session_id,
        client_public_ephemeral: ephemeral.publicHex,
        client_proof: session.clientProofHex,
        device_name: deviceName(),
      })
      if (data.server_proof.toLowerCase() !== session.serverProofHex.toLowerCase()) {
        throw new Error('server proof verification failed')
      }
      const result = await finishLogin(data.user, data, challenge.srp_salt, password)
      set({ status: 'unlocked', user: result.user, masterKey: result.key, busy: false, error: null })
    } catch (error) {
      set({ busy: false, error: errorMessage(error) })
      throw error
    }
  },

  async register(username, password) {
    set({ busy: true, error: null })
    try {
      const normalized = username.trim().toLowerCase()
      const saltHex = toHex(randomBytes(16))
      const verifier = await deriveVerifier(saltHex, normalized, password)
      const master = generateMasterKey()
      const identity = await generateIdentity()
      const wrapped = await wrapVault(password, saltHex, master, identity.privatePkcs8B64)
      const { data } = await bare.post<LoginResponse>('/auth/register/', {
        username: normalized,
        srp_salt: saltHex,
        srp_verifier: verifier,
        identity_public_key: identity.publicHex,
        wrapped_private_key: wrapped,
        device_name: deviceName(),
      })
      const result = await finishLogin(data.user, data, saltHex, password)
      set({ status: 'unlocked', user: result.user, masterKey: result.key, busy: false, error: null })
    } catch (error) {
      set({ busy: false, error: errorMessage(error) })
      throw error
    }
  },

  async unlock(password) {
    set({ busy: true, error: null })
    try {
      const username = store.get('username') ?? ''
      if (!username) throw new Error('no cached account')
      const { data: challenge } = await bare.post('/auth/login/challenge/', {
        username,
        purpose: 'login',
      })
      const { master } = await unwrapVault(password, challenge.srp_salt, store.get('wrapped') ?? '')
      const key = await importMasterKey(master)
      store.sessionSet('master', toB64(master))
      set({ status: 'unlocked', masterKey: key, busy: false, error: null })
      await ensureAccess()
      const { data } = await http.get<Me>('/auth/me/')
      set({ user: data })
      store.set('wrapped', data.wrapped_private_key)
    } catch (error) {
      const message = errorMessage(error)
      set({ busy: false, error: message.includes('decrypt') || message.includes('vault') ? 'wrong password' : message })
      throw error
    }
  },

  async logout() {
    try {
      await http.post('/auth/logout/', { refresh: store.get('refresh') ?? '' })
    } catch {
      /* session may already be dead */
    }
    store.clearAll()
    set({ status: 'anonymous', user: null, masterKey: null, error: null })
  },

  forceExpired() {
    store.clearAll()
    set({ status: 'anonymous', user: null, masterKey: null })
  },

  async refreshMe() {
    const { data } = await http.get<Me>('/auth/me/')
    set({ user: data })
    store.set('wrapped', data.wrapped_private_key)
  },

  async changePassword(current, next) {
    const username = get().user?.username ?? store.get('username') ?? ''
    const { data: challenge } = await bare.post('/auth/login/challenge/', {
      username,
      purpose: 'reauth',
    })
    const ephemeral = await clientEphemeral()
    const session = await clientSession(
      ephemeral.private,
      challenge.server_public_ephemeral,
      challenge.srp_salt,
      username,
      current,
    )
    const masterB64 = store.sessionGet('master')
    if (!masterB64) throw new Error('vault is locked')
    const newSalt = toHex(randomBytes(16))
    const newVerifier = await deriveVerifier(newSalt, username, next)
    const newWrapped = await wrapVault(next, newSalt, fromB64(masterB64))
    await http.post('/auth/password/change/', {
      srp_session_id: challenge.srp_session_id,
      client_public_ephemeral: ephemeral.publicHex,
      client_proof: session.clientProofHex,
      new_srp_salt: newSalt,
      new_srp_verifier: newVerifier,
      new_wrapped_private_key: newWrapped,
    })
    store.set('wrapped', newWrapped)
  },

  async deleteAccount(password) {
    const username = get().user?.username ?? store.get('username') ?? ''
    const { data: challenge } = await bare.post('/auth/login/challenge/', {
      username,
      purpose: 'reauth',
    })
    const ephemeral = await clientEphemeral()
    const session = await clientSession(
      ephemeral.private,
      challenge.server_public_ephemeral,
      challenge.srp_salt,
      username,
      password,
    )
    await http.post('/auth/account/', {
      srp_session_id: challenge.srp_session_id,
      client_public_ephemeral: ephemeral.publicHex,
      client_proof: session.clientProofHex,
    })
    store.clearAll()
    set({ status: 'anonymous', user: null, masterKey: null, error: null })
  },
}))
