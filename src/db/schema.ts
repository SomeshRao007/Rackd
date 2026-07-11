import {
  toTypedRxJsonSchema,
  type ExtractDocumentTypeFromTypedRxJsonSchema,
  type RxJsonSchema,
  type RxCollection,
  type RxDatabase,
} from 'rxdb'

// Every per-user record carries sync metadata: id (client UUID), userId (isolation boundary), createdAt/updatedAt (ISO; lexicographic compare = LWW key), deletedAt (soft-delete tombstone, null = live).

// ── Exercise (catalog, read-only; seeded from free-exercise-db + ExerciseDB) ──
const exerciseSchemaLiteral = {
  title: 'exercise',
  version: 1, // v0→v1: added nullable gifId (M8.1 — ExerciseDB animation reference)
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
    // ExerciseDB media id → animated GIF at static.exercisedb.dev/media/{gifId}.gif (hotlinked, online-only).
    gifId: { type: ['string', 'null'] },
    source: { type: 'string' },
    license: { type: 'string' },
  },
  required: ['id', 'name', 'primaryMuscles'],
} as const
const exerciseTyped = toTypedRxJsonSchema(exerciseSchemaLiteral)
export type Exercise = ExtractDocumentTypeFromTypedRxJsonSchema<typeof exerciseTyped>
export const exerciseSchema: RxJsonSchema<Exercise> = exerciseSchemaLiteral

// ── Session (per-user; one workout instance) ─────────────────────────────────
// plannedDay (v1): the locked plan day, stored as a JSON string so it rides the flat-column /sync handler unchanged.
// finishedAt (v2, M8.2): explicit "Finish workout" stamp — green calendar days + rotation advance count only finished sessions.
const sessionSchemaLiteral = {
  title: 'session',
  version: 2,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    userId: { type: 'string', maxLength: 100 },
    date: { type: 'string', maxLength: 10 }, // YYYY-MM-DD
    title: { type: 'string' },
    plannedDay: { type: ['string', 'null'] },
    finishedAt: { type: ['string', 'null'] },
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
// v1 (M5): nullable rir (reps-in-reserve, 0–5) + note — inputs to load auto-progression.
const setLogSchemaLiteral = {
  title: 'setlog',
  version: 1,
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
    rir: { type: ['number', 'null'], minimum: 0, maximum: 5 },
    note: { type: ['string', 'null'] },
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
// `days` is a JSON STRING (not nested) so the plan syncs through the flat /sync handler unchanged; sourceShareCode records share/starter provenance.
// Enrollment (v2, M8.2): enrolledAt non-null = THE active plan (one at a time; enrollPlan clears others);
// schedule is a JSON string { start: 'YYYY-MM-DD', weekdays: number[] } — weekdays are Date.getDay() 0–6.
const planSchemaLiteral = {
  title: 'plan',
  version: 2,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    userId: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    days: { type: 'string' },
    sourceShareCode: { type: ['string', 'null'] },
    scheme: { type: ['string', 'null'] }, // per-plan progression scheme (M5); null = double default
    enrolledAt: { type: ['string', 'null'] },
    schedule: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    deletedAt: { type: ['string', 'null'] },
  },
  required: ['id', 'userId', 'name', 'days', 'createdAt', 'updatedAt'],
} as const
const planTyped = toTypedRxJsonSchema(planSchemaLiteral)
export type Plan = ExtractDocumentTypeFromTypedRxJsonSchema<typeof planTyped>
export const planSchema: RxJsonSchema<Plan> = planSchemaLiteral

// ── Exclusion (per-user, synced; a temporary/permanent "avoid this" for injury/recovery, M4) ──
// kind 'muscle' → value is a primaryMuscles tag; kind 'exercise' → value is an exerciseId.
// until = 'YYYY-MM-DD' or null (forever); active while until == null || until >= today.
const exclusionSchemaLiteral = {
  title: 'exclusion',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    userId: { type: 'string', maxLength: 100 },
    kind: { type: 'string' },
    value: { type: 'string' },
    label: { type: 'string' },
    until: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    deletedAt: { type: ['string', 'null'] },
  },
  required: ['id', 'userId', 'kind', 'value', 'createdAt', 'updatedAt'],
} as const
const exclusionTyped = toTypedRxJsonSchema(exclusionSchemaLiteral)
export type Exclusion = ExtractDocumentTypeFromTypedRxJsonSchema<typeof exclusionTyped>
export const exclusionSchema: RxJsonSchema<Exclusion> = exclusionSchemaLiteral

