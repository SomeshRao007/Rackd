// Tiny date helpers over ISO `yyyy-mm-dd` strings (M5). UTC throughout — good enough for day math.

export const todayISO = (): string => new Date().toISOString().slice(0, 10)

export const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

/** Monday-anchored integer week (1970-01-05 was a Monday) — consecutive weeks differ by exactly 1. */
export const weekIndex = (iso: string): number =>
  Math.floor((Date.parse(iso) / 86400000 - 4) / 7)
