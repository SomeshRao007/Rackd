import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useRxData } from '../db/useRxData'
import type { Exercise, CustomExercise } from '../db/schema'
import { customToExercise } from '../db/customExercises'

/** Searchable catalog picker (same pattern as the Log screen), reused by the plan
 *  builder (add to a slot's pool) and the start-day swap. Renders as a panel. */
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
  const [query, setQuery] = useState('')
  const exercises = useRxData<Exercise>((db) => db.exercises.find(), [])
  const custom = useRxData<CustomExercise>((db) => db.customexercises.find({ selector: { userId, deletedAt: null } }), [userId])
  const excludeKey = exclude.join('|')

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const skip = new Set(excludeKey ? excludeKey.split('|') : [])
    const all = [...custom.map(customToExercise), ...exercises]
    const pool = q ? all.filter((e) => e.name.toLowerCase().includes(q)) : all
    return [...pool]
      .filter((e) => !skip.has(e.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [exercises, custom, query, excludeKey])

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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-steel-700 bg-steel-900 px-4 py-3.5 text-base text-chalk placeholder:text-steel-600 focus-visible:border-amber focus-visible:outline-none"
        />

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
