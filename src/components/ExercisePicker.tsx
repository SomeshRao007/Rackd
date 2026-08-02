import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useRxData } from '../db/useRxData'
import type { Exercise, CustomExercise } from '../db/schema'
import { customToExercise } from '../db/customExercises'
import { usePrefs } from '../lib/prefs'
import { filterExercises, equipmentOptionsOf, EMPTY_FILTER, type ExerciseFilter } from '../lib/exerciseFilter'
import { ExerciseFilters } from './ExerciseFilters'
import { ExerciseDetail } from '../routes/ExerciseDetail'

/** Searchable catalog picker, reused by the plan builder (add to a slot's pool) and Today's add.
 *  Uses the same filter stack (search + muscle group + equipment + custom) as the Exercises library.
 *  Pass `onPickMany` for checkbox multi-select with an "Add N" bar; `onPick` alone keeps the
 *  original tap-to-pick behaviour (the goals lift picker). Rows carry an ⓘ that opens the full
 *  ExerciseDetail in place — navigating there would unmount the picker and lose the ticks. */
export function ExercisePicker({
  title,
  exclude = [],
  initialFilter,
  onPick,
  onPickMany,
  onClose,
}: {
  title: string
  exclude?: string[]
  /** Open pre-filtered, e.g. `{ pattern: 'warmup' }` for a mobility-only picker. */
  initialFilter?: Partial<ExerciseFilter>
  onPick?: (e: Exercise) => void
  onPickMany?: (es: Exercise[]) => void
  onClose: () => void
}) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const prefs = usePrefs()
  const [filter, setFilterState] = useState<ExerciseFilter>({ ...EMPTY_FILTER, ...initialFilter })
  const setFilter = (patch: Partial<ExerciseFilter>) => setFilterState((f) => ({ ...f, ...patch }))
  const [picked, setPicked] = useState<Exercise[]>([])
  const [detailId, setDetailId] = useState<string | null>(null)
  const exercises = useRxData<Exercise>((db) => db.exercises.find(), [])
  const custom = useRxData<CustomExercise>((db) => db.customexercises.find({ selector: { userId, deletedAt: null } }), [userId])
  const excludeKey = exclude.join('|')

  const customIds = useMemo(() => new Set(custom.map((c) => c.id)), [custom])
  const all = useMemo(() => [...custom.map(customToExercise), ...exercises], [custom, exercises])
  const equipmentOptions = useMemo(() => equipmentOptionsOf(all, prefs.customEquipment), [all, prefs.customEquipment])

  const toggle = (e: Exercise) =>
    setPicked((cur) => (cur.some((p) => p.id === e.id) ? cur.filter((p) => p.id !== e.id) : [...cur, e]))

  const matches = useMemo(() => {
    const skip = new Set(excludeKey ? excludeKey.split('|') : [])
    return filterExercises(all, filter, customIds).filter((e) => !skip.has(e.id))
  }, [all, filter, customIds, excludeKey])

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-ink/95 backdrop-blur">
      <div className="mx-auto flex h-full w-full max-w-lg flex-col px-4 pt-5">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="flex-1 font-display text-xl font-black tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close picker"
            className="grid size-9 place-items-center rounded-lg text-fog transition-colors hover:bg-steel-800 hover:text-chalk"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          autoFocus
          aria-label="Search exercises"
          placeholder="Bench, squat, curl…"
          value={filter.query}
          onChange={(e) => setFilter({ query: e.target.value })}
          className="w-full rounded-xl border border-steel-700 bg-steel-900 px-4 py-3.5 text-base text-chalk placeholder:text-steel-600 focus-visible:border-amber focus-visible:outline-none"
        />

        {/* Same filter stack as the Exercises library. */}
        <ExerciseFilters filter={filter} setFilter={setFilter} equipmentOptions={equipmentOptions} />

        <ul className={`mt-3 flex-1 space-y-1.5 overflow-y-auto ${onPickMany ? 'pb-24' : 'pb-5'}`}>
          {matches.map((e) => {
            const checked = picked.some((p) => p.id === e.id)
            return (
              <li key={e.id} className="flex items-center gap-1 rounded-xl bg-steel-900 pr-2 transition-colors hover:bg-steel-800">
                <button
                  type="button"
                  {...(onPickMany
                    ? { role: 'checkbox' as const, 'aria-checked': checked, onClick: () => toggle(e) }
                    : { onClick: () => onPick?.(e) })}
                  className="flex flex-1 items-center gap-3 rounded-xl px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-amber"
                >
                  {onPickMany && (
                    <span
                      aria-hidden
                      className={`grid size-5 shrink-0 place-items-center rounded border-2 text-ink transition-colors ${
                        checked ? 'border-amber bg-amber' : 'border-steel-600'
                      }`}
                    >
                      {checked && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m5 13 5 5L20 7" />
                        </svg>
                      )}
                    </span>
                  )}
                  <span className="flex-1 font-semibold">{e.name}</span>
                  <span className="text-xs uppercase tracking-wide text-fog">
                    {e.primaryMuscles[0] ?? e.equipment}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailId(e.id)}
                  aria-label={`Info for ${e.name}`}
                  title="Instructions & records"
                  className="grid size-8 shrink-0 place-items-center rounded-full text-fog transition-colors hover:bg-steel-700 hover:text-amber"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 11v5" strokeLinecap="round" />
                    <circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              </li>
            )
          })}
          {matches.length === 0 && (
            <li className="py-8 text-center text-sm text-fog">No lifts match.</li>
          )}
        </ul>

        {onPickMany && (
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-lg border-t border-steel-800 bg-ink/95 px-4 py-4 backdrop-blur">
            <button
              type="button"
              disabled={picked.length === 0}
              onClick={() => {
                onPickMany(picked)
                onClose()
              }}
              className="w-full rounded-xl bg-amber py-3.5 font-display font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber-bright disabled:bg-steel-800 disabled:text-steel-600"
            >
              Add {picked.length || ''} to plan
            </button>
          </div>
        )}
      </div>

      {detailId && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-ink px-4 py-5">
          <div className="mx-auto max-w-lg">
            <ExerciseDetail id={detailId} onBack={() => setDetailId(null)} />
          </div>
        </div>
      )}
    </div>
  )
}
