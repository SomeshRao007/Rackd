// Goal engine (M6 R6/R7). Pure — no DB, no React. The DB layer (src/db/goals.ts) feeds it the
// current metric value + per-group volume and attaches concrete exercise picks.

import type { Goal } from '../db/schema'
import { GROUP_LABELS, type MuscleGroupId } from './muscles'
import type { GroupTally } from './volume'

export type GoalType = 'hypertrophy' | 'strength' | 'fatloss'
export type GoalMetric = 'volume' | 'e1rm' | 'bodyweight'

// Create-form descriptors (mirrors SCHEMES in suggest.ts). type→metric is fixed here.
export const GOAL_TYPES: { type: GoalType; label: string; metric: GoalMetric; blurb: string }[] = [
  { type: 'hypertrophy', label: 'Build muscle', metric: 'volume', blurb: 'Hit a weekly-sets target for the muscle groups you pick.' },
  { type: 'strength', label: 'Get stronger', metric: 'e1rm', blurb: 'Push the estimated 1-rep-max on one lift toward a number.' },
  { type: 'fatloss', label: 'Lose weight', metric: 'bodyweight', blurb: 'Trend your bodyweight down toward a target.' },
]

export const goalTypeLabel = (type: string): string =>
  GOAL_TYPES.find((g) => g.type === type)?.label ?? type

/** Percent toward target (0..100+, integer). Bodyweight is lower-is-better (uses baselineValue). */
export function goalProgress(goal: Goal, currentValue: number): number {
  if (goal.targetMetric === 'bodyweight') {
    const base = goal.baselineValue
    if (base == null || base === goal.targetValue) return 0
    return Math.max(0, Math.round(((base - currentValue) / (base - goal.targetValue)) * 100))
  }
  if (!goal.targetValue) return 0
  return Math.max(0, Math.round((currentValue / goal.targetValue) * 100))
}

/** Outcome stamped at close (R7 memory). hitTarget once progress reaches 100%. */
export function goalOutcome(goal: Goal, currentValue: number): { finalValue: number; hitTarget: boolean; pct: number } {
  const pct = goalProgress(goal, currentValue)
  return { finalValue: currentValue, hitTarget: pct >= 100, pct }
}

export type GoalSuggestion = { group: MuscleGroupId; action: 'add' | 'reduce' | 'keep'; reason: string }

/** R6 advisory add/remove/keep. Meaningful for hypertrophy (emphasis-driven); others return []. */
export function goalSuggestions(goal: Goal, groups: GroupTally[]): GoalSuggestion[] {
  if (goal.type !== 'hypertrophy') return []
  const emphasis: MuscleGroupId[] = goal.emphasis ? JSON.parse(goal.emphasis) : []
  if (!emphasis.length) return []
  const target = goal.targetValue
  const setsOf = Object.fromEntries(groups.map((g) => [g.group, g.sets])) as Record<MuscleGroupId, number>
  const out: GoalSuggestion[] = []
  const emphasisSet = new Set(emphasis)

  for (const g of emphasis) {
    const sets = setsOf[g] ?? 0
    const label = GROUP_LABELS[g]
    if (sets < target * 0.75) out.push({ group: g, action: 'add', reason: `${label}: ${sets} of ${target} target weekly sets — add a movement.` })
    else if (sets >= target) out.push({ group: g, action: 'keep', reason: `${label}: on track (${sets} sets).` })
    else out.push({ group: g, action: 'keep', reason: `${label}: close (${sets} of ${target}).` })
  }
  // ponytail: hypertrophy-only advice; strength/fat-loss ride the progress bar (see m6-deferred.md #5).
  for (const g of groups) {
    if (!emphasisSet.has(g.group) && g.sets > target) {
      out.push({ group: g.group, action: 'reduce', reason: `${GROUP_LABELS[g.group]}: ${g.sets} sets — trim to focus your goal.` })
    }
  }
  return out
}

/** Most recent finished (completed|abandoned) goal — the one the R7 prompt offers to factor in. */
export function priorClosedGoal(history: Goal[]): Goal | null {
  const closed = history
    .filter((g) => g.status !== 'active')
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  return closed[0] ?? null
}
