import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlannedPick } from '../db/schema'
import { buildPhases, tick, type Pos } from '../lib/circuit'

// Timed-circuit runner (M8.3): steps through stations × rounds with work/rest countdowns. Reuses
// the lightweight setInterval(1s) pattern from MobilityBlock — the only per-frame cost is a CSS
// transition on an SVG ring (GPU-composited); no rAF, no canvas. State is one atomic {idx,left,done}
// (lib/circuit) so a tick can advance phase without racing separate setStates.

const R = 52
const CIRC = 2 * Math.PI * R

export function CircuitTimer({
  picks,
  workSec = 30,
  restSec = 15,
  rounds = 3,
}: {
  picks: PlannedPick[]
  workSec?: number
  restSec?: number
  rounds?: number
}) {
  const stations = useMemo(() => picks.map((p) => p.exerciseName), [picks])
  const phases = useMemo(
    () => buildPhases(stations, workSec, restSec, Math.max(1, rounds)),
    [stations, workSec, restSec, rounds],
  )
  const [pos, setPos] = useState<Pos>({ idx: 0, left: phases[0]?.sec ?? 0, done: false })
  const [running, setRunning] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  // Note: state resets when a different day is locked because Today keys this component by dayId
  // (remount) — no reset effect needed.

  // Tick only while playing and not finished; reaching `done` re-runs this effect and stops the
  // interval (no separate setState-in-effect needed to halt it).
  useEffect(() => {
    if (!running || pos.done) return
    timer.current = setInterval(() => setPos((p) => tick(phases, p)), 1000)
    return () => clearInterval(timer.current)
  }, [running, pos.done, phases])

  if (phases.length === 0) return null

  const cur = phases[Math.min(pos.idx, phases.length - 1)]
  const isRest = cur.type === 'rest'
  const nextWork = phases.slice(pos.idx + 1).find((p) => p.type === 'work')
  const workDone = phases.slice(0, pos.idx).filter((p) => p.type === 'work').length
  const workTotal = stations.length * Math.max(1, rounds)
  const frac = cur.sec > 0 ? pos.left / cur.sec : 0
  const ring = isRest ? 'text-fog' : 'text-amber'

  // Skip = jump to the end of the current phase, then advance one step.
  const skip = () => setPos((p) => tick(phases, { ...p, left: 1 }))
  const reset = () => {
    setRunning(false)
    setPos({ idx: 0, left: phases[0].sec, done: false })
  }

  return (
    <div className="mt-5 rounded-2xl border border-steel-800 bg-steel-900 p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-amber">
          Round {cur.round} / {Math.max(1, rounds)}
        </p>
        <p className="nums text-xs font-semibold text-fog">
          {workSec}s work · {restSec}s rest
        </p>
      </div>

      <div className="relative mx-auto mt-4 grid size-40 place-items-center">
        <svg width="160" height="160" viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke="currentColor" strokeWidth="8" className="text-steel-800" />
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className={`${ring} transition-[stroke-dashoffset] duration-1000 ease-linear`}
            strokeDasharray={CIRC}
            strokeDashoffset={pos.done ? 0 : CIRC * (1 - frac)}
          />
        </svg>
        <div className="z-10 text-center" aria-live="assertive">
          {pos.done ? (
            <span className="font-display text-2xl font-black text-green-400">Done 💪</span>
          ) : (
            <>
              <div className="nums font-display text-5xl font-black tabular-nums text-chalk">{pos.left}</div>
              <div className={`text-xs font-bold uppercase tracking-widest ${isRest ? 'text-fog' : 'text-amber'}`}>
                {isRest ? 'Rest' : 'Work'}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="mt-4 text-center">
        <span className="block font-display text-xl font-bold capitalize text-chalk">
          {pos.done ? 'Circuit complete' : isRest ? `Next: ${cur.station}` : cur.station}
        </span>
        {!pos.done && (
          <span className="mt-0.5 block text-xs text-fog">
            Station {Math.min(workDone + 1, workTotal)} / {workTotal}
            {isRest && nextWork ? '' : nextWork ? ` · up next: ${nextWork.station}` : ' · last station'}
          </span>
        )}
      </p>

      <div className="mt-5 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          aria-label="Reset circuit"
          className="grid size-12 place-items-center rounded-full border border-steel-700 text-fog transition-colors hover:bg-steel-800 hover:text-chalk"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => !pos.done && setRunning((r) => !r)}
          disabled={pos.done}
          aria-label={running && !pos.done ? 'Pause' : 'Play'}
          className="grid size-16 place-items-center rounded-full bg-amber text-ink shadow-lg transition-colors hover:bg-amber-bright disabled:cursor-not-allowed disabled:bg-steel-700 disabled:text-fog"
        >
          {running && !pos.done ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <button
          type="button"
          onClick={skip}
          disabled={pos.done}
          aria-label="Skip to next station"
          className="grid size-12 place-items-center rounded-full border border-steel-700 text-fog transition-colors hover:bg-steel-800 hover:text-chalk disabled:opacity-40"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5v14l9-7z" /><rect x="16" y="5" width="3" height="14" rx="1" /></svg>
        </button>
      </div>
    </div>
  )
}
