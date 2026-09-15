import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { store } from './storage'
import type { RefreshResponse } from './types'

export const API_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api/v1' : '/api/v1')

export const sessionExpiredEvent = 'appsuite:session-expired'

const bare = axios.create({ baseURL: API_URL })

export const http = axios.create({ baseURL: API_URL })

let refreshInFlight: Promise<void> | null = null

async function performRefresh(): Promise<void> {
  const refresh = store.get('refresh')
  if (!refresh) throw new Error('no refresh token')
  const { data } = await bare.post<RefreshResponse>('/auth/token/refresh/', { refresh })
  store.set('access', data.access)
  store.set('refresh', data.refresh)
}

export async function ensureAccess(): Promise<void> {
  if (store.get('access')) return
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = null
  })
  await refreshInFlight
}

interface RetriableConfig extends AxiosRequestConfig {
  _retry?: boolean
}

http.interceptors.request.use((config) => {
  const access = store.get('access')
  if (access) config.headers.Authorization = `Bearer ${access}`
  return config
})

http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined
  const url = config?.url ?? ''
  const isAuthCall = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/token/refresh')
  if (error.response?.status === 401 && config && !config._retry && !isAuthCall) {
    config._retry = true
    try {
      refreshInFlight ??= performRefresh().finally(() => {
        refreshInFlight = null
      })
      await refreshInFlight
      config.headers = { ...(config.headers as Record<string, string>), Authorization: `Bearer ${store.get('access')}` }
      return http.request(config)
    } catch {
      store.clearAll()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(sessionExpiredEvent))
      }
    }
  }
  throw error
})

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data
    if (detail && typeof detail === 'object' && 'detail' in detail) {
      const text = (detail as { detail: unknown }).detail
      if (typeof text === 'string' && text) return text
    }
    if (typeof detail === 'string' && detail) return detail
    if (error.response) return `request failed (${error.response.status})`
    return error.message
  }
  if (error instanceof Error) return error.message
  return String(error)
}

export { bare }
