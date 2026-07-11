import { mintAppJwt } from '../lib/jwt'
import { verifyPassword } from '../lib/password'
import { providerOf } from '../lib/profile'

type Env = { DB: D1Database; JWT_SECRET: string }
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const { email, password } = (await request.json().catch(() => ({}))) as {
    email?: string
    password?: string
  }
  const e = (email ?? '').trim().toLowerCase()
  // One generic error for every failure → no account enumeration.
  const bad = () => json({ error: 'Invalid email or password.' }, 401)
  if (!e || !password) return bad()

  const row = await env.DB.prepare('SELECT id, email, passwordHash, name, dob FROM users WHERE email = ?1')
    .bind(e)
    .first<{ id: string; email: string; passwordHash: string | null; name: string | null; dob: string | null }>()
  // Google accounts have no passwordHash → password login can't succeed for them (generic error).
  if (!row || !row.passwordHash || !(await verifyPassword(password, row.passwordHash))) return bad()

  const token = await mintAppJwt(
    { sub: row.id, email: row.email, name: row.name ?? row.email, dob: row.dob ?? undefined, provider: providerOf(row.passwordHash) },
    env.JWT_SECRET,
  )
  return json({ token })
}
