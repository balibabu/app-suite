import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { clientEphemeral, clientSession, derivePrivateKeyKey, deriveVerifier, hexFromInt, N, G } from './srp'
import {
  createPinGuard,
  decryptBlob,
  encryptBlob,
  importMasterKey,
  openPinGuard,
  unwrapVault,
  wrapVault,
  generateMasterKey,
  encryptBytes,
  decryptBytes,
} from './crypto'
import { randomBytes, toHex, fromB64, toB64 } from './bytes'

const SALT = toHex(randomBytes(16))
const USERNAME = 'alice'
const PASSWORD = 'correct horse battery staple'

function nodePad(value: bigint): Buffer {
  const out = Buffer.alloc(256)
  let current = value
  for (let i = 255; i >= 0; i--) {
    out[i] = Number(current & 0xffn)
    current >>= 8n
  }
  return out
}

function nodeHash(...parts: Buffer[]): Buffer {
  return createHash('sha256').update(Buffer.concat(parts)).digest()
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n
  let b = ((base % modulus) + modulus) % modulus
  let e = exponent
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus
    b = (b * b) % modulus
    e >>= 1n
  }
  return result
}

describe('srp-6a client math', () => {
  it('derives x matching the python spec', async () => {
    const inner = nodeHash(Buffer.from(`${USERNAME}:${PASSWORD}`, 'utf8'))
    const expected = BigInt('0x' + nodeHash(Buffer.from(SALT, 'hex'), inner).toString('hex'))
    const actual = await derivePrivateKeyKey(SALT, USERNAME, PASSWORD)
    expect(actual).toBe(expected)
  })

  it('verifier equals g^x mod N', async () => {
    const x = await derivePrivateKeyKey(SALT, USERNAME, PASSWORD)
    const expected = hexFromInt(modPow(G, x, N))
    expect(await deriveVerifier(SALT, USERNAME, PASSWORD)).toBe(expected)
  })

  it('client and server proofs agree', async () => {
    const x = await derivePrivateKeyKey(SALT, USERNAME, PASSWORD)
    const v = modPow(G, x, N)
    const b = BigInt('0x' + toHex(randomBytes(32))) % (N - 1n) + 1n
    const k = BigInt('0x' + nodeHash(nodePad(N), nodePad(G)).toString('hex'))
    const B = (k * v + modPow(G, b, N)) % N
    const BHex = hexFromInt(B)

    const ephemeral = await clientEphemeral()
    const client = await clientSession(ephemeral.private, BHex, SALT, USERNAME, PASSWORD)

    const A = modPow(G, ephemeral.private, N)
    const u = BigInt('0x' + nodeHash(nodePad(A), nodePad(B)).toString('hex'))
    const S = modPow((A * modPow(v, u, N)) % N, b, N)
    const K = nodeHash(nodePad(S))
    const M1 = nodeHash(nodePad(A), nodePad(B), K)
    const M2 = nodeHash(nodePad(A), M1, K)

    expect(client.clientProofHex).toBe(M1.toString('hex'))
    expect(client.serverProofHex).toBe(M2.toString('hex'))
    expect(client.keyHex).toBe(K.toString('hex'))
  })

  it('rejects zero server ephemeral', async () => {
    const ephemeral = await clientEphemeral()
    await expect(clientSession(ephemeral.private, hexFromInt(0n), SALT, USERNAME, PASSWORD)).rejects.toThrow()
  })
})

describe('vault crypto', () => {
  it('encrypts and decrypts blobs with base64 nonce-prefix framing', async () => {
    const key = await importMasterKey(generateMasterKey())
    const plaintext = JSON.stringify({ title: 'groceries', body: 'oat milk ☕' })
    const blob = await encryptBlob(key, plaintext)
    expect(blob).toMatch(/^[A-Za-z0-9+/=]+$/)
    expect(await decryptBlob(key, blob)).toBe(plaintext)
  })

  it('wraps and unwraps the master key with the SRP salt', async () => {
    const master = generateMasterKey()
    const wrapped = await wrapVault(PASSWORD, SALT, master)
    const unwrapped = await unwrapVault(PASSWORD, SALT, wrapped)
    expect(toB64(unwrapped.master)).toBe(toB64(master))
    const wrappedBytes = fromB64(wrapped)
    expect(wrappedBytes.slice(0, 12).length).toBe(12)
  })

  it('fails to unwrap with the wrong password', async () => {
    const wrapped = await wrapVault(PASSWORD, SALT, generateMasterKey())
    await expect(unwrapVault('wrong password', SALT, wrapped)).rejects.toThrow()
  })

  it('roundtrips raw bytes for file content', async () => {
    const key = await importMasterKey(generateMasterKey())
    const data = randomBytes(1024)
    const encrypted = await encryptBytes(key, data)
    expect(encrypted.length).toBe(data.length + 12 + 16)
    expect(await decryptBytes(key, encrypted)).toEqual(data)
  })
})

describe('pin guard', () => {
  const FAST = 1000

  it('wraps and unwraps the master key with a pin', async () => {
    const master = generateMasterKey()
    const guard = await createPinGuard('1234', master, FAST)
    const payload = JSON.parse(guard) as { v: number; salt: string; iterations: number; data: string }
    expect(payload.v).toBe(1)
    expect(payload.salt).not.toBe(SALT)
    expect(toB64(await openPinGuard(guard, '1234'))).toBe(toB64(master))
  })

  it('rejects the wrong pin', async () => {
    const guard = await createPinGuard('1234', generateMasterKey(), FAST)
    await expect(openPinGuard(guard, '4321')).rejects.toThrow()
  })

  it('uses a unique salt per guard', async () => {
    const master = generateMasterKey()
    const first = JSON.parse(await createPinGuard('1234', master, FAST)) as { salt: string }
    const second = JSON.parse(await createPinGuard('1234', master, FAST)) as { salt: string }
    expect(first.salt).not.toBe(second.salt)
  })
})
