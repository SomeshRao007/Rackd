/**
 * Rotation core proof — the signature M3 behavior. Pure function, no DB.
 * Run: tsx scripts/rotation-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { pickLeastRecent, chooseFromPool } from '../src/db/plans.ts'

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

// ── anchor-first (chooseFromPool): the pool's lead lift wins whenever it survives the kit filter,
// so progressive overload isn't reset every session once pools are 4–5 deep.
const trained = { bench: '2026-01-01T00:00:00Z', db: null, machine: null }
assert.equal(
  chooseFromPool(['bench', 'db', 'machine'], ['bench', 'db', 'machine'], trained),
  'bench',
  'anchor wins over a never-trained alternative',
)
assert.equal(
  chooseFromPool(['bench', 'db', 'machine'], ['db', 'machine'], trained),
  'db',
  'anchor filtered out → least-recently-trained survivor leads',
)
assert.equal(
  chooseFromPool(['bench'], ['bench'], {}),
  'bench',
  'single-exercise pool returns its anchor',
)

console.log('rotation-test: OK — anchor-first, then never-trained, then oldest, tiebreak pool order')