// ── Goal (per-user, synced; M6 R6/R7) ────────────────────────────────────────
// Longitudinal: the active goal AND the outcome memory of past ones (R7). `type` picks the metric —
// hypertrophy→weekly sets ('volume'), strength→e1RM of targetExerciseId ('e1rm'), fatloss→bodyweight.
// emphasis = JSON array of MuscleGroupId; outcome = JSON {finalValue,hitTarget,pct} stamped at close.
const goalSchemaLiteral = {
  title: 'goal',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    userId: { type: 'string', maxLength: 100 },
    type: { type: 'string' },
    title: { type: 'string' },
    emphasis: { type: ['string', 'null'] },
    targetMetric: { type: 'string' },
    targetExerciseId: { type: ['string', 'null'] },
    targetValue: { type: 'number' },
    baselineValue: { type: ['number', 'null'] },
    deadline: { type: ['string', 'null'] },
    status: { type: 'string' },
    outcome: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    deletedAt: { type: ['string', 'null'] },
  },
  required: ['id', 'userId', 'type', 'targetMetric', 'targetValue', 'status', 'createdAt', 'updatedAt'],
} as const
const goalTyped = toTypedRxJsonSchema(goalSchemaLiteral)
export type Goal = ExtractDocumentTypeFromTypedRxJsonSchema<typeof goalTyped>
export const goalSchema: RxJsonSchema<Goal> = goalSchemaLiteral

// ── BodyMetric (per-user, synced; M6 Part G) ─────────────────────────────────
// One row per measurement date. weightKg canonical (kg); measurements = JSON map {waist,chest,…} in cm.
// Progress photos are deferred (need R2) — see .claude/notes/m6-deferred.md.
const bodyMetricSchemaLiteral = {
  title: 'bodymetric',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    userId: { type: 'string', maxLength: 100 },
    date: { type: 'string', maxLength: 10 },
    weightKg: { type: ['number', 'null'] },
    measurements: { type: ['string', 'null'] },
    note: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    deletedAt: { type: ['string', 'null'] },
  },
  required: ['id', 'userId', 'date', 'createdAt', 'updatedAt'],
  indexes: ['date'],
} as const
const bodyMetricTyped = toTypedRxJsonSchema(bodyMetricSchemaLiteral)
export type BodyMetric = ExtractDocumentTypeFromTypedRxJsonSchema<typeof bodyMetricTyped>
export const bodyMetricSchema: RxJsonSchema<BodyMetric> = bodyMetricSchemaLiteral

// ── Readiness (per-user, synced; M7 C5) ──────────────────────────────────────
// One self-reported check-in per day (userId_date). sleep/soreness/energy are 0..2 taps, higher =
// more recovered; the 0–100 score and load factor are DERIVED (src/lib/readiness.ts), never stored.
const readinessSchemaLiteral = {
  title: 'readiness',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    userId: { type: 'string', maxLength: 100 },
    date: { type: 'string', maxLength: 10 }, // YYYY-MM-DD
    sleep: { type: 'number', minimum: 0, maximum: 2 },
    soreness: { type: 'number', minimum: 0, maximum: 2 },
    energy: { type: 'number', minimum: 0, maximum: 2 },
    note: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    deletedAt: { type: ['string', 'null'] },
  },
  required: ['id', 'userId', 'date', 'sleep', 'soreness', 'energy', 'createdAt', 'updatedAt'],
  indexes: ['date'],
} as const
const readinessTyped = toTypedRxJsonSchema(readinessSchemaLiteral)
export type Readiness = ExtractDocumentTypeFromTypedRxJsonSchema<typeof readinessTyped>
export const readinessSchema: RxJsonSchema<Readiness> = readinessSchemaLiteral

