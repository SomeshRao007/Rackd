import { decodeJwt } from 'jose'
import { mintAppJwt } from '../../lib/jwt'

type Env = {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  JWT_SECRET: string
  DB: D1Database
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const origin = url.origin

  const cookieState = (request.headers.get('Cookie') ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('oauth_state='))
    ?.slice('oauth_state='.length)
  const queryState = url.searchParams.get('state')

  // CSRF: state must be present and match the cookie set at /login.
  if (!cookieState || !queryState || cookieState !== queryState) {
    return new Response('Invalid request', { status: 400 })
  }

  const clear =
    'oauth_state=; Max-Age=0; Path=/auth/google; HttpOnly; Secure; SameSite=Lax'

  const fail = () => {
    const headers = new Headers({ Location: `${origin}/?auth_error=1` })
    headers.append('Set-Cookie', clear)
    return new Response(null, { status: 302, headers })
  }

  const code = url.searchParams.get('code')
  if (!code) return fail()

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${origin}/auth/google/callback`,
      grant_type: 'authorization_code',
    }).toString(),
  })
  if (!tokenRes.ok) return fail()

  const { id_token } = (await tokenRes.json()) as { id_token?: string }
  if (!id_token) return fail()

  // id_token came straight from Google over TLS; decode (no re-verify needed).
  const claims = decodeJwt(id_token)
  if (typeof claims.sub !== 'string') return fail()

  const sub = claims.sub
  const googleName = claims.name as string | undefined
  const googleEmail = (claims.email as string | undefined)?.toLowerCase()
  const picture = claims.picture as string | undefined

  // Ensure a local users row so name + dob persist and stay editable like a password account.
  // Prefer the local row's name/dob over Google's claims so account-settings edits stick across logins.
  let name = googleName
  let dob: string | undefined
  const existing = await env.DB.prepare('SELECT name, dob FROM users WHERE id = ?1')
    .bind(sub)
    .first<{ name: string | null; dob: string | null }>()
  if (existing) {
    name = existing.name ?? googleName
    dob = existing.dob ?? undefined
  } else if (googleEmail) {
    // First Google login → create the row. A rare email collision with a pre-existing password
    // account (different id) throws on UNIQUE(email); swallow it and fall back to Google claims
    // (identity-merge is out of scope).
    try {
      await env.DB.prepare('INSERT INTO users (id, email, passwordHash, name, dob, createdAt) VALUES (?1, ?2, NULL, ?3, NULL, ?4)')
        .bind(sub, googleEmail, googleName ?? null, new Date().toISOString())
        .run()
    } catch {
      // proceed with Google claims for this session
    }
  }

  const appJwt = await mintAppJwt(
    { sub, name, email: googleEmail, picture, dob, provider: 'google' },
    env.JWT_SECRET,
  )

  const headers = new Headers({ Location: `${origin}/?token=${appJwt}` })
  headers.append('Set-Cookie', clear)
  return new Response(null, { status: 302, headers })
}
