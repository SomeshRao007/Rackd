import type { WorkoutDatabase } from './schema'

const now = () => new Date().toISOString()

/**
 * Point every reference at the survivor after the catalog dedup dropped a duplicate movement
 * (M8.7). Without this a plan built on `Dumbbell_Arnold_Press` would render a raw id and its
 * logged history would be orphaned from the kept `Arnold_Dumbbell_Press`.
 *
 * Runs once per catalog-version bump, just before the dropped rows are pruned. Idempotent: a doc
 * with no alias inside is never touched. Writes use `incrementalPatch`, which re-reads on a
 * revision conflict — a plain patch would throw mid-migration and leave the catalog un-pruned. `exercises` is local-only (not in sync's COLLECTIONS), but
 * everything below IS synced — so the remap propagates, and a pull from a device that hasn't
 * re-seeded can briefly resurrect an old id until that device seeds too.
 */
export async function remapExerciseIds(
  db: WorkoutDatabase,
  aliases: Record<string, string>,
  nameOf: Map<string, string>,
): Promise<void> {
  const pairs = Object.entries(aliases)

  // JSON blobs (plan days, planned days): replace the QUOTED id so the match is exact —
  // "Barbell_Full_Squat" must not corrupt "Barbell_Full_Squat_Back_Pov". One pass covers a day's
  // picks, its rotation pools and its mobility steps. ponytail: `exerciseName` inside an
  // already-committed plannedDay keeps the old label; cosmetic, gone when the day next resolves.
  const rewrite = (json: string) => {
    let out = json
    for (const [from, to] of pairs) {
      const q = `"${from}"`
      if (out.includes(q)) out = out.split(q).join(`"${to}"`)
    }
    return out
  }

  for (const doc of await db.plans.find().exec()) {
    const days = rewrite(doc.days)
    if (days !== doc.days) await doc.incrementalPatch({ days, updatedAt: now() })
  }

  for (const doc of await db.sessions.find().exec()) {
    if (!doc.plannedDay) continue
    const plannedDay = rewrite(doc.plannedDay)
    if (plannedDay !== doc.plannedDay) await doc.incrementalPatch({ plannedDay, updatedAt: now() })
  }

  // Structural fields. Set logs also carry a denormalized name that History renders.
  for (const doc of await db.setlogs.find().exec()) {
    const to = aliases[doc.exerciseId]
    if (to) await doc.incrementalPatch({ exerciseId: to, exerciseName: nameOf.get(to) ?? doc.exerciseName, updatedAt: now() })
  }

  for (const doc of await db.exclusions.find().exec()) {
    const to = doc.kind === 'exercise' ? aliases[doc.value] : undefined
    if (to) await doc.incrementalPatch({ value: to, updatedAt: now() })
  }

  for (const doc of await db.goals.find().exec()) {
    const to = doc.targetExerciseId ? aliases[doc.targetExerciseId] : undefined
    if (to) await doc.incrementalPatch({ targetExerciseId: to, updatedAt: now() })
  }
}
