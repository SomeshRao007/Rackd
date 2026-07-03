/**
 * Time-budget generator proof — the signature M4 behavior. Pure function, no DB.
 * Run: tsx scripts/generate-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { fitToBudget } from '../src/db/generate.ts'
import type { Exercise, PlannedPick } from '../src/db/schema.ts'

const ex = (id: string, mechanic: string): Exercise =>
  ({ id, name: id, primaryMuscles: [], mechanic }) as unknown as Exercise

const pick = (id: string): PlannedPick => ({
  slotId: id,
  slotLabel: id,
  exerciseId: id,
  exerciseName: id,
})

const exMap = new Map([
  ['squat', ex('squat', 'compound')],
  ['curl', ex('curl', 'isolation')],
])
const picks = [pick('squat'), pick('curl')]

const timing = { restSec: 120, workSec: 40 } // 160s per set

// no budget → DEFAULT_SETS at role-based reps (compound 8, isolation 12), and never a weight
{
  const out = fitToBudget(picks, exMap, 0)
  assert.deepEqual(out.map((p) => p.minSets), [2, 2], 'no budget → default 2 sets')
  assert.deepEqual(out.map((p) => p.targetReps), [8, 12], 'reps vary by role: compound 8, isolation 12')
  assert.ok(out.every((p) => !('weightKg' in p)), 'generator never sets weight/load')
}

// budget stays within the time and favors the compound with more sets
{
  const out = fitToBudget(picks, exMap, 30, 0, timing)
  const total = out.reduce((s, p) => s + (p.minSets as number) * (timing.restSec + timing.workSec), 0)
  assert.ok(total <= 30 * 60, 'fits within the 30-minute budget')
  const squat = out.find((p) => p.exerciseId === 'squat')!
  const curl = out.find((p) => p.exerciseId === 'curl')!
  assert.ok((squat.minSets as number) >= (curl.minSets as number), 'compound gets ≥ sets')
  assert.ok(out.every((p) => (p.minSets as number) >= 1), 'every pick keeps ≥ 1 set')
}

// tiny budget → 1 set each (never drops an exercise); reps stay role-based, not collapsed
{
  const out = fitToBudget(picks, exMap, 3, 0, timing)
  assert.deepEqual(out.map((p) => p.minSets), [1, 1], 'tiny budget → 1 set each, no exercise dropped')
  assert.deepEqual(out.map((p) => p.targetReps), [8, 12], 'reps stay role-based even when tight')
}

// user calibration matters: shorter rest/set time fits more sets in the same budget
{
  const sum = (o: typeof picks) => o.reduce((s, p) => s + (p.minSets as number), 0)
  const slow = fitToBudget(picks, exMap, 30, 0, { restSec: 180, workSec: 60 }) // 240s/set
  const fast = fitToBudget(picks, exMap, 30, 0, { restSec: 60, workSec: 30 }) //  90s/set
  assert.ok(sum(fast) > sum(slow), 'faster per-set timing fits more sets in the same budget')
}

// user-tunable set ceiling caps how high sets climb, even with a huge budget
{
  const out = fitToBudget(picks, exMap, 999, 0, { ...timing, maxSets: 3 })
  assert.ok(out.every((p) => (p.minSets as number) <= 3), 'no exercise exceeds the maxSets ceiling')
  assert.ok(out.some((p) => p.minSets === 3), 'a generous budget reaches the ceiling')
}

console.log('generate-test: OK — role reps, calibration + maxSets applied, compounds favored, no weight')
