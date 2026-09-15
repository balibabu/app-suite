import { fromB64, fromUtf8, randomBytes, toB64, toHex, utf8, type Bytes } from './bytes'

export const PBKDF2_ITERATIONS = 250_000
export const PIN_ITERATIONS = 600_000
const NONCE_LENGTH = 12

async function deriveWrappingKey(password: string, saltHex: string, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const salt = new Uint8Array(saltHex.length / 2)
  for (let i = 0; i < salt.length; i++) salt[i] = parseInt(saltHex.slice(i * 2, i * 2 + 2), 16)
  const base = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function generateMasterKey(): Bytes {
  return randomBytes(32)
}

export async function importMasterKey(raw: Bytes): Promise<CryptoKey> {
  const copy = new Uint8Array(raw.length)
  copy.set(raw)
  return crypto.subtle.importKey('raw', copy.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

async function encryptRaw(key: CryptoKey, data: Bytes): Promise<Bytes> {
  const nonce = randomBytes(NONCE_LENGTH)
  const payload = new Uint8Array(data.length)
  payload.set(data)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, payload.buffer as ArrayBuffer)
  const out = new Uint8Array(nonce.length + cipher.byteLength)
  out.set(nonce)
  out.set(new Uint8Array(cipher), nonce.length)
  return out
}

async function decryptRaw(key: CryptoKey, data: Bytes): Promise<Bytes> {
  if (data.length <= NONCE_LENGTH) throw new Error('ciphertext too short')
  const nonce = data.slice(0, NONCE_LENGTH)
  const body = new Uint8Array(data.length - NONCE_LENGTH)
  body.set(data.slice(NONCE_LENGTH))
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.buffer as ArrayBuffer)
  return new Uint8Array(plain)
}

export async function encryptBlob(key: CryptoKey, plaintext: string): Promise<string> {
  return toB64(await encryptRaw(key, utf8(plaintext)))
}

export async function decryptBlob(key: CryptoKey, blob: string): Promise<string> {
  return fromUtf8(await decryptRaw(key, fromB64(blob)))
}

export async function encryptBytes(key: CryptoKey, data: Bytes): Promise<Bytes> {
  return encryptRaw(key, data)
}

export async function decryptBytes(key: CryptoKey, data: Bytes): Promise<Bytes> {
  return decryptRaw(key, data)
}

export interface IdentityKeys {
  publicHex: string
  privatePkcs8B64: string
}

export async function generateIdentity(): Promise<IdentityKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  let publicHex = ''
  for (const byte of rawPub) publicHex += byte.toString(16).padStart(2, '0')
  return { publicHex, privatePkcs8B64: toB64(pkcs8) }
}

interface VaultPayload {
  v: 1
  m: string
  ipk?: string
}

export async function wrapVault(
  password: string,
  saltHex: string,
  master: Bytes,
  identityPrivatePkcs8B64?: string,
): Promise<string> {
  const key = await deriveWrappingKey(password, saltHex)
  const payload: VaultPayload = { v: 1, m: toB64(master), ipk: identityPrivatePkcs8B64 }
  return encryptBlob(key, JSON.stringify(payload))
}

export async function unwrapVault(
  password: string,
  saltHex: string,
  wrapped: string,
): Promise<{ master: Bytes; identityPrivate?: Bytes }> {
  if (!wrapped) throw new Error('account has no encrypted vault')
  const key = await deriveWrappingKey(password, saltHex)
  const payload = JSON.parse(await decryptBlob(key, wrapped)) as VaultPayload
  if (payload.v !== 1 || typeof payload.m !== 'string') throw new Error('unsupported vault format')
  return {
    master: fromB64(payload.m),
    identityPrivate: payload.ipk ? fromB64(payload.ipk) : undefined,
  }
}

interface PinGuardPayload {
  v: 1
  salt: string
  iterations: number
  data: string
}

export async function createPinGuard(pin: string, master: Bytes, iterations = PIN_ITERATIONS): Promise<string> {
  const saltHex = toHex(randomBytes(16))
  const key = await deriveWrappingKey(pin, saltHex, iterations)
  const data = await encryptRaw(key, master)
  const payload: PinGuardPayload = { v: 1, salt: saltHex, iterations, data: toB64(data) }
  return JSON.stringify(payload)
}

export async function openPinGuard(guard: string, pin: string): Promise<Bytes> {
  const payload = JSON.parse(guard) as PinGuardPayload
  if (payload.v !== 1 || typeof payload.salt !== 'string') throw new Error('unsupported pin guard')
  const key = await deriveWrappingKey(pin, payload.salt, payload.iterations)
  return decryptRaw(key, fromB64(payload.data))
}
