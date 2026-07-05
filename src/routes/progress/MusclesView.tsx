import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { useRxData } from '../../db/useRxData'
import type { SetLog, Exercise, CustomExercise } from '../../db/schema'
import { customToExercise } from '../../db/customExercises'
import { useUnit, formatWeight } from '../../lib/units'
import { GROUP_LABELS, type MuscleGroupId } from '../../lib/muscles'
import { perGroupVolume, WINDOWS, sinceDays, type WindowDays } from '../../lib/volume'
import { BodyMap } from '../../components/BodyMap'

const WINDOW_LABEL: Record<WindowDays, string> = { 7: '7d', 14: '14d', 30: '30d', 365: '1y' }

export function MusclesView() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const unit = useUnit()
  const [win, setWin] = useState<WindowDays>(7)
  const [open, setOpen] = useState<MuscleGroupId | null>(null)

  const setlogs = useRxData<SetLog>((db) => db.setlogs.find({ selector: { userId, deletedAt: null } }), [userId])
  const exercises = useRxData<Exercise>((db) => db.exercises.find(), [])
  const custom = useRxData<CustomExercise>((db) => db.customexercises.find({ selector: { userId, deletedAt: null } }), [userId])

  // Attribute setlogs to a primary muscle from BOTH the catalog and the user's custom exercises,
  // so logged custom lifts light the heatmap + coverage bars too (R1 first-class).
  const muscleOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of exercises) m.set(e.id, e.primaryMuscles[0])
    for (const c of custom) { const ex = customToExercise(c); if (ex.primaryMuscles[0]) m.set(ex.id, ex.primaryMuscles[0]) }
    return (id: string) => m.get(id)
  }, [exercises, custom])

  const groups = useMemo(
    () => perGroupVolume(setlogs, muscleOf, sinceDays(win, Date.now())),
    [setlogs, muscleOf, win],
  )
  const maxSets = Math.max(1, ...groups.map((g) => g.sets))
  const totalSets = groups.reduce((s, g) => s + g.sets, 0)
  const sorted = useMemo(() => [...groups].sort((a, b) => b.sets - a.sets), [groups])
  const setsById = useMemo(() => Object.fromEntries(groups.map((g) => [g.group, g.sets])), [groups])
  const heat = (g: MuscleGroupId) => (setsById[g] ?? 0) / maxSets

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Window" className="flex gap-2">
        {WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={win === w}
            onClick={() => setWin(w)}
            className={`flex-1 rounded-xl py-1.5 text-sm font-semibold transition-colors ${
              win === w ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
            }`}
          >
            {WINDOW_LABEL[w]}
          </button>
        ))}
      </div>

      {totalSets === 0 ? (
        <div className="rounded-2xl border border-dashed border-steel-700 px-6 py-12 text-center text-fog">
          No sets logged in this window yet. Train to light up your muscle map.
        </div>
      ) : (
        <>
          <BodyMap value={heat} onSelect={(g) => setOpen((o) => (o === g ? null : g))} />

          <ul className="space-y-2">
            {sorted.map((g) => {
              const worked = g.muscles.filter((m) => m.sets > 0)
              const rest = g.muscles.filter((m) => m.sets === 0)
              const isOpen = open === g.group
              return (
                <li key={g.group} className="overflow-hidden rounded-xl bg-steel-900">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : g.group)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-steel-800 focus-visible:outline-2 focus-visible:outline-amber"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between">
                        <span className="font-display font-black text-chalk">{GROUP_LABELS[g.group]}</span>
                        <span className="nums text-sm text-fog">
                          <span className="font-bold text-amber">{g.sets}</span> sets · {formatWeight(g.volumeKg, unit)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-steel-800">
                        <div className="h-full rounded-full bg-amber" style={{ width: `${(g.sets / maxSets) * 100}%` }} />
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-steel-800 px-4 py-3 text-sm">
                      <ul className="space-y-1">
                        {worked.map((m) => (
                          <li key={m.muscle} className="flex justify-between">
                            <span className="capitalize text-chalk">{m.muscle}</span>
                            <span className="nums text-fog">{m.sets} sets · {formatWeight(m.volumeKg, unit)}</span>
                          </li>
                        ))}
                        {rest.length > 0 && (
                          <li className="pt-1 text-xs text-steel-600">
                            Untrained: {rest.map((m) => m.muscle).join(', ')}
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
