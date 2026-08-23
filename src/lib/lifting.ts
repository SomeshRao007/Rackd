// Pure lifting helpers (M4 Part G). Weights are in KG (canonical); the UI converts for display.

/**
 * Warm-up sets stepping DOWN from the last working weight (user: "maxed 7.5kg → warm up 2.5/5kg").
 * Rounds each to `step` (the equipment increment). Drops any that round to 0 or ≥ working weight.
 * Each rung carries its own rep target — heavier ramp, fewer reps — so tapping one logs a
 * complete set without touching the work-set inputs (M8.6).
 * ponytail: fixed %-of-last scheme, not bar/dumbbell-aware — m4-deferred #6.
 */
export function warmupSets(
  lastWorkingKg: number,
  step = 2.5,
  scheme = [
    { pct: 0.33, reps: 8 },
    { pct: 0.66, reps: 5 },
  ],
): { pct: number; kg: number; reps: number }[] {
  if (lastWorkingKg <= 0) return []
  const seen = new Set<number>()
  const out: { pct: number; kg: number; reps: number }[] = []
  for (const { pct, reps } of scheme) {
    const kg = Math.round((lastWorkingKg * pct) / step) * step
    if (kg <= 0 || kg >= lastWorkingKg || seen.has(kg)) continue
    seen.add(kg)
    out.push({ pct, kg, reps })
  }
  return out
}

// ── Warm-up ramp sets (M8.6) ─────────────────────────────────────────────────
// A tapped ramp badge logs a REAL set, so it has to be distinguishable from a work set
// everywhere that counts: progression, PRs, volume, and the per-row set target.
// `note` is the marker because it's the only spare field on SetLog — a dedicated boolean would
// mean an RxDB version bump + a D1 column + a /sync change, for a flag only the client reads.
// Known limitation: a ramp set can't also carry a user note, and a work set noted exactly
// "Warm-up" is treated as a ramp.
export const WARMUP_NOTE = 'Warm-up'

export const isWarmupSet = (s: { note?: string | null }): boolean => s.note === WARMUP_NOTE

/** Work sets only — ramps don't count toward set targets, streaks, volume, PRs or progression. */
export const workSets = <T extends { note?: string | null }>(sets: T[]): T[] =>
  sets.filter((s) => !isWarmupSet(s))

/**
 * Plate loadout PER SIDE for a target weight on a barbell (greedy, heaviest-first).
 * Returns the plates for one side; the bar holds the rest. ponytail: single fixed inventory +
 * 20kg bar — m4-deferred #7.
 */
export function platesFor(
  targetKg: number,
  barKg = 20,
  plates = [20, 15, 10, 5, 2.5, 1.25],
): number[] {
  let perSide = (targetKg - barKg) / 2
  if (perSide <= 0) return []
  const out: number[] = []
  for (const p of plates) {
    while (perSide + 1e-9 >= p) {
      out.push(p)
      perSide -= p
    }
  }
  return out // remainder (perSide > 0) is unreachable with the given plates — closest stack
}

/** Epley e1RM, RIR-adjusted: reps done + reps left in the tank. */
export const epley1RM = (kg: number, reps: number, rir = 0): number =>
  kg * (1 + (reps + rir) / 30)

/** Round to the nearest equipment increment (default 2.5 kg). */
export const roundToStep = (kg: number, step = 2.5): number =>
  Math.round(kg / step) * step
