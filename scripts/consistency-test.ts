/**
 * Consistency + detraining proof (M7 R10). Pure functions, no DB.
 * Run: tsx scripts/consistency-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { trainingStreak, detrainingRisk, daysSinceLastSession } from '../src/lib/consistency.ts'

// Dates 7 days apart are always consecutive weeks (7 days = exactly one weekIndex step).
const w = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22'] // 4 consecutive weeks

// 1. four-in-a-row, still training this week
let s = trainingStreak(w, '2026-06-24')
assert.equal(s.current, 4, 'current = 4 consecutive weeks')
assert.equal(s.best, 4, 'best = 4')

// 2. streak stays alive if you trained LAST week but not yet this week
s = trainingStreak(w, '2026-06-29') // week after 06-22
assert.equal(s.current, 4, 'trained last week → streak still alive')

// 3. streak dies after a fully missed week
s = trainingStreak(w, '2026-07-13') // 3 weeks past last session
assert.equal(s.current, 0, 'gap kills current streak')
assert.equal(s.best, 4, 'best is remembered')

// 4. a mid gap splits the runs
const gapped = ['2026-06-01', '2026-06-08', '2026-06-22', '2026-06-29'] // skip the 06-15 week
s = trainingStreak(gapped, '2026-06-30')
assert.equal(s.current, 2, 'current counts back only to the gap')
assert.equal(s.best, 2, 'best run is 2 (either side of the gap)')

// 5. empty history
assert.deepEqual(trainingStreak([], '2026-06-30'), { current: 0, best: 0 }, 'no sessions → zeros')

// 6. detraining nudge thresholds (conservative — a few rest days are fine)
assert.equal(detrainingRisk(3), null, 'a few days off → no nag')
assert.equal(detrainingRisk(8)?.level, 'soon', '~1 week → soon')
assert.equal(detrainingRisk(15)?.level, 'slipping', '~2 weeks → slipping')
assert.equal(detrainingRisk(25)?.level, 'losing', '3+ weeks → losing')
assert.ok(detrainingRisk(15, 'Chest')?.message.includes('chest'), 'personalises to the top group')

// 7. days since last session
assert.equal(daysSinceLastSession(w, '2026-06-25'), 3, '3 days since 06-22')
assert.equal(daysSinceLastSession([], '2026-06-25'), null, 'no sessions → null')

console.log('✓ consistency test passed (weekly streak current/best, gap handling, detraining thresholds)')
