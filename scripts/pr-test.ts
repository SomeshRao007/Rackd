/**
 * Personal-record detection proof (M7 Part G). Pure functions, no DB.
 * Run: tsx scripts/pr-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { detectPRs, prsOn, type PRSet } from '../src/lib/pr.ts'

const mk = (exerciseId: string, weightKg: number, reps: number, createdAt: string): PRSet => ({
  exerciseId, exerciseName: exerciseId, weightKg, reps, rir: null, createdAt,
})

const sets: PRSet[] = [
  mk('bench', 60, 5, '2026-06-01T10:00:00Z'), // baseline — NOT a PR
  mk('bench', 62.5, 5, '2026-06-08T10:00:00Z'), // heavier → weight PR + e1rm PR
  mk('bench', 62.5, 7, '2026-06-15T10:00:00Z'), // same weight, more reps → e1rm PR only
  mk('bench', 60, 5, '2026-06-22T10:00:00Z'), // regress → no PR
  mk('squat', 100, 5, '2026-06-08T10:00:00Z'), // first squat — baseline, not a PR
]

const prs = detectPRs(sets)

// 1. the first set of an exercise never fires a PR
assert.ok(!prs.some((p) => p.createdAt === '2026-06-01T10:00:00Z'), 'baseline bench is not a PR')
assert.ok(!prs.some((p) => p.exerciseId === 'squat'), 'lone squat set is not a PR')

// 2. a heavier set is both a weight PR and an e1rm PR
const jun8 = prs.filter((p) => p.createdAt === '2026-06-08T10:00:00Z')
assert.deepEqual(jun8.map((p) => p.kind).sort(), ['e1rm', 'weight'], 'heavier set → weight + e1rm PR')
assert.equal(jun8.find((p) => p.kind === 'weight')?.value, 62.5, 'weight PR value = the new top weight')

// 3. same weight but more reps → e1rm PR only (no new top weight)
const jun15 = prs.filter((p) => p.createdAt === '2026-06-15T10:00:00Z')
assert.deepEqual(jun15.map((p) => p.kind), ['e1rm'], 'more reps at same weight → e1rm PR only')

// 4. a regression fires nothing
assert.ok(!prs.some((p) => p.createdAt === '2026-06-22T10:00:00Z'), 'lighter set → no PR')

// 5. bodyweight (0 kg) sets carry no load PR
const bw = detectPRs([mk('pullup', 0, 8, '2026-06-01T10:00:00Z'), mk('pullup', 0, 12, '2026-06-08T10:00:00Z')])
assert.equal(bw.length, 0, 'bodyweight sets → no weight/e1rm PR')

// 6. prsOn filters to a single day
assert.equal(prsOn(sets, '2026-06-08').length, 2, 'two PRs on 06-08')
assert.equal(prsOn(sets, '2026-06-22').length, 0, 'no PRs on the regression day')


// 6. warm-up ramps are excluded before the baseline scan (M8.6). Without the filter the 40 kg ramp
//    would become `seenWeighted`, so the very first work set would fire a bogus day-one PR.
const rampFirst = detectPRs([
  { exerciseId: 'dl', exerciseName: 'dl', weightKg: 40, reps: 5, rir: null, note: 'Warm-up', createdAt: '2026-06-01T10:00:00Z' },
  { exerciseId: 'dl', exerciseName: 'dl', weightKg: 100, reps: 5, rir: null, note: null, createdAt: '2026-06-01T10:05:00Z' },
])
assert.equal(rampFirst.length, 0, 'a ramp before the first work set does not create a day-one PR')

// …and a ramp never counts as a PR itself, even once a baseline exists.
const rampLater = detectPRs([
  { exerciseId: 'dl', exerciseName: 'dl', weightKg: 100, reps: 5, rir: null, note: null, createdAt: '2026-06-01T10:00:00Z' },
  { exerciseId: 'dl', exerciseName: 'dl', weightKg: 110, reps: 5, rir: null, note: 'Warm-up', createdAt: '2026-06-08T10:00:00Z' },
])
assert.equal(rampLater.length, 0, 'a heavy ramp is still not a PR')

console.log('✓ pr test passed (baseline skip, weight+e1rm PRs, rep-only e1rm, bodyweight skip, date filter)')