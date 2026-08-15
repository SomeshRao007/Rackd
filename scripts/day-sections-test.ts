/**
 * Today's section grouping (post-M8.4). Pure functions, no DB.
 * Locks down the two things the rail depends on: sections come out in the order you train them,
 * and a slot that runs several movements stays ONE section instead of splitting per exercise.
 * Run: tsx scripts/day-sections-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { groupPicksBySection, sectionProgress } from '../src/lib/daySections.ts'
import type { PlannedPick } from '../src/db/schema.ts'

const pick = (slotId: string, slotLabel: string, exerciseId: string, minSets?: number): PlannedPick => ({
  slotId,
  slotLabel,
  exerciseId,
  exerciseName: exerciseId,
  ...(minSets == null ? {} : { minSets }),
})

// A push day: chest runs two movements off one slot (the `~1` suffix StartDay's multi-select mints).
const picks: PlannedPick[] = [
  pick('s1', 'Chest', 'Bench_Press', 3),
  pick('s1~1', 'Chest', 'Incline_Press', 2),
  pick('s2', 'Side delts', 'Lateral_Raise', 3),
  pick('s3', 'Triceps', 'Pushdown', 2),
]

// ── grouping ────────────────────────────────────────────────────────────────
const sections = groupPicksBySection(picks)
assert.deepEqual(sections.map((s) => s.label), ['Chest', 'Side delts', 'Triceps'], 'first-appearance order')
assert.equal(sections[0].picks.length, 2, 'a multi-movement slot collapses into one section')
assert.equal(sections[1].picks.length, 1)

// Order is appearance-based, not alphabetical — reversing the input reverses the sections.
assert.deepEqual(
  groupPicksBySection([...picks].reverse()).map((s) => s.label),
  ['Triceps', 'Side delts', 'Chest'],
)

// Non-adjacent picks sharing a label still land in the one section (an ad-hoc add appended at the
// end, keyed by primary muscle, joins its section rather than opening a duplicate).
const withLateAdd = [...picks, pick('uuid-1', 'Chest', 'Cable_Fly', 2)]
const late = groupPicksBySection(withLateAdd)
assert.equal(late.length, 3, 'a late pick joins its existing section')
assert.equal(late[0].picks.length, 3)

// A blank label (older synced picks) buckets rather than rendering an empty eyebrow.
assert.equal(groupPicksBySection([pick('s9', '', 'Mystery')])[0].label, 'Other')
assert.deepEqual(groupPicksBySection([]), [])

// ── progress ────────────────────────────────────────────────────────────────
const counts = new Map([['Bench_Press', 3], ['Incline_Press', 1]])
assert.deepEqual(sectionProgress(sections[0], counts), { logged: 4, target: 5, done: false }, 'sums across the section')
assert.deepEqual(
  sectionProgress(sections[0], new Map([['Bench_Press', 3], ['Incline_Press', 2]])),
  { logged: 5, target: 5, done: true },
  'done once every pick’s target is covered',
)
// Overshooting one lift still counts — the section header tracks the section, not per-lift caps.
assert.equal(sectionProgress(sections[0], new Map([['Bench_Press', 9]])).done, true)
assert.deepEqual(sectionProgress(sections[2], new Map()), { logged: 0, target: 2, done: false })

// No target (a Freestyle day: addPickToDay sets minSets, but an untargeted pick must not read as
// done at 0/0 — that would paint the whole section green before a single set).
const untargeted = groupPicksBySection([pick('s4', 'Core', 'Plank')])[0]
assert.deepEqual(sectionProgress(untargeted, new Map()), { logged: 0, target: 0, done: false })
assert.equal(sectionProgress(untargeted, new Map([['Plank', 4]])).done, false)

console.log('✓ day-sections: grouping order, multi-movement slots, late adds, section progress')
