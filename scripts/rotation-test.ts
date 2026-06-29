/**
 * Rotation core proof — the signature M3 behavior. Pure function, no DB.
 * Run: tsx scripts/rotation-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { pickLeastRecent } from '../src/db/plans.ts'

// never-trained (null) rotates in BEFORE any trained exercise
assert.equal(
  pickLeastRecent(['a', 'b', 'c'], { a: '2026-01-01T00:00:00Z', b: null, c: '2026-02-01T00:00:00Z' }),
  'b',
  'never-trained exercise is picked first',
)

// among trained, the least-recently-trained (oldest createdAt) wins
assert.equal(
  pickLeastRecent(['a', 'b'], { a: '2026-03-01T00:00:00Z', b: '2026-01-01T00:00:00Z' }),
  'b',
  'oldest createdAt rotates in next',
)

// ties resolve to pool order (we only replace on a STRICTLY smaller timestamp)
assert.equal(pickLeastRecent(['x', 'y'], { x: null, y: null }), 'x', 'all-never ties → pool order')
assert.equal(
  pickLeastRecent(['x', 'y'], { x: '2026-01-01T00:00:00Z', y: '2026-01-01T00:00:00Z' }),
  'x',
  'equal timestamps → pool order',
)

// single-exercise pool returns its one exercise
assert.equal(pickLeastRecent(['only'], {}), 'only', 'single-exercise pool returns it')

console.log('rotation-test: OK — never-trained first, then oldest, tiebreak pool order')
