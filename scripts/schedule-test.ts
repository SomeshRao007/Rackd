/**
 * Enrollment schedule proof (M8.2) — pure rotation-over-weekdays math, no DB.
 * Run: tsx scripts/schedule-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { parseSchedule, nextUpIndex, forecast, weekdayOf } from '../src/lib/schedule.ts'

// parseSchedule: happy path + every rejection (missing, bad JSON, no weekdays)
assert.deepEqual(
  parseSchedule('{"start":"2026-07-09","weekdays":[1,4]}'),
  { start: '2026-07-09', weekdays: [1, 4] },
  'valid schedule parses',
)
assert.equal(parseSchedule(null), null, 'null → null')
assert.equal(parseSchedule('not json'), null, 'malformed JSON → null')
assert.equal(parseSchedule('{"start":"2026-07-09","weekdays":[]}'), null, 'no training days → null')

// nextUpIndex: fresh enrollment starts at day 0, sequence advances and wraps, unknown id restarts
assert.equal(nextUpIndex(['upper', 'lower'], null), 0, 'never finished → first day')
assert.equal(nextUpIndex(['upper', 'lower'], 'upper'), 1, 'after upper comes lower')
assert.equal(nextUpIndex(['upper', 'lower'], 'lower'), 0, 'after last day wraps to first')
assert.equal(nextUpIndex(['upper', 'lower'], 'deleted-day'), 0, 'unknown day id → restart at 0')

// forecast: 2026-07-09 is a Thursday; train Mon(1)+Thu(4) → Thu 9, Mon 13, Thu 16, Mon 20
const sched = { start: '2026-07-01', weekdays: [1, 4] }
assert.deepEqual(
  forecast(2, sched, 0, '2026-07-09', 4),
  [
    { date: '2026-07-09', dayIndex: 0 },
    { date: '2026-07-13', dayIndex: 1 },
    { date: '2026-07-16', dayIndex: 0 },
    { date: '2026-07-20', dayIndex: 1 },
  ],
  'training dates land on chosen weekdays; day indexes rotate and wrap',
)

// self-healing: missed Thursday → Monday simply picks up where the rotation left off
assert.deepEqual(
  forecast(2, sched, 1, '2026-07-13', 2),
  [
    { date: '2026-07-13', dayIndex: 1 },
    { date: '2026-07-16', dayIndex: 0 },
  ],
  'a missed session shifts the sequence forward instead of skipping a plan day',
)

// a future start date is respected even when forecasting from today
assert.deepEqual(
  forecast(1, { start: '2026-07-10', weekdays: [5] }, 0, '2026-07-09', 1),
  [{ date: '2026-07-10', dayIndex: 0 }],
  'forecast never predates schedule.start',
)

// degenerate inputs return empty instead of looping
assert.deepEqual(forecast(0, sched, 0, '2026-07-09', 3), [], 'no plan days → empty')
assert.deepEqual(forecast(2, { start: '2026-07-01', weekdays: [] }, 0, '2026-07-09', 3), [], 'no weekdays → empty')

assert.equal(weekdayOf('2026-07-09'), 4, '2026-07-09 is a Thursday')

console.log('schedule-test: OK — parse guards, rotation wrap, weekday forecast, self-healing')
