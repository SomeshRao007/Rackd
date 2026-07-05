// Recovery-readiness engine (M7 C5). Pure: three self-reported taps in, a 0–100 score and a
// load multiplier out. The score is DERIVED (never stored) so the three raw inputs stay the
// single source of truth. The factor feeds suggestNext exactly like `deload`/`stepKg`.

// Each input is 0..2, higher = more recovered (soreness is phrased "how fresh", so it lines up).
export type ReadinessInputs = { sleep: number; soreness: number; energy: number }

const clamp02 = (n: number): number => Math.max(0, Math.min(2, Math.round(n)))

/** 0–100 recovery score — the plain average of the three taps. Transparent on purpose. */
export function readinessScore(i: ReadinessInputs): number {
  const total = clamp02(i.sleep) + clamp02(i.soreness) + clamp02(i.energy) // 0..6
  return Math.round((total / 6) * 100)
}

// why: a single low-readiness day is an autoregulatory NUDGE, not a deload — cap the cut at 10%.
// Deep, multi-week fatigue is the deload's job (suggest.ts DL). Fresh days (≥67) train as prescribed.
const FLOOR = 0.9
const FULL_AT = 67 // "okay across the board" (2+2+0 or 1+1+2 ≈ 67) and up = no reduction

/** Load multiplier for the day. 1.0 when recovered; ramps down to FLOOR (0.90) as the score falls. */
export function readinessFactor(score: number): number {
  if (score >= FULL_AT) return 1
  return Math.max(FLOOR, FLOOR + (1 - FLOOR) * (score / FULL_AT))
}

/** Short band label for the UI. */
export function readinessLabel(score: number): 'Fresh' | 'Okay' | 'Run down' {
  if (score >= FULL_AT) return 'Fresh'
  if (score >= 34) return 'Okay'
  return 'Run down'
}
