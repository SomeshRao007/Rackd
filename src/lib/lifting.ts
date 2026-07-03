// Pure lifting helpers (M4 Part G). Weights are in KG (canonical); the UI converts for display.

/**
 * Warm-up sets stepping DOWN from the last working weight (user: "maxed 7.5kg → warm up 2.5/5kg").
 * Rounds each to `step` (the equipment increment). Drops any that round to 0 or ≥ working weight.
 * ponytail: fixed %-of-last scheme, not bar/dumbbell-aware — m4-deferred #6.
 */
export function warmupSets(
  lastWorkingKg: number,
  step = 2.5,
  scheme = [0.33, 0.66],
): { pct: number; kg: number }[] {
  if (lastWorkingKg <= 0) return []
  const seen = new Set<number>()
  const out: { pct: number; kg: number }[] = []
  for (const pct of scheme) {
    const kg = Math.round((lastWorkingKg * pct) / step) * step
    if (kg <= 0 || kg >= lastWorkingKg || seen.has(kg)) continue
    seen.add(kg)
    out.push({ pct, kg })
  }
  return out
}

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
