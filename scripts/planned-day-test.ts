/**
 * plannedDay blob helpers (M8.6) — contained parsing, skip filtering, and the rotation scan.
 * Pure functions, no DB.
 * Run: tsx scripts/planned-day-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { parsePlannedDay, isSkipped, trainedSessions, lastCompletedDay } from '../src/lib/plannedDay.ts'

const day = (planId: string, dayId: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ planId, dayId, label: dayId, picks: [], ...extra })

const sess = (date: string, plannedDay: string | null, finishedAt: string | null = null) => ({
  date,
  plannedDay,
  finishedAt,
})

// ── parsePlannedDay: the one place a corrupt synced blob is allowed to fail ──
assert.equal(parsePlannedDay(null), null, 'null → null')
assert.equal(parsePlannedDay(undefined), null, 'undefined → null')
assert.equal(parsePlannedDay(''), null, 'empty string → null')
assert.equal(parsePlannedDay('{not json'), null, 'corrupt JSON → null, never throws')
assert.equal(parsePlannedDay(day('p1', 'legs'))?.dayId, 'legs', 'valid blob parses')

// ── isSkipped / trainedSessions ──
assert.equal(isSkipped(sess('2026-08-01', day('p1', 'legs', { skipped: true }))), true, 'skipped flag detected')
assert.equal(isSkipped(sess('2026-08-01', day('p1', 'legs'))), false, 'ordinary day is not skipped')
assert.equal(isSkipped(sess('2026-08-01', null)), false, 'no plannedDay is not skipped')

const mixed = [
  sess('2026-08-01', day('p1', 'push'), 'ts'),
  sess('2026-08-02', day('p1', 'legs', { skipped: true })),
  sess('2026-08-03', day('', 'adhoc'), 'ts'),
  sess('2026-08-04', null, 'ts'),
]
assert.deepEqual(
  trainedSessions(mixed).map((s) => s.date),
  ['2026-08-01', '2026-08-03', '2026-08-04'],
  'trainedSessions drops only the skip row — freestyle and blob-less rows still count',
)

// ── lastCompletedDay: what advances the rotation ──
assert.equal(lastCompletedDay([], 'p1'), null, 'no sessions → null')
assert.equal(
  lastCompletedDay([sess('2026-08-01', day('p1', 'push'))], 'p1'),
  null,
  'started but neither finished nor skipped → does NOT advance',
)
assert.deepEqual(
  lastCompletedDay([sess('2026-08-01', day('p1', 'push'), 'ts')], 'p1'),
  { date: '2026-08-01', dayId: 'push' },
  'finished day advances',
)
// The whole point of the feature: a skip moves the rotation on without being a training day.
assert.deepEqual(
  lastCompletedDay([sess('2026-08-02', day('p1', 'legs', { skipped: true }))], 'p1'),
  { date: '2026-08-02', dayId: 'legs' },
  'skipped day advances even though finishedAt is null',
)
assert.equal(
  lastCompletedDay([sess('2026-08-01', day('p2', 'push'), 'ts')], 'p1'),
  null,
  'another plan’s day is ignored',
)
assert.deepEqual(
  lastCompletedDay([sess('2026-08-01', '{corrupt', 'ts'), sess('2026-08-02', day('p1', 'pull'), 'ts')], 'p1'),
  { date: '2026-08-02', dayId: 'pull' },
  'corrupt blob is skipped without throwing',
)
assert.deepEqual(
  lastCompletedDay(
    [
      sess('2026-08-05', day('p1', 'pull'), 'ts'),
      sess('2026-08-09', day('p1', 'legs', { skipped: true })),
      sess('2026-08-07', day('p1', 'push'), 'ts'),
    ],
    'p1',
  ),
  { date: '2026-08-09', dayId: 'legs' },
  'newest by date wins across a mixed, unordered list',
)

console.log('planned-day-test: OK — contained parse, skip filtering, rotation advances on finish OR skip')
