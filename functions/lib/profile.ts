// Shared user-profile helpers for the auth endpoints (register, login, account, callback).

const DOB_RE = /^\d{4}-\d{2}-\d{2}$/

/** dob is optional, but when present must be a real calendar date in a sane human range.
 *  Date.parse on the date-only ISO form returns NaN for impossible dates (e.g. Feb 30), so the
 *  regex + parse together reject both malformed and non-existent dates. */
export function validDob(dob: string): boolean {
  if (!DOB_RE.test(dob)) return false
  const t = Date.parse(dob)
  if (Number.isNaN(t)) return false
  return Number(dob.slice(0, 4)) >= 1900 && t <= Date.now()
}

/** Account type is derived from whether a password hash exists — no separate DB column needed. */
export const providerOf = (passwordHash: string | null | undefined): 'google' | 'password' =>
  passwordHash ? 'password' : 'google'
