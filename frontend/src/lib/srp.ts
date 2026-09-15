import { fromHex, randomBytes, sha256, toHex, utf8, type Bytes } from './bytes'

const N_HEX =
  'ac6bdb41324a9a9bf166de5e1389582faf72b6651987ee07fc3192943db56050' +
  'a37329cbb4a099ed8193e0757767a13dd52312ab4b03310dcd7f48a9da04fd50' +
  'e8083969edb767b0cf6095179a163ab3661a05fbd5faaae82918a9962f0b93b8' +
  '55f97993ec975eeaa80d740adbf4ff747359d041d5c33ea71d281e446b14773b' +
  'ca97b43a23fb801676bd207a436c6481f1d2b9078717461a5b9d32e688f87748' +
  '544523b524b0d57d5ea77a2775d2ecfa032cfbdbf52fb3786160279004e57ae6' +
  'af874e7303ce53299ccc041c7bc308d82a5698f3a8d0c38271ae35f8e9dbfbb6' +
  '94b5c803d89f7ae435de236d525f54759b65e372fcd68ef20fa7111f9e4aff73'

const N = BigInt('0x' + N_HEX)
const G = 2n
const KEY_LENGTH = 256

function intFromHex(hex: string): bigint {
  const value = BigInt('0x' + hex)
  if (value < 0n || value >= N) throw new Error('value out of group range')
  return value
}

function bigToBytes(value: bigint, length: number = KEY_LENGTH): Bytes {
  const out = new Uint8Array(length)
  let current = value
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(current & 0xffn)
    current >>= 8n
  }
  return out
}

function bytesToBig(bytes: Bytes): bigint {
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)
  return value
}

export function hexFromInt(value: bigint): string {
  return value.toString(16).padStart(KEY_LENGTH * 2, '0')
}

async function pad(value: bigint): Promise<Bytes> {
  return bigToBytes(value)
}

async function multiplierK(): Promise<bigint> {
  return bytesToBig(await sha256(bigToBytes(N), bigToBytes(G)))
}

export async function derivePrivateKeyKey(saltHex: string, username: string, password: string): Promise<bigint> {
  const inner = await sha256(utf8(`${username}:${password}`))
  return bytesToBig(await sha256(fromHex(saltHex), inner))
}

export async function deriveVerifier(saltHex: string, username: string, password: string): Promise<string> {
  const x = await derivePrivateKeyKey(saltHex, username, password)
  return hexFromInt(modPow(G, x, N))
}

export function randomPrivate(): bigint {
  return bytesToBig(randomBytes(64)) % (N - 1n) + 1n
}

export async function clientEphemeral(): Promise<{ private: bigint; publicHex: string }> {
  const a = randomPrivate()
  return { private: a, publicHex: hexFromInt(modPow(G, a, N)) }
}

export interface SrpClientSession {
  keyHex: string
  clientProofHex: string
  serverProofHex: string
}

export async function clientSession(
  clientPrivate: bigint,
  serverPublicHex: string,
  saltHex: string,
  username: string,
  password: string,
): Promise<SrpClientSession> {
  const B = intFromHex(serverPublicHex)
  if (B % N === 0n) throw new Error('invalid server ephemeral')
  const A = modPow(G, clientPrivate, N)
  const u = bytesToBig(await sha256(await pad(A), await pad(B)))
  if (u === 0n) throw new Error('invalid scrambling parameter')
  const x = await derivePrivateKeyKey(saltHex, username, password)
  const k = await multiplierK()
  const base = ((B - k * modPow(G, x, N)) % N + N) % N
  const S = modPow(base, clientPrivate + u * x, N)
  const key = await sha256(await pad(S))
  const clientProof = await sha256(await pad(A), await pad(B), key)
  const serverProof = await sha256(await pad(A), clientProof, key)
  return {
    keyHex: toHex(key),
    clientProofHex: toHex(clientProof),
    serverProofHex: toHex(serverProof),
  }
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

export { N, G }
