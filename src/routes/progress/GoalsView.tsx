import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { useRxData } from '../../db/useRxData'
import type { Goal } from '../../db/schema'
import { useUnit, formatWeight, unitToKg, kgToUnit } from '../../lib/units'
import { GROUP_IDS, GROUP_LABELS, type MuscleGroupId } from '../../lib/muscles'
import { GOAL_TYPES, goalProgress, priorClosedGoal, goalTypeLabel, type GoalType } from '../../lib/goals'
import {
  createGoal, closeGoal, goalCurrentValue, goalSuggestionsFor, type ResolvedSuggestion,
} from '../../db/goals'
import { latestMetric } from '../../db/metrics'
import { ExercisePicker } from '../../components/ExercisePicker'

export function GoalsView() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const goals = useRxData<Goal>(
    (db) => db.goals.find({ selector: { userId, deletedAt: null }, sort: [{ updatedAt: 'desc' }] }),
    [userId],
  )
  const active = goals.find((g) => g.status === 'active') ?? null
  const closed = goals.filter((g) => g.status !== 'active')

  if (active) return <ActiveGoal goal={active} />
  return <CreateGoal userId={userId} prior={priorClosedGoal(goals)} closed={closed} />
}

// ── Active goal: progress + R6 advisory suggestions ──────────────────────────
function ActiveGoal({ goal }: { goal: Goal }) {
  const unit = useUnit()
  const [current, setCurrent] = useState(0)
  const [suggestions, setSuggestions] = useState<ResolvedSuggestion[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    goalCurrentValue(goal).then((v) => live && setCurrent(v))
    goalSuggestionsFor(goal.userId).then((s) => live && setSuggestions(s))
    return () => { live = false }
  }, [goal.id, goal.userId, goal.updatedAt])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(t)
  }, [notice])

  // ponytail: ADD shows a toast for now; wiring it to a plan is deferred (m6-deferred.md #6).
  function handleAdd(s: ResolvedSuggestion) {
    setNotice(`“${s.suggestedExerciseName ?? 'Exercise'}” — add-to-plan is coming soon. Add it from the Plans tab for now.`)
  }

  const pct = goalProgress(goal, current)
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-steel-800 bg-steel-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-amber">{goalTypeLabel(goal.type)}</div>
            <h2 className="font-display text-2xl font-black text-chalk">{goal.title}</h2>
          </div>
          <div className="nums text-right text-sm text-fog">
            {metricValue(goal, current, unit)} <span className="text-steel-600">/</span> {metricValue(goal, goal.targetValue, unit)}
          </div>
        </div>

        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-steel-800">
          <div className="h-full rounded-full bg-amber" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-fog">
          <span className="nums font-bold text-amber">{pct}%</span>
          {goal.deadline && <span>by {goal.deadline}</span>}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => closeGoal(goal.id, 'completed')}
            className="flex-1 rounded-xl bg-amber py-2.5 text-sm font-bold text-ink transition-colors hover:bg-amber-bright"
          >
            Complete
          </button>
          <button
            type="button"
            onClick={() => closeGoal(goal.id, 'abandoned')}
            className="flex-1 rounded-xl bg-steel-800 py-2.5 text-sm font-bold text-fog transition-colors hover:text-chalk"
          >
            Abandon
          </button>
        </div>
      </section>

      {suggestions.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-black text-chalk">Toward your goal</h2>
          <ul className="mt-2 space-y-2">
            {suggestions.map((s) => (
              <li key={s.group} className="rounded-xl bg-steel-900 px-4 py-3">
                <div className="flex items-center gap-2">
                  <ActionChip action={s.action} onClick={s.action === 'add' ? () => handleAdd(s) : undefined} />
                  <span className="text-sm text-chalk">{s.reason}</span>
                </div>
                {s.suggestedExerciseName && (
                  <div className="mt-1 text-xs text-fog">
                    Try: <span className="font-semibold text-amber">{s.suggestedExerciseName}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {notice && (
        <div className="fixed inset-x-0 bottom-20 z-20 mx-auto max-w-lg px-4" role="status">
          <div className="rounded-xl border border-amber/40 bg-steel-800 px-4 py-3 text-sm text-chalk shadow-lg">
            {notice}
          </div>
        </div>
      )}
    </div>
  )
}

function ActionChip({ action, onClick }: { action: ResolvedSuggestion['action']; onClick?: () => void }) {
  const style =
    action === 'add' ? 'bg-amber text-ink' : action === 'reduce' ? 'bg-amber-dim text-ink' : 'bg-steel-800 text-fog'
  const cls = `rounded-md px-2 py-0.5 text-xs font-bold uppercase ${style}`
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition hover:brightness-110 active:scale-95`}>
      {action}
    </button>
  ) : (
    <span className={cls}>{action}</span>
  )
}

// ── Create goal (+ R7 memory prompt) ─────────────────────────────────────────
function CreateGoal({ userId, prior, closed }: { userId: string; prior: Goal | null; closed: Goal[] }) {
  const unit = useUnit()
  const [type, setType] = useState<GoalType>('hypertrophy')
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [emphasis, setEmphasis] = useState<MuscleGroupId[]>([])
  const [lift, setLift] = useState<{ id: string; name: string } | null>(null)
  const [deadline, setDeadline] = useState('')
  const [picking, setPicking] = useState(false)
  const [dismissedR7, setDismissedR7] = useState(false)
  const [saving, setSaving] = useState(false)

  const metric = useMemo(() => GOAL_TYPES.find((t) => t.type === type)!.metric, [type])
  const targetLabel =
    metric === 'volume' ? 'target weekly sets' : metric === 'e1rm' ? `target e1RM (${unit})` : `target weight (${unit})`

  function factorIn() {
    setType(prior!.type as GoalType)
    setTitle(prior!.title ?? '')
    setEmphasis(prior!.emphasis ? (JSON.parse(prior!.emphasis) as MuscleGroupId[]) : [])
    const t = prior!.targetMetric === 'volume' ? prior!.targetValue : kgToUnit(prior!.targetValue, unit)
    setTarget(String(Math.round(t * 10) / 10))
    setDismissedR7(true)
  }

  async function submit() {
    if (!target.trim()) return
    setSaving(true)
    const targetValue = metric === 'volume' ? Number(target) : unitToKg(Number(target), unit)
    const baselineValue = type === 'fatloss' ? (await latestMetric(userId))?.weightKg ?? null : null
    await createGoal({
      userId,
      type,
      title: title.trim() || goalTypeLabel(type),
      emphasis: type === 'hypertrophy' ? emphasis : null,
      targetMetric: metric,
      targetExerciseId: type === 'strength' ? lift?.id ?? null : null,
      targetValue,
      baselineValue,
      deadline: deadline || null,
    })
    setSaving(false)
  }

  const canSave = target.trim() && (type !== 'strength' || lift)

  return (
    <div className="space-y-5">
      {prior?.outcome && !dismissedR7 && (
        <div className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-3">
          <p className="text-sm text-chalk">
            <span className="font-bold text-amber">Last goal:</span> {prior.title} — you hit{' '}
            <span className="nums">{JSON.parse(prior.outcome).pct}%</span> ({prior.status}).
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={factorIn} className="rounded-lg bg-amber px-3 py-1.5 text-xs font-bold text-ink hover:bg-amber-bright">
              Factor it in
            </button>
            <button type="button" onClick={() => setDismissedR7(true)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-fog hover:text-chalk">
              Start fresh
            </button>
          </div>
        </div>
      )}

      <section>
        <h2 className="font-display text-lg font-black text-chalk">New goal</h2>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {GOAL_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => setType(t.type)}
              aria-pressed={type === t.type}
              className={`rounded-xl px-2 py-3 text-xs font-bold transition-colors ${
                type === t.type ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-fog">{GOAL_TYPES.find((t) => t.type === type)!.blurb}</p>

        <div className="mt-4 space-y-3">
          <input
            type="text"
            placeholder="Goal name (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl bg-steel-800 px-3 py-2.5 text-sm text-chalk outline-none placeholder:text-steel-600"
          />

          {type === 'hypertrophy' && (
            <div>
              <div className="mb-1.5 text-xs uppercase tracking-wide text-fog">Focus muscle groups</div>
              <div className="flex flex-wrap gap-2">
                {GROUP_IDS.map((g) => {
                  const on = emphasis.includes(g)
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setEmphasis((e) => (on ? e.filter((x) => x !== g) : [...e, g]))}
                      className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                        on ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
                      }`}
                    >
                      {GROUP_LABELS[g]}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {type === 'strength' && (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex w-full items-center justify-between rounded-xl bg-steel-800 px-3 py-3 text-left text-sm hover:bg-steel-700"
            >
              <span className={lift ? 'font-semibold text-chalk' : 'text-fog'}>{lift?.name ?? 'Pick the lift…'}</span>
              <span className="text-fog">›</span>
            </button>
          )}

          <label className="block rounded-xl bg-steel-800 px-3 py-3">
            <span className="block text-center text-xs font-semibold uppercase tracking-wide text-fog">{targetLabel}</span>
            <input
              type="number" inputMode="decimal" step="0.5" min="0" placeholder="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="nums mt-1 w-full bg-transparent text-center text-4xl font-black text-chalk outline-none placeholder:text-steel-700"
            />
          </label>

          <label className="flex items-center justify-between rounded-xl bg-steel-800 px-3 py-2 text-sm text-chalk">
            <span className="text-fog">Deadline (optional)</span>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="nums bg-transparent text-right text-chalk outline-none" />
          </label>

          <button
            type="button"
            onClick={submit}
            disabled={saving || !canSave}
            className="w-full rounded-xl bg-amber py-4 font-display text-lg font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright disabled:bg-steel-700 disabled:text-fog"
          >
            Set goal
          </button>
        </div>
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-black text-chalk">Past goals</h2>
          <ul className="mt-2 space-y-1.5">
            {closed.map((g) => (
              <li key={g.id} className="flex items-center justify-between rounded-xl bg-steel-900 px-4 py-2.5 text-sm">
                <span className="text-chalk">{g.title}</span>
                <span className="text-fog">
                  {g.outcome ? <span className="nums text-amber">{JSON.parse(g.outcome).pct}%</span> : '—'} · {g.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {picking && (
        <ExercisePicker
          title="Pick the lift"
          onPick={(e) => { setLift({ id: e.id, name: e.name }); setPicking(false) }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}

function metricValue(goal: Goal, value: number, unit: 'kg' | 'lb'): string {
  return goal.targetMetric === 'volume' ? `${value} sets` : formatWeight(value, unit)
}
