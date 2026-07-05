// Pure progression engine (M5). Stateless: logged sets in, next-session prescription out.
// Weights in KG (canonical); the UI converts for display.
// ponytail: reason strings quote kg even for lb users (the seeded input IS converted); localize if family lb users complain.
import type { SchemeId } from '../db/schema'
import { epley1RM, roundToStep } from './lifting'
import { daysBetween } from './dates'

export type HistorySet = {
  sessionId: string
  weightKg: number
  reps: number
  rir?: number | null
  createdAt: string
}
export type Suggestion = { weightKg: number; targetReps: number; reason: string }

// All tuning in one place.
const DP = { repLo: 8, repHi: 12, rirTarget: 2, incKg: 2.5 } // double progression; ponytail: fixed 2.5 kg step — add per-equipment increments (dumbbell jumps) if rounding feels wrong
const LIN = { reps: 5, basePct: 0.7, stepPct: 0.025, capPct: 0.85 } // linear % of e1RM
const LIN_SESSIONS = 3 // e1RM lookback (distinct sessions) — robust to one bad day
const BRK = { idleDays: 14, dropPerWeek: 0.05, floorPct: 0.7 } // break re-entry
const DL = { loadPct: 0.85, streakWeeks: 5, fatigueWeeks: 3, fatigueRir: 1, minRirSamples: 4 } // deload
export const DELOAD_SET_FACTOR = 0.5 // deload sessions also halve set count (applied by the generator)

/** Plan-builder copy: what each scheme does, in plain language. */
// ponytail: wave periodization (C8) deferred — it's one new SchemeId member, one SCHEMES entry, one case in suggestNext.
export const SCHEMES: { id: SchemeId; name: string; blurb: string }[] = [
  {
    id: 'double',
    name: 'Double progression',
    blurb:
      'Weight stays fixed while you add reps each session (8 → 12). Once you hit 12 reps with 2+ reps in reserve, the weight goes up 2.5 kg and reps reset to 8. The safe default — great for dumbbells, machines and most lifts.',
  },
  {
    id: 'linear',
    name: 'Linear % of 1RM',
    blurb:
      'Estimates your 1-rep max from your logged sets, then prescribes 5 reps at a rising percentage of it — starting near 70% and adding 2.5% each session up to 85%. Best for barbell strength work (squat, bench, deadlift).',
  },
]

/**
 * Next-session prescription for ONE exercise. `history` = its logged sets, NEWEST FIRST.
 * No history → null (UI shows a calibration prompt instead).
 */
export function suggestNext(opts: {
  history: HistorySet[]
  scheme: SchemeId
  today: string
  deload?: boolean
  stepKg?: number
  readinessFactor?: number // M7 C5: <1 eases today's load for a low recovery score
}): Suggestion | null {
  const { history, scheme, today } = opts
  if (history.length === 0) return null

  // Last session's sets → heaviest weight, best reps at it, hardest logged RIR at it.
  const last = history.filter((s) => s.sessionId === history[0].sessionId)
  const topW = Math.max(...last.map((s) => s.weightKg))
  const atTop = last.filter((s) => s.weightKg === topW)
  const bestReps = Math.max(...atTop.map((s) => s.reps))
  const rirs = atTop.map((s) => s.rir).filter((r): r is number => r != null)
  const minRir = rirs.length ? Math.min(...rirs) : undefined

  const out = scheme === 'linear' ? linearNext(history, topW) : doubleNext(topW, bestReps, minRir)

  // Break re-entry (both schemes): ≥2 idle weeks → drop 5%/week (floor 70%) and rebuild.
  const idle = daysBetween(history[0].createdAt.slice(0, 10), today)
  if (idle >= BRK.idleDays) {
    const weeks = Math.floor(idle / 7)
    const factor = Math.max(1 - BRK.dropPerWeek * weeks, BRK.floorPct)
    out.weightKg *= factor
    if (scheme === 'double') out.targetReps = DP.repLo
    out.reason = `−${Math.round((1 - factor) * 100)}% — ${weeks} weeks off, ease back in`
  }

  // Deload week: lighter load (set count is halved separately via DELOAD_SET_FACTOR).
  if (opts.deload) {
    out.weightKg *= DL.loadPct
    if (scheme === 'double') out.targetReps = DP.repLo
    out.reason = `Deload: ${out.reason}`
  }

  // Readiness (M7 C5): a low self-reported day eases today's load — a single-day nudge that
  // composes with (and is milder than) the multi-week deload above. Factor floor lives in readiness.ts.
  if (opts.readinessFactor != null && opts.readinessFactor < 1 && out.weightKg > 0) {
    out.weightKg *= opts.readinessFactor
    out.reason = `Easing ${Math.round((1 - opts.readinessFactor) * 100)}% for recovery — ${out.reason}`
  }

  if (out.weightKg > 0) out.weightKg = roundToStep(out.weightKg, opts.stepKg ?? 2.5)
  return out
}

