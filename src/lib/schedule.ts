// Plan enrollment schedule math (M8.2). Pure — ISO `yyyy-mm-dd` in, dates out; UTC like lib/dates.
// A schedule = the enrollment start date + which weekdays the user trains; plan days rotate across
// those training dates, continuing from the last finished workout (self-healing: skip a day and the
// whole sequence just shifts forward, nothing is "missed").

export type PlanSchedule = { start: string; weekdays: number[] }

/** Parse the plan's `schedule` JSON string; null on missing/malformed/no training days. */
export function parseSchedule(raw: string | null | undefined): PlanSchedule | null {
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as PlanSchedule
    if (typeof s?.start !== 'string' || !Array.isArray(s.weekdays) || s.weekdays.length === 0) return null
    return s
  } catch {
    return null
  }
}

/** Weekday 0–6 (Sun–Sat) of an ISO date. */
export const weekdayOf = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay()

export const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10)

/** Index of the plan day to do next: the one after `lastDoneDayId`, wrapping; none/unknown → 0. */
export function nextUpIndex(dayIds: string[], lastDoneDayId: string | null): number {
  if (dayIds.length === 0) return 0
  const i = lastDoneDayId ? dayIds.indexOf(lastDoneDayId) : -1
  return (i + 1) % dayIds.length
}

/**
 * The next `n` training dates from `from` (inclusive, clamped to schedule.start), each assigned a
 * rotating plan-day index beginning at `startIndex` (feed it nextUpIndex's result).
 */
export function forecast(
  dayCount: number,
  schedule: PlanSchedule,
  startIndex: number,
  from: string,
  n: number,
): { date: string; dayIndex: number }[] {
  const trainDays = new Set(schedule.weekdays)
  if (dayCount === 0 || trainDays.size === 0 || n <= 0) return []
  const out: { date: string; dayIndex: number }[] = []
  let date = from > schedule.start ? from : schedule.start
  let idx = startIndex
  while (out.length < n) {
    if (trainDays.has(weekdayOf(date))) {
      out.push({ date, dayIndex: idx % dayCount })
      idx++
    }
    date = addDays(date, 1)
  }
  return out
}
