/**
 * Unit test for the timed-circuit core (src/components/CircuitTimer.tsx): phase expansion + the
 * per-second tick reducer. Verifies work/rest ordering, rounds, the no-trailing-rest rule, the
 * zero-rest (mobility) case, and that ticking every second drives the whole circuit to `done` in
 * exactly the expected total time. Run: npx tsx scripts/circuit-test.ts
 */
import assert from 'node:assert/strict'
import { buildPhases, tick, type Pos } from '../src/lib/circuit'

// 2 stations, 30s work / 15s rest, 2 rounds → W R W R W R W (7 phases; no rest after the final work).
const p1 = buildPhases(['A', 'B'], 30, 15, 2)
assert.deepEqual(
  p1.map((p) => p.type),
  ['work', 'rest', 'work', 'rest', 'work', 'rest', 'work'],
  'work/rest interleave with no trailing rest',
)
assert.deepEqual(p1.map((p) => p.station), ['A', 'A', 'B', 'B', 'A', 'A', 'B'], 'rest keeps its station label')
assert.deepEqual(p1.map((p) => p.round), [1, 1, 1, 1, 2, 2, 2], 'round advances after all stations')

// Zero rest (mobility flow): pure work phases, no rests.
const p0 = buildPhases(['A', 'B', 'C'], 30, 0, 2)
assert.equal(p0.length, 6, '3 stations × 2 rounds = 6 work phases, no rests')
assert.ok(p0.every((p) => p.type === 'work'), 'restSec 0 → no rest phases')

// Drive the whole circuit one second at a time → must finish in sum(all phase seconds).
function runToEnd(phases: ReturnType<typeof buildPhases>): { seconds: number; work: number } {
  let pos: Pos = { idx: 0, left: phases[0].sec, done: false }
  let seconds = 0
  const guard = 100000
  while (!pos.done && seconds < guard) {
    pos = tick(phases, pos)
    seconds++
  }
  assert.ok(pos.done, 'circuit reaches done')
  return { seconds, work: phases.filter((p) => p.type === 'work').length }
}

const total1 = p1.reduce((n, p) => n + p.sec, 0) // 30*4 + 15*3 = 165
const r1 = runToEnd(p1)
assert.equal(r1.seconds, total1, `ticks to done in exactly ${total1}s`)
assert.equal(r1.work, 4, '2 stations × 2 rounds = 4 work bouts')

// Metabolic Burst shape: 6 stations, 30/30, 4 rounds.
const burst = buildPhases(['a', 'b', 'c', 'd', 'e', 'f'], 30, 30, 4)
assert.equal(burst.filter((p) => p.type === 'work').length, 24, '6×4 = 24 work bouts')
assert.equal(runToEnd(burst).seconds, burst.reduce((n, p) => n + p.sec, 0), 'burst finishes on time')

// Skip semantics: setting left=1 then ticking advances one phase (or finishes on the last).
const mid = tick(p1, { idx: 0, left: 1, done: false })
assert.deepEqual(mid, { idx: 1, left: 15, done: false }, 'skip from a work phase lands on its rest')
const end = tick(p1, { idx: p1.length - 1, left: 1, done: false })
assert.ok(end.done, 'skip on the final phase finishes the circuit')

console.log('✓ circuit test passed (phase expansion, no-trailing-rest, zero-rest, tick-to-done, skip)')
