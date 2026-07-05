// Consistency + "cost of falling off" engine (M7 R10). Pure: session dates in, streak and a
// motivational detraining nudge out. Streak counts distinct TRAINING DAYS with rest-day grace: a
// run stays alive as long as consecutive training days are ≤ MAX_GAP_DAYS apart, so normal rest
// days (up to 2 in a row) don't break it — a lifting app shouldn't punish healthy recovery.

import { daysBetween } from './dates'

// Train at least every 3rd day (≤2 rest days between sessions) to keep the run alive.
const MAX_GAP_DAYS = 3

/** Current + best run of training days, forgiving up to MAX_GAP_DAYS between them. `today` anchors "current". */
export function trainingStreak(sessionDates: string[], today: string): { current: number; best: number } {
  if (sessionDates.length === 0) return { current: 0, best: 0 }
  // distinct training days (yyyy-mm-dd), ascending.
  const days = [...new Set(sessionDates.map((d) => d.slice(0, 10)))].sort()

  // best: longest run where consecutive training days sit within the grace window.
  let best = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = daysBetween(days[i - 1], days[i]) <= MAX_GAP_DAYS ? run + 1 : 1
    if (run > best) best = run
  }

  // current: the run ending at the latest training day — but only alive if that day is still within
  // the grace window of today (else the streak has lapsed and resets to 0).
  const last = days[days.length - 1]
  if (daysBetween(last, today) > MAX_GAP_DAYS) return { current: 0, best }
  let current = 1
  for (let i = days.length - 1; i > 0; i--) {
    if (daysBetween(days[i - 1], days[i]) > MAX_GAP_DAYS) break
    current++
  }
  return { current, best }
}

export type DetrainingRisk = { level: 'losing' | 'slipping' | 'soon'; message: string }

// why: complete-inactivity research puts measurable strength loss around ~2–3 weeks and hypertrophy
// loss a little later, while a few rest days are harmless (often helpful). Thresholds stay conservative
// so the nudge motivates without crying wolf after a single skipped day.
/** A "cost of falling off" nudge when the gap since the last session gets risky. null = all good. */
export function detrainingRisk(daysSinceLast: number, topGroupLabel?: string): DetrainingRisk | null {
  const focus = topGroupLabel ? ` your ${topGroupLabel.toLowerCase()} work` : ' your progress'
  if (daysSinceLast >= 21) return { level: 'losing', message: `${daysSinceLast} days off — you're starting to lose hard-won muscle. Ease back in today.` }
  if (daysSinceLast >= 14) return { level: 'slipping', message: `${daysSinceLast} days off — strength slips around now. Don't let${focus} unravel.` }
  if (daysSinceLast >= 7) return { level: 'soon', message: `${daysSinceLast} days off — jump back in before you lose momentum.` }
  return null
}

/** Whole days since the most recent session date (null if none). Convenience over daysBetween. */
export function daysSinceLastSession(sessionDates: string[], today: string): number | null {
  if (sessionDates.length === 0) return null
  const latest = sessionDates.reduce((a, b) => (a > b ? a : b))
  return Math.max(0, daysBetween(latest.slice(0, 10), today))
}
