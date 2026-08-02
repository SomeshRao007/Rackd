import { useEffect, useRef, useState } from 'react'
import type { Exercise, MobilityStep } from '../db/schema'
import { ExerciseInfoLink } from './ExerciseInfoLink'
import { ExercisePicker } from './ExercisePicker'

// Hold lengths the seconds badge cycles through (M8.4). Short list on purpose — a number input for
// a stretch hold is more friction than it's worth.
const HOLDS = [15, 30, 45, 60]

/** Warm-up / cooldown with a per-step seconds countdown.
 *  Pass `onChange` to make the list editable — add, drop, and re-time steps. Read-only without it.
 *  ponytail: completion is ephemeral UI, not logged to setlogs — m4-deferred #9.
 *  ponytail: no reorder; a 3-row list doesn't justify wiring up dnd-kit. */
export function MobilityBlock({
  title,
  steps,
  nameOf,
  onChange,
  pattern = 'warmup',
}: {
  title: string
  steps: MobilityStep[]
  nameOf: Map<string, string>
  onChange?: (steps: MobilityStep[]) => void
  pattern?: 'warmup' | 'cooldown'
}) {
  const [adding, setAdding] = useState(false)
  if (steps.length === 0 && !onChange) return null

  const add = (es: Exercise[]) => {
    onChange?.([...steps, ...es.map((e) => ({ exerciseId: e.id, sec: 30 }))])
    setAdding(false)
  }
  const removeAt = (i: number) => onChange?.(steps.filter((_, n) => n !== i))
  const cycleSec = (i: number) =>
    onChange?.(
      steps.map((s, n) =>
        n === i ? { ...s, sec: HOLDS[(HOLDS.indexOf(s.sec) + 1) % HOLDS.length] ?? 30 } : s,
      ),
    )

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-fog">{title}</h2>
        {onChange && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-sm font-semibold text-fog transition-colors hover:text-amber"
          >
            + Add
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {steps.map((s, i) => (
          <StretchRow
            key={`${s.exerciseId}-${i}`}
            exerciseId={s.exerciseId}
            name={nameOf.get(s.exerciseId) ?? s.exerciseId}
            sec={s.sec}
            onRemove={onChange && (() => removeAt(i))}
            onCycleSec={onChange && (() => cycleSec(i))}
          />
        ))}
        {steps.length === 0 && onChange && (
          <li className="rounded-xl border border-dashed border-steel-700 px-4 py-4 text-center text-xs text-fog">
            Nothing here yet — add a move.
          </li>
        )}
      </ul>

      {adding && (
        <ExercisePicker
          title={`Add to ${title.toLowerCase()}`}
          exclude={steps.map((s) => s.exerciseId)}
          initialFilter={{ pattern }}
          onPickMany={add}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

function StretchRow({
  exerciseId,
  name,
  sec,
  onRemove,
  onCycleSec,
}: {
  exerciseId: string
  name: string
  sec: number
  onRemove?: () => void
  onCycleSec?: () => void
}) {
  const [left, setLeft] = useState<number | null>(null) // null = idle, 0 = done
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  useEffect(() => () => clearInterval(timer.current), [])

  const start = () => {
    if (left !== null) return
    setLeft(sec)
    timer.current = setInterval(() => {
      setLeft((l) => {
        if (l === null || l <= 1) {
          clearInterval(timer.current)
          return 0
        }
        return l - 1
      })
    }, 1000)
  }
  const done = left === 0

  return (
    <li
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
        done ? 'border-green-500/60 bg-green-500/10' : 'border-steel-800 bg-steel-900'
      }`}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-semibold capitalize">{name}</span>
      <ExerciseInfoLink exerciseId={exerciseId} label={name} />
      {/* Tap the hold length to re-time it; the countdown lives on the button beside it. */}
      {onCycleSec && (
        <button
          type="button"
          onClick={onCycleSec}
          aria-label={`Hold length for ${name}, currently ${sec} seconds`}
          className="nums shrink-0 rounded-lg bg-steel-800 px-2 py-1 text-xs font-bold text-fog transition-colors hover:text-amber"
        >
          {sec}s
        </button>
      )}
      <button
        type="button"
        onClick={start}
        aria-label={`Start ${name} timer`}
        className={`nums shrink-0 rounded-lg px-3 py-1.5 text-sm font-black tabular-nums transition-colors ${
          done ? 'bg-green-500 text-ink' : left !== null ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
        }`}
      >
        {left === null ? (onCycleSec ? '▶' : `${sec}s`) : done ? '✓' : `${left}s`}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="grid size-7 shrink-0 place-items-center rounded-full text-steel-600 transition-colors hover:bg-steel-800 hover:text-red-400"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </li>
  )
}
