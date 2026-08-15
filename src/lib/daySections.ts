import type { PlannedPick } from '../db/schema'

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
