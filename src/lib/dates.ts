// Tiny date helpers over ISO `yyyy-mm-dd` strings (M5). UTC throughout — good enough for day math.

export const todayISO = (): string => new Date().toISOString().slice(0, 10)

export const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

/** Monday-anchored integer week (1970-01-05 was a Monday) — consecutive weeks differ by exactly 1. */
export const weekIndex = (iso: string): number =>
  Math.floor((Date.parse(iso) / 86400000 - 4) / 7)

/** Whole years between a `yyyy-mm-dd` date of birth and today (UTC). */
export const ageFromDob = (dob: string): number => {
  const b = new Date(dob + 'T00:00:00Z')
  const now = new Date()
  let age = now.getUTCFullYear() - b.getUTCFullYear()
  const m = now.getUTCMonth() - b.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--
  return age
}
