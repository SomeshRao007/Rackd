/**
 * Recovery-readiness proof (M7 C5). Pure functions, no DB.
 * Run: tsx scripts/readiness-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { readinessScore, readinessFactor, readinessLabel } from '../src/lib/readiness.ts'

// 1. score = plain average of three 0..2 taps → 0..100
assert.equal(readinessScore({ sleep: 2, soreness: 2, energy: 2 }), 100, 'all fresh → 100')
assert.equal(readinessScore({ sleep: 0, soreness: 0, energy: 0 }), 0, 'all wrecked → 0')
assert.equal(readinessScore({ sleep: 1, soreness: 1, energy: 1 }), 50, 'middling → 50')
assert.equal(readinessScore({ sleep: 5, soreness: -3, energy: 2 }), Math.round((4 / 6) * 100), 'inputs clamp to 0..2 (2+0+2=4)')

// 2. factor: fresh trains as prescribed; low days ease off but never below the 0.90 floor
assert.equal(readinessFactor(100), 1, 'fresh → no reduction')
assert.equal(readinessFactor(67), 1, 'okay-across-the-board → no reduction')
assert.equal(readinessFactor(0), 0.9, 'worst day → 10% floor, never more')
const f33 = readinessFactor(33)
assert.ok(f33 > 0.9 && f33 < 1, `mid-low ramps between floor and 1 (got ${f33})`)
assert.ok(readinessFactor(20) < readinessFactor(50), 'lower score → lower factor (monotonic)')
for (let s = 0; s <= 100; s += 5) assert.ok(readinessFactor(s) >= 0.9, `factor never below floor at ${s}`)

// 3. band labels
assert.equal(readinessLabel(90), 'Fresh')
assert.equal(readinessLabel(50), 'Okay')
assert.equal(readinessLabel(10), 'Run down')

console.log('✓ readiness test passed (score average + clamp, factor floor/ramp/monotonic, labels)')
