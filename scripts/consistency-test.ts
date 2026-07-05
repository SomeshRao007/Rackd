/**
 * Consistency + detraining proof (M7 R10). Pure functions, no DB.
 * Run: tsx scripts/consistency-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { trainingStreak, detrainingRisk, daysSinceLastSession } from '../src/lib/consistency.ts'

// Day streak with rest-day grace: gaps ≤ 3 calendar days (up to 2 rest days) keep the run alive;
// a bigger gap breaks it. 4 training days here, gaps of 2, 2, 3 days — all within grace.
const d = ['2026-06-01', '2026-06-03', '2026-06-05', '2026-06-08']

// 1. four training days, run still alive today (1 day after the last)
let s = trainingStreak(d, '2026-06-09')
assert.equal(s.current, 4, 'current = 4 training days, all within the grace window')
assert.equal(s.best, 4, 'best = 4')

// 2. still alive at the edge of the grace window (3 days since last session)
s = trainingStreak(d, '2026-06-11')
assert.equal(s.current, 4, 'last session within grace → streak still alive')

// 3. streak dies once today is past the grace window (5 days off)
s = trainingStreak(d, '2026-06-13')
assert.equal(s.current, 0, 'gap beyond grace kills current streak')
assert.equal(s.best, 4, 'best is remembered')

// 4. a gap wider than grace splits the runs
const gapped = ['2026-06-01', '2026-06-03', '2026-06-10', '2026-06-12'] // 7-day gap in the middle
s = trainingStreak(gapped, '2026-06-13')
assert.equal(s.current, 2, 'current counts back only to the wide gap')
assert.equal(s.best, 2, 'best run is 2 (either side of the gap)')

// 4b. duplicate sessions on the same day count once
s = trainingStreak(['2026-06-01', '2026-06-01', '2026-06-02'], '2026-06-02')
assert.equal(s.current, 2, 'same-day sessions dedupe to one training day')

// 5. empty history
assert.deepEqual(trainingStreak([], '2026-06-30'), { current: 0, best: 0 }, 'no sessions → zeros')

// 6. detraining nudge thresholds (conservative — a few rest days are fine)
assert.equal(detrainingRisk(3), null, 'a few days off → no nag')
assert.equal(detrainingRisk(8)?.level, 'soon', '~1 week → soon')
assert.equal(detrainingRisk(15)?.level, 'slipping', '~2 weeks → slipping')
assert.equal(detrainingRisk(25)?.level, 'losing', '3+ weeks → losing')
assert.ok(detrainingRisk(15, 'Chest')?.message.includes('chest'), 'personalises to the top group')

// 7. days since last session
assert.equal(daysSinceLastSession(d, '2026-06-11'), 3, '3 days since 06-08')
assert.equal(daysSinceLastSession([], '2026-06-25'), null, 'no sessions → null')

console.log('✓ consistency test passed (day streak w/ rest-day grace, gap handling, detraining thresholds)')
