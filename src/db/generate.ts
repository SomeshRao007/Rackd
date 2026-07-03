import type { Exercise, PlannedPick } from './schema'

// Per-set wall-clock time = the user's rest interval + their rough working-set time (both come
// from Settings → prefs). Reps are a *programming* choice by exercise role, not a time driver —
// the working-set time is one rough number by design, so an 8-rep compound and a 12-rep isolation
// are costed the same. Tune the role reps / cap below to taste.
// All fields optional → callers (and tests) can pass just what they tune; the rest fall to defaults.
export type BudgetOpts = { restSec?: number; workSec?: number; maxSets?: number }
const DEFAULTS = { restSec: 120, workSec: 40, maxSets: 6 }

const REPS_BY_ROLE: Record<string, number> = { compound: 8, isolation: 12 } // heavy low, isolation high
const DEFAULT_REPS = 10 // unknown/missing mechanic
const DEFAULT_SETS = 2
const MIN_SETS = 1

const repsFor = (ex?: Exercise): number =>
  (ex?.mechanic ? REPS_BY_ROLE[ex.mechanic] : undefined) ?? DEFAULT_REPS

/**
 * Assign per-pick `minSets` + `targetReps` to fit a time budget (minutes). Reps vary by role
 * (compound/isolation); sets grow one at a time — compounds first — until the budget or MAX_SETS
 * is hit. Per-set time comes from the user's calibration (rest interval + working-set time); the
 * set ceiling (`maxSets`) is user-tunable too. Load is never set (stays user-entered, auto-filled
 * from history). No budget → DEFAULT_SETS at role reps. Pure → unit-tested in scripts/generate-test.ts.
 */
export function fitToBudget(
  picks: PlannedPick[],
  exMap: Map<string, Exercise>,
  budgetMin: number,
  mobilityMin = 0,
  opts: BudgetOpts = {},
): PlannedPick[] {
  if (picks.length === 0) return picks
  const ex = (p: PlannedPick) => exMap.get(p.exerciseId)
  const reps = (p: PlannedPick) => repsFor(ex(p))

  if (budgetMin <= 0)
    return picks.map((p) => ({ ...p, minSets: DEFAULT_SETS, targetReps: reps(p) }))

  const budgetSec = Math.max(0, budgetMin * 60 - mobilityMin * 60)
  const perSet = Math.max(1, (opts.restSec ?? DEFAULTS.restSec) + (opts.workSec ?? DEFAULTS.workSec)) // one set's cost (guard ÷0)
  const maxSets = Math.max(MIN_SETS, opts.maxSets ?? DEFAULTS.maxSets)

  // Start everyone at MIN_SETS, then add one set at a time — compounds first — while it fits and
  // stays under maxSets. Compounds-first means any leftover marginal set lands on a compound.
  const sets = new Map(picks.map((p) => [p.slotId, MIN_SETS]))
  let used = perSet * MIN_SETS * picks.length
  const order = [...picks].sort(
    (a, b) => Number(ex(b)?.mechanic === 'compound') - Number(ex(a)?.mechanic === 'compound'),
  )
  for (let added = true; added; ) {
    added = false
    for (const p of order) {
      const cur = sets.get(p.slotId) as number
      if (cur < maxSets && used + perSet <= budgetSec) {
        sets.set(p.slotId, cur + 1)
        used += perSet
        added = true
      }
    }
  }
  return picks.map((p) => ({ ...p, minSets: sets.get(p.slotId), targetReps: reps(p) }))
}

/** Estimated mobility minutes for a set of stretches (each holds `sec`), for budgeting. */
export const mobilityMinutes = (steps: { sec: number }[]): number =>
  Math.round(steps.reduce((s, m) => s + m.sec, 0) / 60)
