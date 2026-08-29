/**
 * Warm-up + plate-calculator proof. Pure functions, no DB.
 * Run: tsx scripts/lifting-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { warmupSets, platesFor, isWarmupSet, workSets, WARMUP_NOTE } from '../src/lib/lifting.ts'

// warm-up steps DOWN from last weight, rounded to 2.5kg, all lighter than working
assert.deepEqual(
  warmupSets(7.5).map((w) => w.kg),
  [2.5, 5],
  'maxed 7.5kg → warm up 2.5/5kg (all < 7.5)',
)
assert.ok(warmupSets(7.5).every((w) => w.kg < 7.5), 'every warm-up is lighter than working')
assert.deepEqual(warmupSets(0), [], 'no last weight → no warm-up sets')

// plate calculator, per side, 20kg bar
assert.deepEqual(platesFor(60), [20], '60kg = 20 bar + 20 per side')
assert.deepEqual(platesFor(100), [20, 20], '100kg = 20 bar + 40 per side (20+20)')
assert.deepEqual(platesFor(132.5), [20, 20, 15, 1.25], '132.5kg = 20 bar + 56.25 per side')
// Only the plates you own (M8.7): no 2.5s or 1.25s on the rack ⇒ the stack under-shoots rather
// than inventing a plate. 97.5 kg → 20 bar + 35/side is unreachable, closest is 20+15+5 = 90.
assert.deepEqual(platesFor(97.5, 20, [20, 15, 10, 5]), [20, 15], 'restricted inventory under-shoots')
assert.deepEqual(platesFor(60, 20, [10]), [10, 10], 'repeats the only plate it has')
// Warm-up rungs round to the equipment step, so a 5 kg stack never shows a 2.5 kg rung.
assert.ok(warmupSets(60, 5).every((w) => w.kg % 5 === 0), 'ramp rungs land on the 5 kg step')

assert.deepEqual(platesFor(20), [], 'empty bar → no plates')
assert.deepEqual(platesFor(15), [], 'below bar weight → no plates')


// each rung carries its own rep target, so tapping one logs a complete set (M8.6)
assert.deepEqual(warmupSets(60).map((w) => w.reps), [8, 5], 'heavier rung → fewer reps')
assert.ok(warmupSets(60).every((w) => w.kg > 0), 'rungs still carry weights')

// warm-up marker round-trip
assert.equal(isWarmupSet({ note: WARMUP_NOTE }), true, 'marker note identifies a ramp set')
assert.equal(isWarmupSet({ note: 'felt easy' }), false, 'an ordinary note is not a ramp')
assert.equal(isWarmupSet({ note: null }), false, 'no note is not a ramp')
assert.deepEqual(
  workSets([{ note: WARMUP_NOTE }, { note: null }, { note: 'tough' }]).length,
  2,
  'workSets drops only the ramps',
)

console.log('lifting-test: OK — warm-ups step down & lighter, plates per-side greedy')