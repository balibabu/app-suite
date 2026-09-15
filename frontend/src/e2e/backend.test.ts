import { describe, expect, it } from 'vitest'
import { clientEphemeral, clientSession, deriveVerifier } from '../lib/srp'
import {
  decryptBlob,
  decryptBytes,
  encryptBlob,
  encryptBytes,
  generateIdentity,
  generateMasterKey,
  importMasterKey,
  unwrapVault,
  wrapVault,
} from '../lib/crypto'
import { randomBytes, toB64, toHex } from '../lib/bytes'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8000/api/v1'

let backendUp = false
try {
  const probe = await fetch(`${BASE}/health/`)
  backendUp = probe.ok
} catch {
  backendUp = false
}

const USERNAME = `e2e_${Math.random().toString(36).slice(2, 10)}`
const PASSWORD = 'e2e secret password 42'

interface Ctx {
  username: string
  password: string
  salt: string
  master: Uint8Array<ArrayBuffer>
  key: CryptoKey
  access: string
  refresh: string
  refresh2: string
  wrapped: string
}

const ctx: Partial<Ctx> = {}

async function api(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  raw?: ArrayBuffer,
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {}
  if (body !== undefined && !raw) headers['Content-Type'] = 'application/json'
  if (raw) headers['Content-Type'] = 'application/octet-stream'
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })
  const text = await response.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: response.status, data }
}

async function srpLogin(username: string, password: string) {
  const challenge = await api('POST', '/auth/login/challenge/', { username, purpose: 'login' })
  expect(challenge.status).toBe(200)
  const ephemeral = await clientEphemeral()
  const session = await clientSession(
    ephemeral.private,
    challenge.data.server_public_ephemeral,
    challenge.data.srp_salt,
    username,
    password,
  )
  const verify = await api('POST', '/auth/login/', {
    srp_session_id: challenge.data.srp_session_id,
    client_public_ephemeral: ephemeral.publicHex,
    client_proof: session.clientProofHex,
    device_name: 'e2e-test',
  })
  return { session, challenge, verify }
}

