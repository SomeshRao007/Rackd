// PBKDF2 password hashing via Workers WebCrypto (no bcrypt dep); the self-describing PHC string carries the iteration count so it can be raised later without a migration.
// ponytail: no per-account rate limiting — family scale. Add a KV/D1 attempt counter if abused.

const ITERATIONS = 100_000 // PBKDF2-SHA256; tune up to the Workers CPU budget, stored per-hash
const enc = new TextEncoder()
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256)
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, ITERATIONS)
  return `$pbkdf2-sha256$i=${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`
}

export async function verifyPassword(password: string, phc: string): Promise<boolean> {
  const m = /^\$pbkdf2-sha256\$i=(\d+)\$([^$]+)\$([^$]+)$/.exec(phc)
  if (!m) return false
  const actual = await derive(password, fromB64(m[2]), Number(m[1]))
  return timingSafeEqual(actual, fromB64(m[3]))
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}
