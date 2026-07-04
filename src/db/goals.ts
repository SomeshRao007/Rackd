// Goal CRUD + DB composition (M6 R6/R7). The pure scoring lives in src/lib/goals.ts; this layer
// reads history/catalog, computes the current metric value, and attaches concrete exercise picks.
import { getDb } from './database'
import type { Goal, SetLog, Exercise } from './schema'
import { pickLeastRecent } from './plans'
import { lastSetFor, historyFor } from './actions'
import { latestMetric } from './metrics'
import { perGroupVolume, sinceDays } from '../lib/volume'
import { groupOf, type MuscleGroupId } from '../lib/muscles'
import { epley1RM } from '../lib/lifting'
import { goalSuggestions, goalOutcome, type GoalType, type GoalMetric, type GoalSuggestion } from '../lib/goals'

const now = () => new Date().toISOString()

export type CreateGoalInput = {
  userId: string
  type: GoalType
  title: string
  emphasis?: MuscleGroupId[] | null
  targetMetric: GoalMetric
  targetExerciseId?: string | null
  targetValue: number
  baselineValue?: number | null
  deadline?: string | null
}

export async function createGoal(input: CreateGoalInput): Promise<Goal> {
  const db = await getDb()
  const ts = now()
  const doc = await db.goals.insert({
    id: crypto.randomUUID(),
    userId: input.userId,
    type: input.type,
    title: input.title,
    emphasis: input.emphasis?.length ? JSON.stringify(input.emphasis) : null,
    targetMetric: input.targetMetric,
    targetExerciseId: input.targetExerciseId ?? null,
    targetValue: input.targetValue,
    baselineValue: input.baselineValue ?? null,
    deadline: input.deadline ?? null,
    status: 'active',
    outcome: null,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  })
  return doc.toJSON() as Goal
}

export async function activeGoal(userId: string): Promise<Goal | null> {
  const db = await getDb()
  const doc = await db.goals.findOne({ selector: { userId, status: 'active', deletedAt: null } }).exec()
  return doc ? (doc.toJSON() as Goal) : null
}

export async function goalHistory(userId: string): Promise<Goal[]> {
  const db = await getDb()
  const docs = await db.goals
    .find({ selector: { userId, deletedAt: null }, sort: [{ updatedAt: 'desc' }] })
    .exec()
  return docs.map((d) => d.toJSON() as Goal)
}

/** Close a goal, computing + stamping its outcome fresh from current data (R7 memory). */
export async function closeGoal(id: string, status: 'completed' | 'abandoned'): Promise<void> {
  const db = await getDb()
  const doc = await db.goals.findOne(id).exec()
  if (!doc) return
  const goal = doc.toJSON() as Goal
  const current = await goalCurrentValue(goal)
  await doc.patch({ status, outcome: JSON.stringify(goalOutcome(goal, current)), updatedAt: now() })
}

// ── metric value + suggestions (the R6 read side) ─────────────────────────────

async function catalogMuscleOf(): Promise<(exerciseId: string) => string | undefined> {
  const db = await getDb()
  const exs = (await db.exercises.find().exec()).map((d) => d.toJSON() as Exercise)
  const map = new Map(exs.map((e) => [e.id, e.primaryMuscles[0]]))
  return (id) => map.get(id)
}

/** Current value of a goal's metric: weekly emphasis sets / best e1RM / latest bodyweight. */
export async function goalCurrentValue(goal: Goal): Promise<number> {
  const db = await getDb()
  if (goal.targetMetric === 'bodyweight') {
    return (await latestMetric(goal.userId))?.weightKg ?? 0
  }
  if (goal.targetMetric === 'e1rm') {
    if (!goal.targetExerciseId) return 0
    const hist = await historyFor(goal.userId, goal.targetExerciseId, 15)
    return hist.reduce((max, s) => Math.max(max, epley1RM(s.weightKg, s.reps, s.rir ?? 0)), 0)
  }
  // volume → weekly sets across the emphasis groups
  const sets = (await db.setlogs.find({ selector: { userId: goal.userId, deletedAt: null } }).exec()).map(
    (d) => d.toJSON() as SetLog,
  )
  const groups = perGroupVolume(sets, await catalogMuscleOf(), sinceDays(7, Date.now()))
  const emphasis: MuscleGroupId[] = goal.emphasis ? JSON.parse(goal.emphasis) : []
  const inScope = emphasis.length ? groups.filter((g) => emphasis.includes(g.group)) : groups
  return inScope.reduce((sum, g) => sum + g.sets, 0)
}

export type ResolvedSuggestion = GoalSuggestion & { suggestedExerciseId?: string; suggestedExerciseName?: string }

/** R6 advisory: emphasis-vs-actual add/reduce/keep, with a concrete least-recently-trained pick for `add`. */
export async function goalSuggestionsFor(userId: string): Promise<ResolvedSuggestion[]> {
  const goal = await activeGoal(userId)
  if (!goal || goal.type !== 'hypertrophy') return []
  const db = await getDb()
  const exs = (await db.exercises.find().exec()).map((d) => d.toJSON() as Exercise)
  const muscleOf = (id: string) => exs.find((e) => e.id === id)?.primaryMuscles[0]
  const sets = (await db.setlogs.find({ selector: { userId, deletedAt: null } }).exec()).map(
    (d) => d.toJSON() as SetLog,
  )
  const groups = perGroupVolume(sets, muscleOf, sinceDays(7, Date.now()))
  const base = goalSuggestions(goal, groups)

  const out: ResolvedSuggestion[] = []
  for (const s of base) {
    if (s.action !== 'add') {
      out.push(s)
      continue
    }
    // pool = catalog exercises whose primary muscle is in this group (capped for speed)
    const pool = exs.filter((e) => groupOf(e.primaryMuscles[0]) === s.group).slice(0, 40).map((e) => e.id)
    if (!pool.length) {
      out.push(s)
      continue
    }
    const lastTrainedAt: Record<string, string | null> = {}
    for (const id of pool) lastTrainedAt[id] = (await lastSetFor(userId, id))?.createdAt ?? null
    const pick = pickLeastRecent(pool, lastTrainedAt)
    out.push({ ...s, suggestedExerciseId: pick, suggestedExerciseName: exs.find((e) => e.id === pick)?.name })
  }
  return out
}