/** Double progression: fixed weight, climb 8→12 reps, then +2.5 kg. RIR optional but respected. */
function doubleNext(topW: number, bestReps: number, minRir: number | undefined): Suggestion {
  if (topW === 0) return { weightKg: 0, targetReps: bestReps + 1, reason: 'Bodyweight — add a rep' }
  if (bestReps >= DP.repHi) {
    if ((minRir ?? DP.rirTarget) >= DP.rirTarget)
      return { weightKg: topW + DP.incKg, targetReps: DP.repLo, reason: '+2.5 kg — hit 12 @ RIR ≥2 last time' }
    return { weightKg: topW, targetReps: DP.repHi, reason: `Hold — 12 reps but only RIR ${minRir}, make it crisper first` }
  }
  if (minRir === 0) return { weightKg: topW, targetReps: bestReps, reason: 'Hold — last session hit failure (RIR 0)' }
  if (minRir !== undefined && minRir >= 4)
    return { weightKg: topW, targetReps: Math.min(bestReps + 2, DP.repHi), reason: `Too easy (RIR ${minRir}) — jump 2 reps` }
  if (bestReps < DP.repLo) return { weightKg: topW, targetReps: DP.repLo, reason: 'Below range — build back to 8' }
  return { weightKg: topW, targetReps: bestReps + 1, reason: `Same weight — go for ${bestReps + 1} reps` }
}

/** Linear: 5 reps at a rising % of the best e1RM across the last LIN_SESSIONS sessions. */
function linearNext(history: HistorySet[], topW: number): Suggestion {
  const sessionTop = new Map<string, number>() // sessionId → its top weight
  for (const s of history) {
    if (!sessionTop.has(s.sessionId) && sessionTop.size >= LIN_SESSIONS) continue
    sessionTop.set(s.sessionId, Math.max(sessionTop.get(s.sessionId) ?? 0, s.weightKg))
  }
  let e1 = 0
  for (const s of history)
    if (s.weightKg === sessionTop.get(s.sessionId))
      e1 = Math.max(e1, epley1RM(s.weightKg, s.reps, s.rir ?? 0))
  if (e1 === 0) return { weightKg: 0, targetReps: LIN.reps, reason: 'No weighted sets yet — log one to calibrate' }
  const pct = Math.min(Math.max(topW / e1 + LIN.stepPct, LIN.basePct), LIN.capPct)
  return {
    weightKg: pct * e1,
    targetReps: LIN.reps,
    reason: `${Math.round(pct * 100)}% of ~${Math.round(e1)} kg e1RM`,
  }
}

/**
 * Should the next session be a deload? `trainedWeeks` = distinct weekIndex values with ≥1 set,
 * DESCENDING, already filtered to after the last deload (caller's job). Returns the reason, or null.
 */
export function deloadDue(opts: {
  trainedWeeks: number[]
  currentWeek: number
  recentRirs: number[]
}): string | null {
  const { trainedWeeks, currentWeek, recentRirs } = opts
  // Streak must still be alive: latest trained week is this week or last week.
  if (trainedWeeks.length === 0 || trainedWeeks[0] < currentWeek - 1) return null
  let streak = 1
  while (streak < trainedWeeks.length && trainedWeeks[streak] === trainedWeeks[0] - streak) streak++
  if (streak >= DL.streakWeeks) return '5+ straight weeks of training'
  if (streak >= DL.fatigueWeeks && recentRirs.length >= DL.minRirSamples) {
    const avg = recentRirs.reduce((a, b) => a + b, 0) / recentRirs.length
    if (avg < DL.fatigueRir) return 'recent sets are near failure (avg RIR < 1)'
  }
  return null
}
