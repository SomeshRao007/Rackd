/**
 * Goal-engine proof (M6 R6/R7). Pure functions, no DB.
 * Run: tsx scripts/goals-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { goalProgress, goalOutcome, goalSuggestions, priorClosedGoal } from '../src/lib/goals.ts'
import type { Goal } from '../src/db/schema.ts'
import type { GroupTally } from '../src/lib/volume.ts'

const goal = (p: Partial<Goal>): Goal => ({
  id: 'g', userId: 'u1', type: 'hypertrophy', title: 'Goal', emphasis: null,
  targetMetric: 'volume', targetExerciseId: null, targetValue: 12, baselineValue: null,
  deadline: null, status: 'active', outcome: null,
  createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z', deletedAt: null,
  ...p,
})
const grp = (group: string, sets: number): GroupTally =>
  ({ group, sets, volumeKg: sets * 500, muscles: [] } as GroupTally)

// 1. progress — higher-is-better (volume)
assert.equal(goalProgress(goal({ targetMetric: 'volume', targetValue: 12 }), 6), 50, 'volume 6/12 = 50%')

// 2. progress — fat-loss (lower-is-better, uses baseline)
const cut = goal({ type: 'fatloss', targetMetric: 'bodyweight', baselineValue: 90, targetValue: 80 })
assert.equal(goalProgress(cut, 85), 50, 'bodyweight 90→80, at 85 = 50%')
assert.equal(goalProgress(cut, 90), 0, 'no movement yet = 0%')

// 3. outcome — hit vs miss
assert.deepEqual(goalOutcome(goal({ targetValue: 12 }), 12), { finalValue: 12, hitTarget: true, pct: 100 }, 'hit')
assert.equal(goalOutcome(goal({ targetValue: 12 }), 6).hitTarget, false, 'miss')

// 4. suggestions — hypertrophy emphasis=back, target 12
const g = goal({ type: 'hypertrophy', targetValue: 12, emphasis: JSON.stringify(['back']) })
const under = goalSuggestions(g, [grp('back', 4), grp('chest', 3)])
assert.equal(under.find((s) => s.group === 'back')?.action, 'add', 'under-served emphasis → add')

const over = goalSuggestions(g, [grp('back', 13), grp('chest', 18)])
assert.equal(over.find((s) => s.group === 'back')?.action, 'keep', 'met emphasis → keep')
assert.equal(over.find((s) => s.group === 'chest')?.action, 'reduce', 'over-trained non-emphasis → reduce')

// 5. non-hypertrophy → no exercise suggestions
assert.deepEqual(goalSuggestions(goal({ type: 'strength', targetMetric: 'e1rm' }), [grp('back', 9)]), [], 'strength → []')

// 6. prior closed goal — latest finished one, ignoring the active
const history: Goal[] = [
  goal({ id: 'a', status: 'active', updatedAt: '2026-07-05T00:00:00Z' }),
  goal({ id: 'b', status: 'completed', updatedAt: '2026-06-01T00:00:00Z' }),
  goal({ id: 'c', status: 'abandoned', updatedAt: '2026-06-20T00:00:00Z' }),
]
assert.equal(priorClosedGoal(history)?.id, 'c', 'picks the most recent finished goal')
assert.equal(priorClosedGoal([goal({ status: 'active' })]), null, 'no finished goal → null')

console.log('✓ goals test passed (progress, fat-loss direction, outcome, add/keep/reduce, prior-goal memory)')
