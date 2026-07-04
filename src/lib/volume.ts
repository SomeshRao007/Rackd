// Pure volume aggregation for the C4 dashboard + R6 goal suggestions (M6).
// Attributes each set to its exercise's FIRST primary muscle only — matching the existing
// `muscleOf` precedent (Today.tsx:33) — so no set is ever double-counted across muscles/groups.
// ponytail: primary-only attribution; add multi-primary + secondary weighting if coverage feels too coarse (m6-deferred.md #2).

import type { SetLog } from '../db/schema'
import { GROUP_IDS, MUSCLE_GROUPS, groupOf, type MuscleGroupId } from './muscles'

export type Tally = { sets: number; volumeKg: number }
export type MuscleTally = Tally & { muscle: string }
export type GroupTally = Tally & { group: MuscleGroupId; muscles: MuscleTally[] }

export const WINDOWS = [7, 14, 30, 365] as const
export type WindowDays = (typeof WINDOWS)[number]

/** ISO datetime cutoff `days` before `nowMs` — the `since` lower-bound for the rolling window. */
export const sinceDays = (days: number, nowMs: number): string =>
  new Date(nowMs - days * 86400000).toISOString()

const empty = (): Tally => ({ sets: 0, volumeKg: 0 })

/** Per-muscle {sets, volumeKg}. `since` (ISO datetime, inclusive) filters the rolling window. */
export function perMuscleVolume(
  sets: SetLog[],
  muscleOf: (exerciseId: string) => string | undefined,
  since?: string,
): Record<string, Tally> {
  const acc: Record<string, Tally> = {}
  for (const s of sets) {
    if (since && s.createdAt < since) continue
    const m = muscleOf(s.exerciseId)
    if (!m) continue
    const t = (acc[m] ??= empty())
    t.sets += 1
    t.volumeKg += s.weightKg * s.reps
  }
  return acc
}

/** Per-group tally (always all 6 groups, so neglected ones read as 0), each with its muscle breakdown. */
export function perGroupVolume(
  sets: SetLog[],
  muscleOf: (exerciseId: string) => string | undefined,
  since?: string,
): GroupTally[] {
  const byMuscle = perMuscleVolume(sets, muscleOf, since)
  const byGroup: Record<string, Tally> = {}
  for (const [muscle, t] of Object.entries(byMuscle)) {
    const g = groupOf(muscle)
    if (!g) continue
    const acc = (byGroup[g] ??= empty())
    acc.sets += t.sets
    acc.volumeKg += t.volumeKg
  }
  return GROUP_IDS.map((group) => ({
    group,
    sets: byGroup[group]?.sets ?? 0,
    volumeKg: byGroup[group]?.volumeKg ?? 0,
    muscles: MUSCLE_GROUPS[group].map((muscle) => ({
      muscle,
      sets: byMuscle[muscle]?.sets ?? 0,
      volumeKg: byMuscle[muscle]?.volumeKg ?? 0,
    })),
  }))
}
