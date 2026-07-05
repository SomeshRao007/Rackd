// Consistency + "cost of falling off" engine (M7 R10). Pure: session dates in, streak and a
// motivational detraining nudge out. Weekly (not daily) streaks so normal rest days don't break
// them — mirrors the trained-weeks logic the deload check already uses (suggest.ts deloadDue).

import { weekIndex, daysBetween } from './dates'

/** Current + best run of consecutive weeks with ≥1 session. `today` anchors "current". */
export function trainingStreak(sessionDates: string[], today: string): { current: number; best: number } {
  if (sessionDates.length === 0) return { current: 0, best: 0 }
  const weeks = [...new Set(sessionDates.map(weekIndex))].sort((a, b) => a - b)

  // best: longest consecutive run anywhere in the set.
  let best = 1
  let run = 1
  for (let i = 1; i < weeks.length; i++) {
    run = weeks[i] === weeks[i - 1] + 1 ? run + 1 : 1
    if (run > best) best = run
  }

  // current: count back from this week — the streak is alive if trained this week or last.
  const thisWeek = weekIndex(today)
  const trained = new Set(weeks)
  let anchor = trained.has(thisWeek) ? thisWeek : trained.has(thisWeek - 1) ? thisWeek - 1 : null
  let current = 0
  while (anchor != null && trained.has(anchor)) {
    current++
    anchor--
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
