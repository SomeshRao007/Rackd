import {
  toTypedRxJsonSchema,
  type ExtractDocumentTypeFromTypedRxJsonSchema,
  type RxJsonSchema,
  type RxCollection,
  type RxDatabase,
} from 'rxdb'

/**
 * Sync metadata carried by every per-user record (note 02 "lean recipe").
 * Present from M1 even though replication lands in M2 — keeps M2 purely additive.
 *   id        client-generated UUID (stable identity before first sync)
 *   userId    owner; per-user isolation boundary
 *   createdAt / updatedAt  ISO strings (lexicographic compare == LWW key)
 *   deletedAt soft-delete tombstone (null = live)
 */

// ── Exercise (catalog, read-only; seeded from free-exercise-db) ──────────────
const exerciseSchemaLiteral = {
  title: 'exercise',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    primaryMuscles: { type: 'array', items: { type: 'string' } },
    secondaryMuscles: { type: 'array', items: { type: 'string' } },
    equipment: { type: 'string' },
    mechanic: { type: 'string' },
    level: { type: 'string' },
    category: { type: 'string' },
    force: { type: 'string' },
    instructions: { type: 'array', items: { type: 'string' } },
    images: { type: 'array', items: { type: 'string' } },
    source: { type: 'string' },
    license: { type: 'string' },
  },
  required: ['id', 'name', 'primaryMuscles'],
} as const
const exerciseTyped = toTypedRxJsonSchema(exerciseSchemaLiteral)
export type Exercise = ExtractDocumentTypeFromTypedRxJsonSchema<typeof exerciseTyped>
export const exerciseSchema: RxJsonSchema<Exercise> = exerciseSchemaLiteral

// ── Session (per-user; one workout instance) ─────────────────────────────────
// plannedDay (v1): JSON string of the locked plan day this session instances —
//   { planId, dayId, label, picks: [{ slotLabel, exerciseId, exerciseName }] }.
//   Stored as a string so it rides the flat-column /sync handler unchanged.
const sessionSchemaLiteral = {
  title: 'session',
  version: 1,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    userId: { type: 'string', maxLength: 100 },
    date: { type: 'string', maxLength: 10 }, // YYYY-MM-DD
    title: { type: 'string' },
    plannedDay: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    deletedAt: { type: ['string', 'null'] },
  },
  required: ['id', 'userId', 'date', 'createdAt', 'updatedAt'],
  indexes: ['date'],
} as const
const sessionTyped = toTypedRxJsonSchema(sessionSchemaLiteral)
export type Session = ExtractDocumentTypeFromTypedRxJsonSchema<typeof sessionTyped>
export const sessionSchema: RxJsonSchema<Session> = sessionSchemaLiteral

// ── SetLog (per-user, append-only; one logged set) ───────────────────────────
// weight is stored canonically in KILOGRAMS; the UI converts for lb display.
const setLogSchemaLiteral = {
  title: 'setlog',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    userId: { type: 'string', maxLength: 100 },
    sessionId: { type: 'string', maxLength: 100 },
    exerciseId: { type: 'string', maxLength: 100 },
    exerciseName: { type: 'string' }, // denormalized for fast history render
    weightKg: { type: 'number' },
    reps: { type: 'number' },
    order: { type: 'number' },
    createdAt: { type: 'string', maxLength: 30 }, // ISO; indexed for sort
    updatedAt: { type: 'string' },
    deletedAt: { type: ['string', 'null'] },
  },
  required: [
    'id',
    'userId',
    'sessionId',
    'exerciseId',
    'weightKg',
    'reps',
    'createdAt',
    'updatedAt',
  ],
  // composite index powers lastSetFor (auto-fill): filter userId+exerciseId, sort createdAt
  indexes: ['sessionId', ['userId', 'exerciseId', 'createdAt']],
} as const
const setLogTyped = toTypedRxJsonSchema(setLogSchemaLiteral)
export type SetLog = ExtractDocumentTypeFromTypedRxJsonSchema<typeof setLogTyped>
export const setLogSchema: RxJsonSchema<SetLog> = setLogSchemaLiteral

// ── Plan (per-user; named workout plan, the first freely-editable LWW record) ─
// `days` is a JSON STRING (not a nested object) so the plan syncs through the flat
// /sync handler with zero handler changes. Parsed shape:
//   [{ id, label, slots: [{ id, label, exercisePool: [exerciseId] }] }]
// sourceShareCode records provenance when the plan was adopted from a share/starter.
const planSchemaLiteral = {
  title: 'plan',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    userId: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    days: { type: 'string' },
    sourceShareCode: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    deletedAt: { type: ['string', 'null'] },
  },
  required: ['id', 'userId', 'name', 'days', 'createdAt', 'updatedAt'],
} as const
const planTyped = toTypedRxJsonSchema(planSchemaLiteral)
export type Plan = ExtractDocumentTypeFromTypedRxJsonSchema<typeof planTyped>
export const planSchema: RxJsonSchema<Plan> = planSchemaLiteral

// Parsed `days` shapes — the in-memory contract for the builder + rotation.
export type PlanSlot = { id: string; label: string; exercisePool: string[] }
export type PlanDay = { id: string; label: string; slots: PlanSlot[] }
export type PlannedPick = {
  slotId: string
  slotLabel: string
  exerciseId: string
  exerciseName: string
  minSets?: number // per-session set target; row turns green once this many sets are logged
}
export type PlannedDay = { planId: string; dayId: string; label: string; picks: PlannedPick[] }

// ── Collection + database types (the contract subagents import) ──────────────
export type WorkoutCollections = {
  exercises: RxCollection<Exercise>
  sessions: RxCollection<Session>
  setlogs: RxCollection<SetLog>
  plans: RxCollection<Plan>
}
export type WorkoutDatabase = RxDatabase<WorkoutCollections>
