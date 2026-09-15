const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type Bytes = Uint8Array<ArrayBuffer>

export function utf8(value: string): Bytes {
  return encoder.encode(value) as Bytes
}

export function fromUtf8(bytes: Bytes): string {
  return decoder.decode(bytes)
}

export function concat(...parts: Bytes[]): Bytes {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function toHex(bytes: Bytes): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

export function fromHex(hex: string): Bytes {
  if (hex.length % 2 !== 0) throw new Error('odd hex length')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function toB64(bytes: Bytes): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromB64(value: string): Bytes {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function randomBytes(length: number): Bytes {
  const out = new Uint8Array(length)
  crypto.getRandomValues(out)
  return out
}

export async function sha256(...parts: Bytes[]): Promise<Bytes> {
  const digest = await crypto.subtle.digest('SHA-256', concat(...parts))
  return new Uint8Array(digest)
}
