/**
 * Plan-day auto-match proof (M6 R6 "ADD" wiring) — pure function, no DB.
 * Run: tsx scripts/plan-add-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { pickPlanDayForGroup } from '../src/db/plans.ts'
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

console.log('plan-add-test: OK — auto-match to most-trained day, circuit-skip, first-day fallback')
