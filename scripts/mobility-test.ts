/**
 * Warm-up / cooldown derivation proof (M8.4). Pure function, no DB.
 * The bug this locks down: the old version sliced BOTH lists off one filtered array, so the
 * cooldown repeated three of the four warm-up moves and never varied between days.
 * Run: tsx scripts/mobility-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { deriveMobility } from '../src/db/plans.ts'
import { isWarmupMove, rotateBy } from '../src/lib/mobility.ts'
import type { Exercise, PlannedPick } from '../src/db/schema.ts'

const ex = (id: string, muscle: string, category = 'stretching'): Exercise =>
  ({ id, name: id, primaryMuscles: [muscle], secondaryMuscles: [], category }) as Exercise

// A catalog with real dynamic ids (in WARMUP_IDS) + static holds + one strength lift.
const catalog: Exercise[] = [
  ex('Arm_Circles', 'shoulders'),
  ex('Shoulder_Circles', 'shoulders'),
  ex('Elbow_Circles', 'shoulders'),
  ex('Dynamic_Chest_Stretch', 'chest'),
  // eight static chest holds — the real catalog has 134 stretches, so the rotation needs a pool
  // deep enough to actually move (with only 3 candidates every offset yields the same set).
  ...['Doorway_Pec', 'Behind_Head', 'Stability_Ball', 'Above_Head', 'Wall_Corner', 'Floor_Angel', 'Bench_Pec', 'Towel_Pec'].map(
    (n) => ex(`${n}_Stretch`, 'chest'),
  ),
  ex('Pigeon_Pose', 'glutes'),
  ex('Barbell_Bench_Press', 'chest', 'strength'),
]
const exMap = new Map(catalog.map((e) => [e.id, e]))
const pick = (exerciseId: string): PlannedPick =>
  ({ slotId: exerciseId, slotLabel: 'x', exerciseId, exerciseName: exerciseId }) as PlannedPick

// ── the regression: warm-up and cooldown must never share a move ──
{
  const { warmup = [], cooldown = [] } = deriveMobility('push-a', [pick('Barbell_Bench_Press')], exMap)
  const overlap = warmup.filter((w) => cooldown.some((c) => c.exerciseId === w.exerciseId))
  assert.deepEqual(overlap, [], 'warm-up and cooldown share no moves')
  assert.ok(warmup.length > 0 && cooldown.length > 0, 'both lists are populated')
}

// warm-up takes only dynamic movers; cooldown takes what's left (the static holds)
{
  const { warmup = [], cooldown = [] } = deriveMobility('push-a', [pick('Barbell_Bench_Press')], exMap)
  assert.ok(warmup.every((s) => isWarmupMove({ id: s.exerciseId } as Exercise)), 'warm-up is all dynamic')
  assert.ok(cooldown.some((s) => !isWarmupMove({ id: s.exerciseId } as Exercise)), 'cooldown includes static holds')
}

// only mobility is eligible — a strength lift never becomes a stretch
{
  const { warmup = [], cooldown = [] } = deriveMobility('push-a', [pick('Barbell_Bench_Press')], exMap)
  const ids = [...warmup, ...cooldown].map((s) => s.exerciseId)
  assert.ok(!ids.includes('Barbell_Bench_Press'), 'a strength lift is never proposed as mobility')
}

// caps: 3 warm-up, 4 cooldown, 30s default hold
{
  const { warmup = [], cooldown = [] } = deriveMobility('push-a', [pick('Barbell_Bench_Press')], exMap)
  assert.ok(warmup.length <= 3, 'at most 3 warm-up moves')
  assert.ok(cooldown.length <= 4, 'at most 4 cooldown moves')
  assert.ok([...warmup, ...cooldown].every((s) => s.sec === 30), 'defaults to a 30s hold')
}

// different days open differently (deterministic rotation, not Math.random)
{
  const a = deriveMobility('push-a', [pick('Barbell_Bench_Press')], exMap).cooldown ?? []
  const b = deriveMobility('push-b-legs-and-more', [pick('Barbell_Bench_Press')], exMap).cooldown ?? []
  assert.notDeepEqual(a, b, 'different dayIds propose different moves')
  const again = deriveMobility('push-a', [pick('Barbell_Bench_Press')], exMap).cooldown ?? []
  assert.deepEqual(a, again, 'same dayId is stable across calls')
}

// nothing to train → no mobility at all, rather than an empty shell
assert.deepEqual(deriveMobility('push-a', [], exMap), {}, 'no picks → no mobility')

// a muscle with only static holds available still gets a cooldown (warm-up just comes back empty)
{
  const glutesOnly = new Map([['Pigeon_Pose', ex('Pigeon_Pose', 'glutes')]])
  const r = deriveMobility('x', [pick('Pigeon_Pose')], glutesOnly)
  assert.deepEqual(r.warmup, [], 'no dynamic movers available → empty warm-up')
  assert.deepEqual(r.cooldown?.map((s) => s.exerciseId), ['Pigeon_Pose'], 'static hold still proposed')
}

// rotateBy is a pure rotation: same length, same members, offset by the key
{
  assert.deepEqual(rotateBy([], 'k'), [], 'empty list is safe')
  assert.deepEqual(rotateBy(['a'], 'k'), ['a'], 'single item is safe')
  const r = rotateBy(['a', 'b', 'c'], 'bb')
  assert.equal(r.length, 3, 'rotation preserves length')
  assert.deepEqual([...r].sort(), ['a', 'b', 'c'], 'rotation preserves members')
}

console.log('mobility-test: OK — no warm-up/cooldown overlap, dynamic-vs-static split, per-day rotation, caps')
