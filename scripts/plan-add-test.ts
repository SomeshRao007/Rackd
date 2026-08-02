/**
 * Plan-day auto-match proof (M6 R6 "ADD" wiring) — pure function, no DB.
 * Run: tsx scripts/plan-add-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { pickPlanDayForGroup, mergeStarterPools } from '../src/db/plans.ts'
import type { PlanDay } from '../src/db/schema.ts'
import type { MuscleGroupId } from '../src/lib/muscles.ts'

const day = (id: string, mode: PlanDay['mode'], pools: string[][]): PlanDay => ({
  id,
  label: id,
  mode,
  slots: pools.map((p, i) => ({ id: `${id}-${i}`, label: `${id}-${i}`, exercisePool: p })),
})
// exercise-id → muscle group map (undefined ids score 0, like an unknown catalog entry)
const gmap = new Map<string, MuscleGroupId | undefined>([
  ['back1', 'back'], ['back2', 'back'], ['chest1', 'chest'], ['leg1', 'legs'],
])

// lands on the day already training the target group the most
{
  const push = day('push', undefined, [['chest1']])
  const pull = day('pull', undefined, [['back1'], ['back2']])
  assert.equal(pickPlanDayForGroup([push, pull], gmap, 'back')?.id, 'pull', 'most-back day wins')
}

// no day trains the group → first day (ties resolve to pool order via strict >)
{
  const a = day('a', undefined, [['chest1']])
  const b = day('b', undefined, [['leg1']])
  assert.equal(pickPlanDayForGroup([a, b], gmap, 'back')?.id, 'a', 'no-match → first day')
}

// circuit days are excluded so a strength add doesn't become a timed station
{
  const circuit = day('circ', 'circuit', [['back1'], ['back2']]) // most back, but timed stations
  const strength = day('str', undefined, [['chest1']])
  assert.equal(pickPlanDayForGroup([circuit, strength], gmap, 'back')?.id, 'str', 'circuit day skipped')
}

// all-circuit plan → no non-circuit candidates, still auto-matches among the circuit days
{
  const c1 = day('c1', 'circuit', [['chest1']])
  const c2 = day('c2', 'circuit', [['back1']])
  assert.equal(pickPlanDayForGroup([c1, c2], gmap, 'back')?.id, 'c2', 'all-circuit → most-trained fallback')
}

// empty plan → null
assert.equal(pickPlanDayForGroup([], gmap, 'back'), null, 'no days → null')

// ── mergeStarterPools: pull alternatives a starter gained after this plan was adopted ──
{
  const adopted = [day('push', undefined, [['bench'], ['ohp']])]
  const starter = [day('push', undefined, [['bench', 'db', 'machine'], ['ohp']])]
  const { days, added } = mergeStarterPools(adopted, starter)
  assert.equal(added, 2, 'counts only the entries the plan was missing')
  assert.deepEqual(days[0].slots[0].exercisePool, ['bench', 'db', 'machine'], 'appends after the anchor')
  assert.deepEqual(days[0].slots[1].exercisePool, ['ohp'], 'untouched slot keeps its pool')
}

// re-running is a no-op, and a hand-reordered anchor survives (append-only)
{
  const adopted = [day('push', undefined, [['db', 'bench']])] // user promoted db to the anchor
  const starter = [day('push', undefined, [['bench', 'db']])]
  const { days, added } = mergeStarterPools(adopted, starter)
  assert.equal(added, 0, 'nothing new to add')
  assert.deepEqual(days[0].slots[0].exercisePool, ['db', 'bench'], "user's anchor is not reset")
}

// days/slots the starter no longer has (user-added) are left alone
{
  const adopted = [day('mine', undefined, [['bench']])]
  const { days, added } = mergeStarterPools(adopted, [day('push', undefined, [['bench', 'db']])])
  assert.equal(added, 0, 'unmatched day is skipped')
  assert.deepEqual(days[0].slots[0].exercisePool, ['bench'], 'unmatched day keeps its pool')
}

console.log('plan-add-test: OK — auto-match to most-trained day, circuit-skip, first-day fallback, starter pool merge')
