// The `plannedDay` blob, read safely (M8.6). Sessions store their committed day as a JSON STRING
// so it rides the flat-column /sync handler unchanged — which means every reader has to parse it,
// and a corrupt synced blob must never take a screen down. This module is that one contained
// boundary, plus the derivations that key off it.
//
// Type-only import on purpose: a value import of ../db/schema drags all of rxdb into
// scripts/planned-day-test.ts, which runs under plain tsx with no bundler.
import type { PlannedDay } from '../db/schema'

/** The session fields these helpers read. Structural, so both RxDB docs and plain rows fit. */
export type SessionLike = {
  date: string
  plannedDay?: string | null
  finishedAt?: string | null
}

/** Parse a session's committed day. The one place JSON.parse is allowed to fail — a corrupt
 *  synced blob yields null instead of throwing. */
export function parsePlannedDay(json: string | null | undefined): PlannedDay | null {
  if (!json) return null
  try {
    return JSON.parse(json) as PlannedDay
  } catch {
    return null
  }
}

/** The user deliberately passed on this day (M8.6). Distinct from simply not training: a skip
 *  advances the plan rotation, but never counts as a training day. */
export const isSkipped = (s: { plannedDay?: string | null }): boolean =>
  parsePlannedDay(s.plannedDay)?.skipped === true

/** Sessions that count as TRAINING — skip rows removed. Every streak, consistency and session
 *  count reads through this, so skipping a day can't inflate a streak or mute the detraining
 *  nudge (which would otherwise read a skip as "trained today"). */
export const trainedSessions = <T extends { plannedDay?: string | null }>(sessions: T[]): T[] =>
  sessions.filter((s) => !isSkipped(s))

/**
 * The newest session for `planId` that ADVANCES the plan rotation: one that was finished, or one
 * that was deliberately skipped. Feeds `nextUpIndex`, so the day after this one is what's next up.
 *
 * Skips counting here is the whole point of the feature — without it the rotation would re-propose
 * the skipped day on the next training date forever.
 */
export function lastCompletedDay(
  sessions: SessionLike[],
  planId: string,
): { date: string; dayId: string } | null {
  let best: { date: string; dayId: string } | null = null
  for (const s of sessions) {
    const pd = parsePlannedDay(s.plannedDay)
    if (!pd || pd.planId !== planId) continue // corrupt blob, freestyle, or another plan
    if (!s.finishedAt && !pd.skipped) continue // started but neither finished nor skipped
    if (!best || s.date > best.date) best = { date: s.date, dayId: pd.dayId }
  }
  return best
}