// ── Custom exercise (per-user, synced; M8 R1) ────────────────────────────────
// A user-created exercise. Kept in its OWN collection (the catalog `exercises` is unsynced + has no
// userId). Array fields ride as JSON strings so they flow through the flat-column /sync handler
// unchanged (same trick as bodymetrics.measurements); customToExercise() parses them back to the
// catalog Exercise shape so the detail card + body-map treat custom and catalog lifts identically.
const customExerciseSchemaLiteral = {
  title: 'customexercise',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    userId: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    primaryMuscles: { type: 'string' }, // JSON string[]
    secondaryMuscles: { type: 'string' }, // JSON string[]
    equipment: { type: 'string' },
    instructions: { type: 'string' }, // JSON string[]
    source: { type: 'string' }, // always 'custom'
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    deletedAt: { type: ['string', 'null'] },
  },
  required: ['id', 'userId', 'name', 'primaryMuscles', 'createdAt', 'updatedAt'],
  indexes: ['userId'],
} as const
const customExerciseTyped = toTypedRxJsonSchema(customExerciseSchemaLiteral)
export type CustomExercise = ExtractDocumentTypeFromTypedRxJsonSchema<typeof customExerciseTyped>
export const customExerciseSchema: RxJsonSchema<CustomExercise> = customExerciseSchemaLiteral

// Parsed `days` shapes — the in-memory contract for the builder + rotation.
// Circuit timing (M8.3): a day with mode 'circuit' runs its slots as timed stations — `rounds`
// passes through the day, `workSec` on / `restSec` off (a slot's own workSec overrides the day's,
// e.g. a mobility hold). These are the plan's station timings, distinct from the budget-estimate
// workSec/restSec prefs in src/lib/prefs.ts. Absent/`strength` → the classic weight×reps loggers.
export type PlanSlot = { id: string; label: string; exercisePool: string[]; workSec?: number }
export type PlanDay = {
  id: string
  label: string
  slots: PlanSlot[]
  mode?: 'strength' | 'circuit'
  workSec?: number
  restSec?: number
  rounds?: number
}
export type PlannedPick = {
  slotId: string
  slotLabel: string
  exerciseId: string
  exerciseName: string
  minSets?: number // per-session set target; row turns green once this many sets are logged
  targetReps?: number // M4 time-budget rep target; load stays user-entered (auto-filled)
  pool?: string[] // slot's exercise pool snapshotted at lock time → mid-session swap (M4)
  unavailable?: boolean // equipment/exclusion filter collapsed the pool → fell back unfiltered (M4)
  added?: boolean // ad-hoc exercise added mid-session (not from the plan) — can be saved to the plan
  savedToPlan?: boolean // an added pick that's now persisted into the plan day (recurs next time)
}
// warmup/cooldown: derived mobility stretches (exerciseId + hold seconds), M4 R8.
export type MobilityStep = { exerciseId: string; sec: number }
// Per-plan progression scheme (M5); 'wave' is a future member.
export type SchemeId = 'double' | 'linear'
export type PlannedDay = {
  planId: string
  dayId: string
  label: string
  picks: PlannedPick[]
  warmup?: MobilityStep[]
  cooldown?: MobilityStep[]
  scheme?: SchemeId // progression scheme snapshotted at lock time (M5)
  deload?: boolean // locked day accepted as a deload — the stateless deload history (M5)
  mode?: 'strength' | 'circuit' // circuit → Today renders the timed CircuitTimer, not loggers (M8.3)
  workSec?: number // circuit: seconds of work per station
  restSec?: number // circuit: seconds of rest between stations
  rounds?: number // circuit: passes through the day's stations
}

// ── Collection + database types (the contract subagents import) ──────────────
export type WorkoutCollections = {
  exercises: RxCollection<Exercise>
  sessions: RxCollection<Session>
  setlogs: RxCollection<SetLog>
  plans: RxCollection<Plan>
  exclusions: RxCollection<Exclusion>
  goals: RxCollection<Goal>
  bodymetrics: RxCollection<BodyMetric>
  readiness: RxCollection<Readiness>
  customexercises: RxCollection<CustomExercise>
}
export type WorkoutDatabase = RxDatabase<WorkoutCollections>