describe.runIf(() => backendUp)('live backend end-to-end', () => {
  it('registers a vault account', async () => {
    const salt = toHex(randomBytes(16))
    const verifier = await deriveVerifier(salt, USERNAME, PASSWORD)
    const master = generateMasterKey()
    const identity = await generateIdentity()
    const wrapped = await wrapVault(PASSWORD, salt, master, identity.privatePkcs8B64)
    const response = await api('POST', '/auth/register/', {
      username: USERNAME,
      srp_salt: salt,
      srp_verifier: verifier,
      identity_public_key: identity.publicHex,
      wrapped_private_key: wrapped,
      device_name: 'e2e-test',
    })
    expect(response.status).toBe(201)
    expect(response.data.access).toBeTruthy()
    expect(response.data.user.username).toBe(USERNAME)
    expect(response.data.user.wrapped_private_key).toBe(wrapped)
    const unlocked = await unwrapVault(PASSWORD, salt, response.data.user.wrapped_private_key)
    expect(toB64(unlocked.master)).toBe(toB64(master))
    Object.assign(ctx, {
      username: USERNAME,
      password: PASSWORD,
      salt,
      master,
      key: await importMasterKey(master),
      access: response.data.access,
      refresh: response.data.refresh,
      wrapped,
    })
  })

  it('rejects duplicate usernames', async () => {
    const response = await api('POST', '/auth/register/', {
      username: USERNAME,
      srp_salt: toHex(randomBytes(16)),
      srp_verifier: await deriveVerifier(toHex(randomBytes(16)), USERNAME, PASSWORD),
      identity_public_key: toHex(randomBytes(32)),
    })
    expect(response.status).toBe(409)
  })

  it('logs in via SRP-6a with server proof verification', async () => {
    const { session, verify } = await srpLogin(USERNAME, PASSWORD)
    expect(verify.status).toBe(200)
    expect(verify.data.server_proof.toLowerCase()).toBe(session.serverProofHex.toLowerCase())
    ctx.refresh2 = verify.data.refresh
  })

  it('rejects a wrong password without leaking proofs', async () => {
    const { verify } = await srpLogin(USERNAME, 'totally wrong')
    expect(verify.status).toBe(401)
  })

  it('rotates refresh tokens and detects reuse', async () => {
    const rotated = await api('POST', '/auth/token/refresh/', { refresh: ctx.refresh })
    expect(rotated.status).toBe(200)
    expect(rotated.data.refresh).toBeTruthy()
    ctx.access = rotated.data.access
    const replay = await api('POST', '/auth/token/refresh/', { refresh: ctx.refresh })
    expect(replay.status).toBe(401)
    const afterReuse = await api('POST', '/auth/token/refresh/', { refresh: rotated.data.refresh })
    expect(afterReuse.status).toBe(401)
    const relogin = await srpLogin(USERNAME, PASSWORD)
    expect(relogin.verify.status).toBe(200)
    ctx.access = relogin.verify.data.access
    ctx.refresh = relogin.verify.data.refresh
  })

  it('creates, reads and updates encrypted notes', async () => {
    const noteId = crypto.randomUUID()
    const plain = { title: 'secret note', body: 'the eagle lands at dawn', edited: Date.now() }
    const blob = await encryptBlob(ctx.key!, JSON.stringify(plain))
    const created = await api('PUT', `/notes/${noteId}/`, { format_version: 1, content: blob }, ctx.access)
    expect(created.status).toBe(201)

    const list = await api('GET', '/notes/', undefined, ctx.access)
    expect(list.status).toBe(200)
    const fetched = list.data.find((item: any) => item.id === noteId)
    expect(fetched).toBeTruthy()
    expect(JSON.parse(await decryptBlob(ctx.key!, fetched.content))).toEqual(plain)

    const conflict = await api(
      'PUT',
      `/notes/${noteId}/`,
      { format_version: 1, content: await encryptBlob(ctx.key!, 'stale'), base_version: fetched.item_version + 5 },
      ctx.access,
    )
    expect(conflict.status).toBe(409)
    expect(conflict.data.code).toBe('version_conflict')
    expect(conflict.data.current.id).toBe(noteId)

    const forced = await api(
      'PUT',
      `/notes/${noteId}/`,
      { format_version: 1, content: await encryptBlob(ctx.key!, JSON.stringify({ ...plain, body: 'updated' })) },
      ctx.access,
    )
    expect(forced.status).toBe(200)
    expect(forced.data.item_version).toBeGreaterThan(fetched.item_version)

    const delta = await api(
      'GET',
      `/notes/?updated_since=${encodeURIComponent(new Date(0).toISOString())}`,
      undefined,
      ctx.access,
    )
    expect(delta.status).toBe(200)
    expect(delta.data.some((item: any) => item.id === noteId)).toBe(true)
  })

  it('manages task lists and tasks with encrypted content', async () => {
    const listId = crypto.randomUUID()
    const listBlob = await encryptBlob(ctx.key!, JSON.stringify({ name: 'groceries' }))
    const createdList = await api('PUT', `/tasks/lists/${listId}/`, { format_version: 1, content: listBlob }, ctx.access)
    expect(createdList.status).toBe(201)

    const taskId = crypto.randomUUID()
    const taskBlob = await encryptBlob(ctx.key!, JSON.stringify({ title: 'oat milk', done: false, notes: '', due: null }))
    const createdTask = await api(
      'PUT',
      `/tasks/tasks/${taskId}/`,
      { format_version: 1, content: taskBlob, task_list: listId },
      ctx.access,
    )
    expect(createdTask.status).toBe(201)
    expect(createdTask.data.task_list).toBe(listId)

    const filtered = await api('GET', `/tasks/tasks/?task_list=${listId}`, undefined, ctx.access)
    expect(filtered.status).toBe(200)
    expect(filtered.data).toHaveLength(1)
    const parsed = JSON.parse(await decryptBlob(ctx.key!, filtered.data[0].content))
    expect(parsed.title).toBe('oat milk')
  })

  it('uploads and downloads encrypted file content', async () => {
    const fileId = crypto.randomUUID()
    const bytes = randomBytes(4096)
    const meta = { name: 'report.pdf', mime: 'application/pdf', size: bytes.length, uploaded: Date.now() }
    const metaBlob = await encryptBlob(ctx.key!, JSON.stringify(meta))
    const created = await api(
      'POST',
      '/files/',
      { id: fileId, meta_ciphertext: metaBlob, format_version: 1 },
      ctx.access,
    )
    expect(created.status).toBe(201)

    const encrypted = await encryptBytes(ctx.key!, bytes)
    const uploaded = await api('PUT', `/files/${fileId}/content/`, undefined, ctx.access, encrypted.buffer as ArrayBuffer)
    expect(uploaded.status).toBe(200)
    expect(uploaded.data.stored).toBe(true)
    expect(uploaded.data.size).toBe(encrypted.length)

    const again = await api('PUT', `/files/${fileId}/content/`, undefined, ctx.access, encrypted.buffer as ArrayBuffer)
    expect(again.status).toBe(409)
    expect(again.data.code).toBe('content_exists')

    const downloaded = await fetch(`${BASE}/files/${fileId}/content/`, {
      headers: { Authorization: `Bearer ${ctx.access}` },
    })
    expect(downloaded.status).toBe(200)
    const storedBytes = new Uint8Array(await downloaded.arrayBuffer())
    expect(storedBytes.length).toBe(encrypted.length)
    expect(await decryptBytes(ctx.key!, storedBytes)).toEqual(bytes)

    const me = await api('GET', '/auth/me/', undefined, ctx.access)
    expect(me.status).toBe(200)
    expect(me.data.storage_used).toBeGreaterThanOrEqual(encrypted.length)
  })

  it('trashes, restores and purges items', async () => {
    const noteId = crypto.randomUUID()
    const blob = await encryptBlob(ctx.key!, JSON.stringify({ title: 'trash me', body: '', edited: Date.now() }))
    await api('PUT', `/notes/${noteId}/`, { format_version: 1, content: blob }, ctx.access)

    const trashed = await api('DELETE', `/notes/${noteId}/`, undefined, ctx.access)
    expect(trashed.status).toBe(204)
    const trashList = await api('GET', '/notes/?trash=true', undefined, ctx.access)
    expect(trashList.data.some((item: any) => item.id === noteId)).toBe(true)
    const activeList = await api('GET', '/notes/', undefined, ctx.access)
    expect(activeList.data.some((item: any) => item.id === noteId)).toBe(false)

    const restored = await api('POST', `/notes/${noteId}/restore/`, undefined, ctx.access)
    expect(restored.status).toBe(200)
    expect(restored.data.deleted_at).toBeNull()

    await api('DELETE', `/notes/${noteId}/`, undefined, ctx.access)
    const purged = await api('DELETE', `/notes/${noteId}/?purge=true`, undefined, ctx.access)
    expect(purged.status).toBe(204)
    const after = await api('GET', `/notes/${noteId}/`, undefined, ctx.access)
    expect(after.status).toBe(404)
  })

  it('changes password via reauth and logs in with the new one', async () => {
    const challenge = await api('POST', '/auth/login/challenge/', { username: USERNAME, purpose: 'reauth' })
    expect(challenge.status).toBe(200)
    const ephemeral = await clientEphemeral()
    const session = await clientSession(
      ephemeral.private,
      challenge.data.server_public_ephemeral,
      challenge.data.srp_salt,
      USERNAME,
      PASSWORD,
    )
    const newSalt = toHex(randomBytes(16))
    const newMaster = ctx.master!
    const newWrapped = await wrapVault('new password 99', newSalt, newMaster)
    const changed = await api('POST', '/auth/password/change/', {
      srp_session_id: challenge.data.srp_session_id,
      client_public_ephemeral: ephemeral.publicHex,
      client_proof: session.clientProofHex,
      new_srp_salt: newSalt,
      new_srp_verifier: await deriveVerifier(newSalt, USERNAME, 'new password 99'),
      new_wrapped_private_key: newWrapped,
    }, ctx.access)
    expect([200, 204]).toContain(changed.status)

    const newLogin = await srpLogin(USERNAME, 'new password 99')
    expect(newLogin.verify.status).toBe(200)
    const unlocked = await unwrapVault('new password 99', newSalt, newLogin.verify.data.user.wrapped_private_key)
    expect(toB64(unlocked.master)).toBe(toB64(ctx.master!))
    ctx.access = newLogin.verify.data.access
    ctx.salt = newSalt
    Object.assign(ctx, { password: 'new password 99', wrapped: newWrapped })
  })

  it('lists and revokes sessions', async () => {
    const sessions = await api('GET', '/auth/sessions/', undefined, ctx.access)
    expect(sessions.status).toBe(200)
    expect(Array.isArray(sessions.data)).toBe(true)
    expect(sessions.data.some((session: any) => session.current)).toBe(true)
    const other = sessions.data.find((session: any) => !session.current)
    if (other) {
      const revoked = await api('DELETE', `/auth/sessions/${other.id}/`, undefined, ctx.access)
      expect(revoked.status).toBe(204)
    }
  })

  it('deletes the account with a reauth proof', async () => {
    const challenge = await api('POST', '/auth/login/challenge/', {
      username: USERNAME,
      purpose: 'reauth',
    })
    expect(challenge.status).toBe(200)
    const ephemeral = await clientEphemeral()
    const session = await clientSession(
      ephemeral.private,
      challenge.data.server_public_ephemeral,
      challenge.data.srp_salt,
      USERNAME,
      'new password 99',
    )
    const deleted = await api('POST', '/auth/account/', {
      srp_session_id: challenge.data.srp_session_id,
      client_public_ephemeral: ephemeral.publicHex,
      client_proof: session.clientProofHex,
    }, ctx.access)
    expect(deleted.status).toBe(204)
    const login = await srpLogin(USERNAME, 'new password 99')
    expect(login.verify.status).toBe(401)
  })
})
