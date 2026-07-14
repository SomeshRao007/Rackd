import type { Exercise, PlanDay } from '../db/schema'
import { groupOf } from './muscles'
import { equipmentAvailable } from './prefs'

// Deterministic equipment substitution (barbell→dumbbell etc.) + swap suggestions.
// ponytail: name-token heuristic — 225/307 barbell lifts match on the real catalog; the misses
// are genuine gaps (no dumbbell hip thrust exists). M9 BYO-AI is the upgrade path.

const EQUIP_TOKENS = new Set([
  'barbell', 'dumbbell', 'dumbbells', 'db', 'bb', 'cable', 'machine', 'lever',
  'smith', 'kettlebell', 'kettlebells', 'band', 'bands', 'ez',
])

/** name → movement tokens: lowercase, punctuation stripped, equipment words dropped. */
const tokens = (name: string): Set<string> =>
  new Set(
    name.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/)
      .filter((t) => t && !EQUIP_TOKENS.has(t)),
  )

/** Dice coefficient over token sets — 0 (disjoint) … 1 (identical). */
const dice = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return (2 * shared) / (a.size + b.size)
}

/**
 * Best equivalent of `ex` among `candidates` (caller pre-filters by equipment/availability):
 * same movement words targeting the same muscle. Deterministic; null when nothing scores ≥ 0.6.
 */
export function findEquivalent(
  ex: Exercise,
  candidates: Exercise[],
): { match: Exercise; score: number } | null {
  const src = tokens(ex.name)
  const primary = ex.primaryMuscles[0]
  const srcGroup = groupOf(primary ?? '')
  let best: { match: Exercise; score: number } | null = null
  for (const c of candidates) {
    if (c.id === ex.id) continue
    const nameScore = dice(src, tokens(c.name))
    if (nameScore === 0) continue // must share a movement word
    const samePrimary = primary !== undefined && c.primaryMuscles[0] === primary
    const sameGroup = srcGroup !== undefined && groupOf(c.primaryMuscles[0] ?? '') === srcGroup
    // Muscle gate; a near-identical name overrides it (the two source datasets tag the same
    // lift with different muscles — e.g. deadlift: lower back vs glutes).
    if (!samePrimary && !sameGroup && nameScore < 0.8) continue
    const score =
      nameScore +
      (samePrimary ? 0.15 : 0) +
      (ex.mechanic && c.mechanic === ex.mechanic ? 0.1 : 0) +
      (ex.force && c.force === ex.force ? 0.05 : 0)
    if (score < 0.6) continue
    if (!best || score > best.score || (score === best.score && c.name.localeCompare(best.match.name) < 0))
      best = { match: c, score }
  }
  return best
}

export type SubstitutionSummary = { replaced: number; kept: number } // distinct exercise ids

/**
 * Replace every `from`-equipment exercise in the pools with its best `to` equivalent.
 * Unknown ids (custom/stale) and no-equivalent lifts stay put; pools dedupe, never empty.
 */
export function substituteInDays(
  days: PlanDay[],
  exMap: Map<string, Exercise>,
  catalog: Exercise[],
  from: string,
  to: string,
): { days: PlanDay[]; summary: SubstitutionSummary } {
  const candidates = catalog.filter((c) => c.equipment === to)
  const mapped = new Map<string, string | null>() // from-id → to-id, so the same lift maps identically everywhere
  const replaced = new Set<string>()
  const kept = new Set<string>()
  const next = days.map((d) => ({
    ...d,
    slots: d.slots.map((s) => {
      const pool = s.exercisePool.map((id) => {
        const ex = exMap.get(id)
        if (!ex || ex.equipment !== from) return id
        if (!mapped.has(id)) mapped.set(id, findEquivalent(ex, candidates)?.match.id ?? null)
        const toId = mapped.get(id)
        if (!toId) {
          kept.add(id)
          return id
        }
        replaced.add(id)
        return toId
      })
      // Dedupe: a barbell entry collapses into an already-present dumbbell version.
      return { ...s, exercisePool: [...new Set(pool)] }
    }),
  }))
  return { days: next, summary: { replaced: replaced.size, kept: kept.size } }
}

/** Distinct pool exercises with this catalog equipment — drives the "Use dumbbells" UI. */
export const countByEquipment = (days: PlanDay[], exMap: Map<string, Exercise>, equipment: string): number =>
  new Set(
    days.flatMap((d) => d.slots.flatMap((s) => s.exercisePool)).filter((id) => exMap.get(id)?.equipment === equipment),
  ).size

/**
 * Same-muscle-group catalog alternatives doable with the available equipment, for the swap panel.
 * Ranked by best name-similarity to the pool so the list is stable across swaps.
 * ponytail: single-pass filter+sort; fancier ranking when someone complains.
 */
export function suggestAlternatives(
  poolExs: Exercise[],
  catalog: Exercise[],
  available: string[],
  excludeIds: Set<string>,
  limit = 5,
): Exercise[] {
  const groups = new Set(poolExs.map((e) => groupOf(e.primaryMuscles[0] ?? '')).filter((g) => g !== undefined))
  if (groups.size === 0) return []
  const poolTokens = poolExs.map((e) => tokens(e.name))
  return catalog
    .filter((c) => {
      if (excludeIds.has(c.id) || c.category === 'stretching') return false
      if (!equipmentAvailable(c.equipment ?? '', available)) return false
      const g = groupOf(c.primaryMuscles[0] ?? '')
      return g !== undefined && groups.has(g)
    })
    .map((c) => ({ c, s: Math.max(...poolTokens.map((t) => dice(t, tokens(c.name)))) }))
    .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((x) => x.c)
}
