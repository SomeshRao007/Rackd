import type { PlannedPick } from '../db/schema'
import { groupOf, GROUP_LABELS } from './muscles'

// Today groups the day's picks into the sections the user actually thinks in — "Chest",
// "Side delts", "Triceps". Those strings already exist on every pick as `slotLabel` (authored in
// the plan's slots, or the primary muscle for an ad-hoc add), so this is pure presentation: no new
// taxonomy, nothing derived from the exercise. A slot that runs several movements keys off the
// same label and collapses back into one section, which is the point.
export type DaySection = { label: string; picks: PlannedPick[] }

/** Group picks by `slotLabel`, sections in first-appearance order (= the order you train them). */
export function groupPicksBySection(picks: PlannedPick[]): DaySection[] {
  const byLabel = new Map<string, DaySection>()
  for (const pick of picks) {
    const label = pick.slotLabel || 'Other'
    const section = byLabel.get(label)
    if (section) section.picks.push(pick)
    else byLabel.set(label, { label, picks: [pick] })
  }
  return [...byLabel.values()]
}

// ── Where a newly added exercise belongs (M8.6) ──────────────────────────────
// Adding a lift mid-session used to stamp it with the raw lowercase muscle ("chest"), which never
// matches the plan's authored label ("Chest") — so it opened a lone section at the foot of the day.
// Since groupPicksBySection keys purely on the label, resolving a matching label IS the whole fix.
//
// The match runs against the section's PICKS, never its label text: plan slots are named for
// movement patterns as often as muscles ("Hinge", "Vertical pull", "Correctives"), so string
// similarity would miss the row a lift actually belongs beside.

const titleCase = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)

/**
 * The section label a new exercise should join, given the day's current picks.
 * 1. a section already training that exact primary muscle → its label
 * 2. else a section training the same coarse muscle GROUP → the one with the most such picks
 * 3. else the group's display label ("Chest") — a new section, but never lowercase
 */
export function sectionLabelFor(
  picks: PlannedPick[],
  newMuscle: string,
  muscleOf: Map<string, string>,
): string {
  const fallback = () => {
    const group = groupOf(newMuscle)
    return group ? GROUP_LABELS[group] : titleCase(newMuscle) || 'Added'
  }
  if (!newMuscle) return 'Added'

  const sections = groupPicksBySection(picks)
  // Exact muscle beats group, so a new lateral raise joins "Side delts" rather than a broader
  // "Shoulders" section that happens to hold more picks.
  const exact = sections.find((sec) =>
    sec.picks.some((p) => muscleOf.get(p.exerciseId) === newMuscle),
  )
  if (exact) return exact.label

  const group = groupOf(newMuscle)
  if (!group) return fallback()
  // Strict `>` keeps first-appearance order on a tie — same convention as pickLeastRecent.
  let best: { label: string; score: number } | null = null
  for (const sec of sections) {
    const score = sec.picks.filter((p) => groupOf(muscleOf.get(p.exerciseId) ?? '') === group).length
    if (score > 0 && (!best || score > best.score)) best = { label: sec.label, score }
  }
  return best?.label ?? fallback()
}

/** Where to splice a new pick so it lands with its section: just after that section's LAST pick
 *  (sections can be non-contiguous in the array), or at the end when the section is new. */
export function insertIndexForSection(picks: PlannedPick[], label: string): number {
  let index = -1
  for (let i = 0; i < picks.length; i++) if ((picks[i].slotLabel || 'Other') === label) index = i
  return index === -1 ? picks.length : index + 1
}

/** A section's progress: sets logged across its picks vs the sum of their targets (0 = untargeted). */
export function sectionProgress(
  section: DaySection,
  setCountOf: Map<string, number>,
): { logged: number; target: number; done: boolean } {
  let logged = 0
  let target = 0
  for (const pick of section.picks) {
    logged += setCountOf.get(pick.exerciseId) ?? 0
    target += pick.minSets ?? 0
  }
  return { logged, target, done: target > 0 && logged >= target }
}
