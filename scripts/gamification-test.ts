/**
 * Gamification badge proof (M7 C7). Pure, derived from primitives — no storage.
 * Run: tsx scripts/gamification-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { badges, earnedCount } from '../src/lib/gamification.ts'

const earnedIds = (i: Parameters<typeof badges>[0]): string[] =>
  badges(i).filter((b) => b.earned).map((b) => b.id)

// 1. a brand-new user earns nothing
assert.deepEqual(earnedIds({ sessionCount: 0, streakWeeks: 0, prCount: 0, goalCompletedCount: 0, activeGoalPct: null }), [], 'clean slate → no badges')

// 2. first session unlocks the entry badge only
assert.deepEqual(earnedIds({ sessionCount: 1, streakWeeks: 1, prCount: 0, goalCompletedCount: 0, activeGoalPct: null }), ['first-session'], 'one session → first-session')

// 3. thresholds fire independently
const veteran = { sessionCount: 12, streakWeeks: 4, prCount: 3, goalCompletedCount: 1, activeGoalPct: 80 }
const ids = earnedIds(veteran).sort()
assert.deepEqual(ids, ['first-pr', 'first-session', 'goal-crusher', 'goal-halfway', 'ten-sessions', 'streak-4'].sort(), 'veteran earns the full set')
assert.equal(earnedCount(badges(veteran)), 6, 'earnedCount matches')

// 4. goal-tied badges respect the active goal
assert.ok(!earnedIds({ sessionCount: 5, streakWeeks: 1, prCount: 0, goalCompletedCount: 0, activeGoalPct: 40 }).includes('goal-halfway'), '40% active goal → not halfway')
assert.ok(earnedIds({ sessionCount: 5, streakWeeks: 1, prCount: 0, goalCompletedCount: 0, activeGoalPct: 50 }).includes('goal-halfway'), '50% active goal → halfway earned')

// 5. every badge always carries a hint (for the locked-state UI)
assert.ok(badges({ sessionCount: 0, streakWeeks: 0, prCount: 0, goalCompletedCount: 0, activeGoalPct: null }).every((b) => b.hint.length > 0), 'all badges have hints')

console.log('✓ gamification test passed (thresholds, goal-tied badges, hints, earnedCount)')
