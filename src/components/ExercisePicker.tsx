import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useRxData } from '../db/useRxData'
import type { Exercise, CustomExercise } from '../db/schema'
import { customToExercise } from '../db/customExercises'
import { usePrefs } from '../lib/prefs'
import { filterExercises, equipmentOptionsOf, EMPTY_FILTER, type ExerciseFilter } from '../lib/exerciseFilter'
import { ExerciseFilters } from './ExerciseFilters'

/** Searchable catalog picker, reused by the plan builder (add to a slot's pool) and Today's add.
 *  Uses the same filter stack (search + muscle group + equipment + custom) as the Exercises library. */
export function ExercisePicker({
  title,
  exclude = [],
  onPick,
  onClose,
}: {
  title: string
  exclude?: string[]
  onPick: (e: Exercise) => void
  onClose: () => void
}) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const prefs = usePrefs()
  const [filter, setFilterState] = useState<ExerciseFilter>(EMPTY_FILTER)
  const setFilter = (patch: Partial<ExerciseFilter>) => setFilterState((f) => ({ ...f, ...patch }))
  const exercises = useRxData<Exercise>((db) => db.exercises.find(), [])
  const custom = useRxData<CustomExercise>((db) => db.customexercises.find({ selector: { userId, deletedAt: null } }), [userId])
  const excludeKey = exclude.join('|')

  const customIds = useMemo(() => new Set(custom.map((c) => c.id)), [custom])
  const all = useMemo(() => [...custom.map(customToExercise), ...exercises], [custom, exercises])
  const equipmentOptions = useMemo(() => equipmentOptionsOf(all, prefs.customEquipment), [all, prefs.customEquipment])

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

        <ul className="mt-3 flex-1 space-y-1.5 overflow-y-auto pb-5">
          {matches.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onPick(e)}
                className="flex w-full items-center gap-3 rounded-xl bg-steel-900 px-4 py-3 text-left transition-colors hover:bg-steel-800 focus-visible:outline-2 focus-visible:outline-amber"
              >
                <span className="flex-1 font-semibold">{e.name}</span>
                <span className="text-xs uppercase tracking-wide text-fog">
                  {e.primaryMuscles[0] ?? e.equipment}
                </span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="py-8 text-center text-sm text-fog">No lifts match.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
