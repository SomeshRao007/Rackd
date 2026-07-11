import { authUserId, mintAppJwt } from '../lib/jwt'
import { hashPassword, verifyPassword } from '../lib/password'
import { providerOf, validDob } from '../lib/profile'

// Account settings: edit name/dob (any account) and email/password (password accounts only).
// userId comes from the verified Bearer token — never a client-supplied id (same trust boundary
// as /sync). On success returns a freshly-minted JWT so the client's identity updates in place.
type Env = { DB: D1Database; JWT_SECRET: string }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

type Row = { id: string; email: string; passwordHash: string | null; name: string | null; dob: string | null }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const uid = await authUserId(request, env.JWT_SECRET)
  if (!uid) return json({ error: 'unauthorized' }, 401)

  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    dob?: string
    email?: string
    currentPassword?: string
    newPassword?: string
  }

  const row = await env.DB.prepare('SELECT id, email, passwordHash, name, dob FROM users WHERE id = ?1')
    .bind(uid)
    .first<Row>()
  if (!row) return json({ error: 'Account not found.' }, 404)
  const isPassword = providerOf(row.passwordHash) === 'password'

  // Columns to write, keyed by name — keys are internal (not user input), so no injection surface.
  const updates: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const n = body.name.trim().slice(0, 80)
    if (!n) return json({ error: 'Enter your name.' }, 400)
    updates.name = n
  }

  if (body.dob !== undefined) {
    const d = body.dob.trim()
    if (d && !validDob(d)) return json({ error: 'Enter a valid date of birth.' }, 400)
    updates.dob = d || null
  }

  // Email + password are credentials — Google manages them for Google accounts.
  if ((body.email !== undefined || body.newPassword !== undefined) && !isPassword)
    return json({ error: 'Email and password are managed by Google for this account.' }, 400)

  if (body.newPassword !== undefined) {
    if (body.newPassword.length < 8) return json({ error: 'New password must be at least 8 characters.' }, 400)
    if (!body.currentPassword || !(await verifyPassword(body.currentPassword, row.passwordHash!)))
      return json({ error: 'Current password is incorrect.' }, 400)
    updates.passwordHash = await hashPassword(body.newPassword)
  }

  let nextEmail = row.email
  if (body.email !== undefined) {
    const e = body.email.trim().toLowerCase()
    if (!EMAIL_RE.test(e)) return json({ error: 'Enter a valid email address.' }, 400)
    if (e !== row.email) {
      updates.email = e
      nextEmail = e
    }
  }

  const cols = Object.keys(updates)
  if (cols.length > 0) {
    const assign = cols.map((c, i) => `${c} = ?${i + 1}`).join(', ')
    try {
      await env.DB.prepare(`UPDATE users SET ${assign} WHERE id = ?${cols.length + 1}`)
        .bind(...cols.map((c) => updates[c]), uid)
        .run()
    } catch {
      // email is the only UNIQUE column that a write here can violate.
      return json({ error: 'That email is already in use.' }, 409)
    }
  }

  const nextName = (updates.name as string | undefined) ?? row.name ?? nextEmail
  const nextDob = 'dob' in updates ? (updates.dob as string | null) : row.dob
  const token = await mintAppJwt(
    { sub: uid, email: nextEmail, name: nextName, dob: nextDob ?? undefined, provider: providerOf(row.passwordHash) },
    env.JWT_SECRET,
  )
  return json({ token })
}
