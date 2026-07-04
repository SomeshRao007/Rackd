// Personal-record detection (M7 Part G). Pure: a lifter's logged sets in, PR events out.
// A PR is a set that beats every EARLIER set of the same exercise — by top weight or by estimated
// 1RM. The first set of an exercise establishes the baseline (not a PR) so day one isn't all confetti.

import { epley1RM } from './lifting'

export type PRSet = {
  exerciseId: string
  exerciseName: string
  weightKg: number
  reps: number
  rir?: number | null
  createdAt: string
}
export type PR = {
  exerciseId: string
  exerciseName: string
  kind: 'weight' | 'e1rm'
  value: number // kg (weight) or estimated 1RM kg (e1rm)
  createdAt: string
}

/** Every PR event across `sets` (any order in → chronological scan). Callers filter by date. */
export function detectPRs(sets: PRSet[]): PR[] {
  const byEx = new Map<string, PRSet[]>()
  for (const s of sets) {
    const arr = byEx.get(s.exerciseId)
    if (arr) arr.push(s)
    else byEx.set(s.exerciseId, [s])
  }

  const prs: PR[] = []
  for (const list of byEx.values()) {
    const chron = [...list].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    let maxW = -Infinity
    let maxE = -Infinity
    let seenWeighted = false
    for (const s of chron) {
      if (s.weightKg <= 0) continue // bodyweight-only: no load PR to chase (m7-deferred: rep PRs)
      const e = epley1RM(s.weightKg, s.reps, s.rir ?? 0)
      if (seenWeighted) {
        if (s.weightKg > maxW) prs.push({ exerciseId: s.exerciseId, exerciseName: s.exerciseName, kind: 'weight', value: s.weightKg, createdAt: s.createdAt })
        if (e > maxE) prs.push({ exerciseId: s.exerciseId, exerciseName: s.exerciseName, kind: 'e1rm', value: Math.round(e), createdAt: s.createdAt })
      }
      seenWeighted = true
      if (s.weightKg > maxW) maxW = s.weightKg
      if (e > maxE) maxE = e
    }
  }
  return prs
}

/** PRs earned on `date` (YYYY-MM-DD) — the Today-page celebration set. */
export function prsOn(sets: PRSet[], date: string): PR[] {
  return detectPRs(sets).filter((p) => p.createdAt.slice(0, 10) === date)
}
