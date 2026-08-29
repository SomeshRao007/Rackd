import { createRxDatabase, addRxPlugin, type RxStorage } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema'
import {
  exerciseSchema,
  sessionSchema,
  setLogSchema,
  planSchema,
  exclusionSchema,
  goalSchema,
  bodyMetricSchema,
  readinessSchema,
  customExerciseSchema,
  type WorkoutDatabase,
} from './schema'

addRxPlugin(RxDBMigrationSchemaPlugin)

async function makeStorage(): Promise<RxStorage<unknown, unknown>> {
  const storage = getRxStorageDexie()
  if (!import.meta.env.DEV) return storage
  // dev-mode needs a validator-wrapped storage (RxDB error DVM1); both are dev-only, stripped from prod.
  const { RxDBDevModePlugin } = await import('rxdb/plugins/dev-mode')
  const { wrappedValidateAjvStorage } = await import('rxdb/plugins/validate-ajv')
  addRxPlugin(RxDBDevModePlugin)
  return wrappedValidateAjvStorage({ storage })
}

let dbPromise: Promise<WorkoutDatabase> | null = null

export function getDb(): Promise<WorkoutDatabase> {
  // ponytail: single shared instance; RxDB throws on duplicate db names otherwise.
  if (!dbPromise) dbPromise = create()
  return dbPromise
}

async function create(): Promise<WorkoutDatabase> {
  const db = await createRxDatabase<WorkoutDatabase>({
    name: 'workoutdb',
    storage: await makeStorage(),
    multiInstance: true, // sync across browser tabs
    eventReduce: true,
  })
  await db.addCollections({
    exercises: {
      schema: exerciseSchema,
      // v0→v1 added the nullable gifId (M8.1); existing catalog rows default to null then re-seed.
      migrationStrategies: { 1: (doc) => ({ ...doc, gifId: null }) },
    },
    sessions: {
      schema: sessionSchema,
      // v0→v1 added the nullable plannedDay; v1→v2 the nullable finishedAt (M8.2).
      migrationStrategies: {
        1: (doc) => ({ ...doc, plannedDay: null }),
        2: (doc) => ({ ...doc, finishedAt: null }),
      },
    },
    setlogs: {
      schema: setLogSchema,
      // v0→v1 added nullable rir + note (M5); existing sets default to null.
      migrationStrategies: { 1: (doc) => ({ ...doc, rir: null, note: null }) },
    },
    plans: {
      schema: planSchema,
      // v0→v1 added the nullable scheme (M5); v1→v2 enrollment fields (M8.2).
      migrationStrategies: {
        1: (doc) => ({ ...doc, scheme: null }),
        2: (doc) => ({ ...doc, enrolledAt: null, schedule: null }),
      },
    },
    exclusions: { schema: exclusionSchema },
    goals: { schema: goalSchema },
    bodymetrics: { schema: bodyMetricSchema },
    readiness: { schema: readinessSchema },
    customexercises: {
      schema: customExerciseSchema,
      // v0→v1 added category (M8.4); everything authored before this was a strength lift.
      migrationStrategies: { 1: (doc) => ({ ...doc, category: '' }) },
    },
  })
  return db
}

// Bump together with the catalog JSON filename to push a new catalog to clients.
const CATALOG_VERSION = 5 // v5 (M8.7): duplicate movements + camera-angle variants collapsed (~1,937)

/** Seed/refresh the catalog. Idempotent: re-seeds only when the version changed.
 *  bulkUpsert can't delete, so a version that DROPS records (the M8.7 dedup) also has to remap
 *  anything referencing them and then prune — in that order, or the remap loses its name lookup. */
export async function seedCatalog(): Promise<void> {
  if (localStorage.getItem('wa_catalog_v') === String(CATALOG_VERSION)) return
  const db = await getDb()
  const res = await fetch('/catalog/exercises.v1.json')
  if (!res.ok) return
  const exercises: { id: string; name: string }[] = await res.json()
  await db.exercises.bulkUpsert(exercises) // upsert → re-seed is idempotent

  const aliases: Record<string, string> = await fetch('/catalog/aliases.v1.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
  const dropped = Object.keys(aliases)
  if (dropped.length > 0) {
    const { remapExerciseIds } = await import('./catalogAliases')
    await remapExerciseIds(db, aliases, new Map(exercises.map((e) => [e.id, e.name])))
    // Tombstones rather than physically deleting (RxDB's model) — every query already excludes
    // `_deleted`, so the duplicates vanish from the app; the dead rows are local-only and unsynced.
    await db.exercises.bulkRemove(dropped)
  }
  localStorage.setItem('wa_catalog_v', String(CATALOG_VERSION))
}
