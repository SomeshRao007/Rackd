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
    exercises: { schema: exerciseSchema },
    sessions: {
      schema: sessionSchema,
      // v0→v1 added the nullable plannedDay; existing sessions default to null.
      migrationStrategies: { 1: (doc) => ({ ...doc, plannedDay: null }) },
    },
    setlogs: {
      schema: setLogSchema,
      // v0→v1 added nullable rir + note (M5); existing sets default to null.
      migrationStrategies: { 1: (doc) => ({ ...doc, rir: null, note: null }) },
    },
    plans: {
      schema: planSchema,
      // v0→v1 added the nullable scheme (M5); null = double progression default.
      migrationStrategies: { 1: (doc) => ({ ...doc, scheme: null }) },
    },
    exclusions: { schema: exclusionSchema },
    goals: { schema: goalSchema },
    bodymetrics: { schema: bodyMetricSchema },
    readiness: { schema: readinessSchema },
  })
  return db
}

// Bump together with the catalog JSON filename to push a new catalog to clients.
const CATALOG_VERSION = 1

/** Seed/refresh the catalog. Idempotent: re-seeds only when the version changed. */
export async function seedCatalog(): Promise<void> {
  if (localStorage.getItem('wa_catalog_v') === String(CATALOG_VERSION)) return
  const db = await getDb()
  const res = await fetch('/catalog/exercises.v1.json')
  if (!res.ok) return
  const exercises = await res.json()
  await db.exercises.bulkUpsert(exercises) // upsert → re-seed is idempotent
  localStorage.setItem('wa_catalog_v', String(CATALOG_VERSION))
}
