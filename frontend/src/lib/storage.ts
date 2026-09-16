const PREFIX = 'appsuite.'

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function session(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function read(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(PREFIX + key) ?? null
  } catch {
    return null
  }
}

function write(storage: Storage | null, key: string, value: string) {
  try {
    storage?.setItem(PREFIX + key, value)
  } catch {
    /* storage unavailable */
  }
}

function remove(storage: Storage | null, key: string) {
  try {
    storage?.removeItem(PREFIX + key)
  } catch {
    /* storage unavailable */
  }
}

export const store = {
  get: (key: string) => read(local(), key),
  set: (key: string, value: string) => write(local(), key, value),
  remove: (key: string) => remove(local(), key),
  sessionGet: (key: string) => read(session(), key),
  sessionSet: (key: string, value: string) => write(session(), key, value),
  sessionRemove: (key: string) => remove(session(), key),
  clearSession() {
    for (const key of ['access', 'refresh']) remove(local(), key)
    remove(session(), 'master')
  },
  clearAll() {
    for (const key of ['access', 'refresh', 'username', 'wrapped', 'pinguard', 'pinuser', 'pindismiss']) remove(local(), key)
    remove(session(), 'master')
  },
}
