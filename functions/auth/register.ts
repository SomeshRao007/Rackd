import { mintAppJwt } from '../lib/jwt'
import { hashPassword } from '../lib/password'

import { validDob } from '../lib/profile'

type Env = { DB: D1Database; JWT_SECRET: string }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const { email, password, name, dob } = (await request.json().catch(() => ({}))) as {
    email?: string
    password?: string
    name?: string
    dob?: string
  }
  const e = (email ?? '').trim().toLowerCase()
  const n = (name ?? '').trim().slice(0, 80)
  const d = (dob ?? '').trim()
  if (!EMAIL_RE.test(e)) return json({ error: 'Enter a valid email address.' }, 400)
  if (!password || password.length < 8)
    return json({ error: 'Password must be at least 8 characters.' }, 400)
  if (!n) return json({ error: 'Enter your name.' }, 400)
  if (d && !validDob(d)) return json({ error: 'Enter a valid date of birth.' }, 400)

  const id = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  try {
    await env.DB.prepare('INSERT INTO users (id, email, passwordHash, name, dob, createdAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(id, e, passwordHash, n, d || null, new Date().toISOString())
      .run()
  } catch {
    // UNIQUE(email) violation is the source of truth (no TOCTOU pre-check).
    return json({ error: 'That email is already registered.' }, 409)
  }
  const token = await mintAppJwt({ sub: id, email: e, name: n, dob: d || undefined, provider: 'password' }, env.JWT_SECRET)
  return json({ token })
}
