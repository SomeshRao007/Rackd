import { SignJWT, jwtVerify } from 'jose'

// One place to mint the app JWT — used by Google callback, dev-login, register, login, account.
// dob (YYYY-MM-DD) + provider ride in the token so the client can show age and gate which account
// fields are editable ('password' → email/password editable; 'google' → managed by Google).
export type AppClaims = {
  sub: string
  email?: string
  name?: string
  picture?: string
  dob?: string
  provider?: 'google' | 'password'
}

export function mintAppJwt(claims: AppClaims, secret: string): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(new TextEncoder().encode(secret))
}

/** Verify a request's Bearer token, returning its `sub` (userId) or null; the verify throw is the trust boundary (forged/expired → 401). */
export async function authUserId(request: Request, secret: string): Promise<string | null> {
  const header = request.headers.get('Authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  try {
    const { payload } = await jwtVerify(header.slice(7), new TextEncoder().encode(secret))
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}
