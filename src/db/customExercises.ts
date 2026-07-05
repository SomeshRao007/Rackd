// Custom-exercise CRUD (M8 R1). Stores array fields as JSON strings so the row flows through the
// flat-column /sync handler; customToExercise() parses them back into the catalog Exercise shape so
// the detail card, body-map, and pickers treat custom and catalog lifts identically. Mirrors metrics.ts.
import { getDb } from './database'
import type { CustomExercise, Exercise } from './schema'

const now = () => new Date().toISOString()

export type CustomExerciseInput = {
  name: string
  primaryMuscles: string[]
  secondaryMuscles?: string[]
  equipment?: string
  instructions?: string[]
}

/** Insert a user-created exercise; returns its new id (client UUID). */
export async function createCustomExercise(userId: string, input: CustomExerciseInput): Promise<string> {
  const db = await getDb()
  const id = crypto.randomUUID()
  const ts = now()
  await db.customexercises.insert({
    id,
    userId,
    name: input.name.trim(),
    primaryMuscles: JSON.stringify(input.primaryMuscles),
    secondaryMuscles: JSON.stringify(input.secondaryMuscles ?? []),
    equipment: input.equipment ?? '',
    instructions: JSON.stringify(input.instructions ?? []),
    source: 'custom',
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  })
  return id
}

/** Soft-delete (tombstone, so the delete syncs). */
export async function deleteCustomExercise(id: string): Promise<void> {
  const db = await getDb()
  const doc = await db.customexercises.findOne(id).exec()
  if (doc) await doc.patch({ deletedAt: now(), updatedAt: now() })
}

const parseArr = (s: string | undefined): string[] => {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? (v as string[]) : []
  } catch {
    return []
  }
}

/** Normalize a stored custom row into the catalog Exercise shape (parse the JSON array fields). */
export function customToExercise(c: CustomExercise): Exercise {
  return {
    id: c.id,
    name: c.name,
    primaryMuscles: parseArr(c.primaryMuscles),
    secondaryMuscles: parseArr(c.secondaryMuscles),
    equipment: c.equipment ?? '',
    instructions: parseArr(c.instructions),
    images: [],
    source: c.source ?? 'custom',
  }
}
