import { useEffect, useRef, useState } from 'react'
import type { Exercise, MobilityStep } from '../db/schema'
import { ExerciseInfoLink } from './ExerciseInfoLink'
import { ExercisePicker } from './ExercisePicker'
import { SectionHeader } from './SectionHeader'

// Hold lengths the seconds badge cycles through (M8.4). Short list on purpose — a number input for
// a stretch hold is more friction than it's worth.
const HOLDS = [15, 30, 45, 60]

// "3 moves · 1:30" — the same shape as a muscle section's "2/3 sets", so the rail reads uniformly.
// Completed moves are called out once any are done, so progress reads at a glance from the header.
const summarize = (steps: MobilityStep[]): string => {
  const total = steps.reduce((s, m) => s + m.sec, 0)
  const mins = Math.floor(total / 60)
  const done = steps.filter((s) => s.done).length
  const base = `${steps.length} ${steps.length === 1 ? 'move' : 'moves'} · ${mins}:${String(total % 60).padStart(2, '0')}`
  return done > 0 ? `${base} · ${done} done` : base
}

/** Warm-up / cooldown with a per-step seconds countdown.
 *  Pass `onChange` to make the list editable — add, drop, re-time and tick off steps. Read-only
 *  without it. Completion persists into the plannedDay blob (M8.6), so a reload keeps your ✓ —
 *  and because the save routes through Today's `ensureSession`, ticking a step off an
 *  uncommitted proposal day commits that day rather than silently discarding the progress.
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
  const setDone = (i: number, done: boolean) =>
    onChange?.(steps.map((s, n) => (n === i ? { ...s, done } : s)))

  return (
    <div className="mt-7">
      <SectionHeader
        label={title}
        meta={steps.length > 0 ? summarize(steps) : undefined}
        action={
          onChange && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-xs font-bold uppercase tracking-wide text-fog transition-colors hover:text-amber"
            >
              + Add
            </button>
          )
        }
      />
      <ul className="space-y-1.5">
        {steps.map((s, i) => (
          <StretchRow
            key={`${s.exerciseId}-${i}`}
            exerciseId={s.exerciseId}
            name={nameOf.get(s.exerciseId) ?? s.exerciseId}
            sec={s.sec}
            done={s.done ?? false}
            onRemove={onChange && (() => removeAt(i))}
            onCycleSec={onChange && (() => cycleSec(i))}
            onDone={onChange && ((done: boolean) => setDone(i, done))}
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
  done,
  onRemove,
  onCycleSec,
  onDone,
}: {
  exerciseId: string
  name: string
  sec: number
  done: boolean
  onRemove?: () => void
  onCycleSec?: () => void
  onDone?: (done: boolean) => void
}) {
  const [left, setLeft] = useState<number | null>(null) // null = idle, counting down otherwise
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  useEffect(() => () => clearInterval(timer.current), [])

  // Completion is DERIVED from the persisted prop, never seeded into state: `useState(done)` would
  // capture the value at mount and then ignore it, which is exactly the round-trip (and the
  // cross-device sync) this feature exists to survive.
  const isDone = done || left === 0

  // Fire the persist when the countdown lands on 0. In an effect rather than inside the setLeft
  // updater — updaters must stay pure (StrictMode double-invokes them).
  // Keyed on `left` alone: onDone is a fresh closure every render, so including it would re-fire
  // the write on every parent re-render for as long as the row sits at 0.
  useEffect(() => {
    if (left === 0) onDone?.(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left])

  const start = () => {
    // Un-tick first: a move finished in THIS session has left === 0, so the idle guard below
    // would otherwise swallow the tap.
    if (isDone) {
      onDone?.(false)
      setLeft(null)
      return
    }
    if (left !== null) return // mid-countdown — ignore
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

  return (
    <li
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
        isDone ? 'border-green-500/60 bg-green-500/10' : 'border-steel-800 bg-steel-900'
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
        aria-label={isDone ? `Mark ${name} not done` : `Start ${name} timer`}
        className={`nums shrink-0 rounded-lg px-3 py-1.5 text-sm font-black tabular-nums transition-colors ${
          isDone ? 'bg-green-500 text-ink' : left !== null ? 'bg-amber text-ink' : 'bg-steel-800 text-fog hover:text-chalk'
        }`}
      >
        {isDone ? '✓' : left === null ? (onCycleSec ? '▶' : `${sec}s`) : `${left}s`}
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
