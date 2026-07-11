// Timed-circuit core (M8.3) — pure; unit-tested in scripts/circuit-test.ts. A circuit day expands
// into an ordered list of work/rest phases; `tick` advances one second. Kept out of the component
// so it's testable and fast-refresh-friendly (same split as lib/schedule.ts vs the UI).

export type Phase = { type: 'work' | 'rest'; sec: number; station: string; round: number }
export type Pos = { idx: number; left: number; done: boolean }

// One work phase per station each round, a rest phase after every station except the very last of
// the last round (and none at all when restSec is 0, e.g. a mobility flow).
export function buildPhases(stations: string[], workSec: number, restSec: number, rounds: number): Phase[] {
  const phases: Phase[] = []
  for (let r = 1; r <= rounds; r++) {
    stations.forEach((station, i) => {
      phases.push({ type: 'work', sec: workSec, station, round: r })
      const last = r === rounds && i === stations.length - 1
      if (restSec > 0 && !last) phases.push({ type: 'rest', sec: restSec, station, round: r })
    })
  }
  return phases
}

// One second of progress: count down the current phase, else advance to the next (or finish).
export function tick(phases: Phase[], p: Pos): Pos {
  if (p.done) return p
  if (p.left > 1) return { ...p, left: p.left - 1 }
  const next = p.idx + 1
  if (next >= phases.length) return { idx: p.idx, left: 0, done: true }
  return { idx: next, left: phases[next].sec, done: false }
}
