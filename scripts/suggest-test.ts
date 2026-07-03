/**
 * Progression-engine proof (M5). Pure functions, no DB.
 * Run: tsx scripts/suggest-test.ts  (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { suggestNext, deloadDue, type HistorySet } from '../src/lib/suggest.ts'
import { epley1RM, roundToStep } from '../src/lib/lifting.ts'
import { daysBetween, weekIndex } from '../src/lib/dates.ts'

const TODAY = '2026-07-02'
const set = (
  sessionId: string,
  weightKg: number,
  reps: number,
  rir: number | null = null,
  createdAt = '2026-07-01T10:00:00Z',
): HistorySet => ({ sessionId, weightKg, reps, rir, createdAt })

// 1. no history → null (UI shows calibration prompt)
assert.equal(suggestNext({ history: [], scheme: 'double', today: TODAY }), null, 'empty history → null')

// 2. double mid-range: same weight, one more rep
const mid = suggestNext({ history: [set('s1', 60, 10, 2)], scheme: 'double', today: TODAY })!
assert.equal(mid.weightKg, 60, 'mid-range holds weight')
assert.equal(mid.targetReps, 11, 'mid-range adds a rep')

// 3. promotion: 12 reps @ RIR 2 → +2.5 kg, reps reset to 8
const promo = suggestNext({ history: [set('s1', 60, 12, 2)], scheme: 'double', today: TODAY })!
assert.equal(promo.weightKg, 62.5, 'promotion adds 2.5 kg')
assert.equal(promo.targetReps, 8, 'promotion resets reps to 8')
assert.ok(promo.reason.includes('+2.5'), 'promotion reason mentions +2.5')

// 4. RIR-blocked promotion: 12 reps but RIR 0 → hold at 12 (rule order: 12-reps check wins over RIR-0 hold)
const blocked = suggestNext({ history: [set('s1', 60, 12, 0)], scheme: 'double', today: TODAY })!
assert.equal(blocked.weightKg, 60, 'RIR-blocked promotion holds weight')
assert.equal(blocked.targetReps, 12, 'RIR-blocked promotion keeps target at 12')

// 5. RIR-0 hold mid-range: failure last time → repeat, don't add
const failed = suggestNext({ history: [set('s1', 60, 9, 0)], scheme: 'double', today: TODAY })!
assert.equal(failed.weightKg, 60, 'RIR-0 holds weight')
assert.equal(failed.targetReps, 9, 'RIR-0 repeats last reps')

// 6. RIR ≥4 too easy → jump 2 reps
const easy = suggestNext({ history: [set('s1', 60, 8, 5)], scheme: 'double', today: TODAY })!
assert.equal(easy.weightKg, 60, 'too-easy holds weight')
assert.equal(easy.targetReps, 10, 'too-easy jumps 2 reps')

// 7. unlogged RIR still promotes (RIR stays optional)
const norir = suggestNext({ history: [set('s1', 60, 12)], scheme: 'double', today: TODAY })!
assert.equal(norir.weightKg, 62.5, 'unlogged RIR counts as passing')

// 8. bodyweight: never add kg, just a rep
const bw = suggestNext({ history: [set('s1', 0, 12, 2)], scheme: 'double', today: TODAY })!
assert.equal(bw.weightKg, 0, 'bodyweight stays 0 kg')
assert.equal(bw.targetReps, 13, 'bodyweight adds a rep')

// 9. linear ramp: e1RM 100 (75×10 = epley 100), last top 70 → 70% + 2.5% = 72.5 kg × 5
const linHist = [set('s2', 70, 5, 0), set('s1', 75, 10, 0, '2026-06-28T10:00:00Z')]
const lin = suggestNext({ history: linHist, scheme: 'linear', today: TODAY })!
assert.equal(lin.weightKg, 72.5, 'linear ramps 2.5% above last %')
assert.equal(lin.targetReps, 5, 'linear prescribes 5 reps')
assert.ok(lin.reason.includes('%'), 'linear reason shows the %')

// 10. linear clamps: never above 85% or below 70% of e1RM
const cap = suggestNext(
  { history: [set('s2', 85, 4, 0), set('s1', 75, 10, 0, '2026-06-28T10:00:00Z')], scheme: 'linear', today: TODAY },
)!
assert.equal(cap.weightKg, 85, 'linear caps at 85% of 100 kg e1RM')
const floor = suggestNext(
  { history: [set('s2', 60, 5, 0), set('s1', 75, 10, 0, '2026-06-28T10:00:00Z')], scheme: 'linear', today: TODAY },
)!
assert.equal(floor.weightKg, 70, 'linear floors at 70% of 100 kg e1RM')

// 11. break re-entry: 21 idle days → −15% (60 → 51 → rounds 50), reps back to 8
const brk = suggestNext(
  { history: [set('s1', 60, 10, 2, '2026-06-11T10:00:00Z')], scheme: 'double', today: TODAY },
)!
assert.equal(brk.weightKg, 50, '3 weeks off drops 15%')
assert.equal(brk.targetReps, 8, 'break resets reps to 8')
assert.ok(brk.reason.includes('weeks'), 'break reason mentions weeks off')

// 12. deload flag: −15% load (60 → 51 → rounds 50), reps 8, reason prefixed
const dl = suggestNext({ history: [set('s1', 60, 10, 2)], scheme: 'double', today: TODAY, deload: true })!
assert.equal(dl.weightKg, 50, 'deload drops load 15%')
assert.equal(dl.targetReps, 8, 'deload resets reps to 8')
assert.ok(dl.reason.startsWith('Deload:'), 'deload reason is prefixed')

// 13. multi-set last session: top weight 80, best reps there 7 (not the 60×10)
const multi = suggestNext(
  { history: [set('s1', 60, 10), set('s1', 80, 5), set('s1', 80, 7)], scheme: 'double', today: TODAY },
)!
assert.equal(multi.weightKg, 80, 'suggestion keys off the top weight')
assert.equal(multi.targetReps, 8, '7 reps at top weight → build back to 8')

// 14. helpers: RIR adds virtual reps; rounding is to nearest 2.5
assert.equal(epley1RM(80, 8, 2), epley1RM(80, 10, 0), 'RIR-adjusted Epley = same total reps')
assert.equal(roundToStep(51), 50, '51 rounds to 50 on 2.5 steps')

// 15. deloadDue: 5-week streak, fatigue path, and stale streaks
const W = 2950
assert.ok(
  deloadDue({ trainedWeeks: [W, W - 1, W - 2, W - 3, W - 4], currentWeek: W, recentRirs: [] }),
  '5 straight weeks → deload due',
)
assert.equal(
  deloadDue({ trainedWeeks: [W, W - 1, W - 2, W - 3], currentWeek: W, recentRirs: [] }),
  null,
  '4 weeks alone → not due',
)
assert.ok(
  deloadDue({ trainedWeeks: [W, W - 1, W - 2], currentWeek: W, recentRirs: [0, 1, 0, 1] }),
  '3 weeks + near-failure RIRs → deload due',
)
assert.equal(
  deloadDue({ trainedWeeks: [W - 3, W - 4, W - 5, W - 6, W - 7], currentWeek: W, recentRirs: [] }),
  null,
  'stale streak (broken 3 weeks ago) → not due',
)

// 16. date helpers
assert.equal(
  weekIndex('2026-07-06') - weekIndex('2026-06-29'),
  1,
  'consecutive Mondays differ by 1 across a month boundary',
)
assert.equal(daysBetween('2026-01-01', '2026-01-15'), 14, 'daysBetween counts calendar days')

console.log('suggest-test: OK — double/linear progression, break re-entry, deload, date math')
