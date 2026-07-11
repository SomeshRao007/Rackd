import { mintAppJwt } from '../lib/jwt'

// Dev-only: mints a real app JWT for the stub user (same verify path as prod), gated on AUTH_STUB=1 so it 404s in prod — no auth-bypass branch in /sync.
type Env = { JWT_SECRET: string; AUTH_STUB?: string }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (env.AUTH_STUB !== '1') return new Response('Not found', { status: 404 })
  const origin = new URL(request.url).origin
  const token = await mintAppJwt(
    { sub: 'stub-user', name: 'Local Dev', email: 'dev@local', dob: '1990-01-01', provider: 'password' },
    env.JWT_SECRET,
  )
  return new Response(null, { status: 302, headers: { Location: `${origin}/?token=${token}` } })
}
