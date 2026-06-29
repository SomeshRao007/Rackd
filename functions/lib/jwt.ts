import { SignJWT, jwtVerify } from 'jose'

// One place to mint the app JWT — used by Google callback, dev-login, register, login.
export type AppClaims = { sub: string; email?: string; name?: string; picture?: string }

export function mintAppJwt(claims: AppClaims, secret: string): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(new TextEncoder().encode(secret))
}

/** Verify a request's Bearer token and return its `sub` (userId), or null.
 *  The verify throw is the trust boundary — forged/expired → null → 401. */
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
