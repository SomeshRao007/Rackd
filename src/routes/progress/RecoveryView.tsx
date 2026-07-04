import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { useRxData } from '../../db/useRxData'
import type { Readiness, Session, SetLog } from '../../db/schema'
import { readinessScore, readinessLabel } from '../../lib/readiness'
import { trainingStreak, daysSinceLastSession, detrainingRisk } from '../../lib/consistency'
import { detectPRs, type PRSet } from '../../lib/pr'
import { badges, earnedCount } from '../../lib/gamification'
import { goalProgress } from '../../lib/goals'
import { activeGoal, goalHistory, goalCurrentValue } from '../../db/goals'

const today = () => new Date().toISOString().slice(0, 10)

// M7 Recovery tab: readiness trend, consistency/detraining nudge, and goal-tied badges. Read-only —
// the check-in lives on Start Day. Mirrors BodyView (reactive loads + hand-rolled sparkline).
export function RecoveryView() {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const readiness = useRxData<Readiness>(
    (db) => db.readiness.find({ selector: { userId, deletedAt: null }, sort: [{ date: 'asc' }] }),
    [userId],
  )
  const sessions = useRxData<Session>(
    (db) => db.sessions.find({ selector: { userId, deletedAt: null } }),
    [userId],
  )
  const setlogs = useRxData<SetLog>(
    (db) => db.setlogs.find({ selector: { userId, deletedAt: null } }),
    [userId],
  )

  // Goal stats need composed DB reads, so pull them imperatively (mirrors StartDay's deload effect).
  const [goalStats, setGoalStats] = useState<{ completedCount: number; activePct: number | null }>({
    completedCount: 0,
    activePct: null,
  })
  useEffect(() => {
    if (!userId) return
    let alive = true
    Promise.all([goalHistory(userId), activeGoal(userId)]).then(async ([history, active]) => {
      const completedCount = history.filter((g) => g.status === 'completed').length
      const activePct = active ? goalProgress(active, await goalCurrentValue(active)) : null
      if (alive) setGoalStats({ completedCount, activePct })
    })
    return () => {
      alive = false
    }
  }, [userId])

  const scores = useMemo(() => readiness.map((r) => readinessScore(r)), [readiness])
  const currentScore = scores.at(-1) ?? null

  const streak = useMemo(() => trainingStreak(sessions.map((s) => s.date), today()), [sessions])
  const daysSince = daysSinceLastSession(sessions.map((s) => s.date), today())
  const risk = daysSince != null ? detrainingRisk(daysSince) : null

  const prCount = useMemo(() => {
    const mapped: PRSet[] = setlogs.map((s) => ({
      exerciseId: s.exerciseId,
      exerciseName: s.exerciseName ?? '',
      weightKg: s.weightKg,
      reps: s.reps,
      rir: s.rir,
      createdAt: s.createdAt,
    }))
    return detectPRs(mapped).length
  }, [setlogs])

  const badgeList = useMemo(
    () =>
      badges({
        sessionCount: sessions.length,
        streakWeeks: streak.current,
        prCount,
        goalCompletedCount: goalStats.completedCount,
        activeGoalPct: goalStats.activePct,
      }),
    [sessions, streak, prCount, goalStats],
  )

  return (
    <div className="space-y-6">
      {/* Readiness trend */}
      <section className="rounded-2xl border border-steel-800 bg-steel-900 p-4">
        <div className="flex items-end justify-between">
          <div className="text-xs uppercase tracking-wide text-fog">Readiness</div>
          {currentScore != null && (
            <div className="text-sm font-bold text-amber">{readinessLabel(currentScore)}</div>
          )}
        </div>
        {currentScore != null && (
          <div className="nums font-display text-4xl font-black text-chalk">
            {currentScore}
            <span className="text-lg text-fog">/100</span>
          </div>
        )}
        {scores.length >= 2 ? (
          <Sparkline values={scores} />
        ) : (
          <p className="mt-2 text-sm text-fog">Log a check-in on Start Day to see your recovery trend.</p>
        )}
      </section>

      {/* Streak & consistency */}
      {sessions.length > 0 && (
        <section>
          <div className="grid grid-cols-2 gap-3">
            <StatTile value={streak.current} label="week streak" />
            <StatTile value={streak.best} label="best streak" />
          </div>
          {risk && (
            <div
              className={`mt-3 rounded-xl border px-4 py-3 ${
                risk.level === 'soon' ? 'border-amber/40 bg-amber/10' : 'border-amber-dim/50 bg-amber-dim/10'
              }`}
            >
              <p className="text-sm text-chalk">
                <span className="font-bold text-amber">⚠</span> {risk.message}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Badges */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-black text-chalk">Badges</h2>
          <span className="nums text-sm font-bold text-amber">
            {earnedCount(badgeList)}/{badgeList.length}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {badgeList.map((b) => (
            <div
              key={b.id}
              className={`rounded-xl border px-3 py-3 ${
                b.earned ? 'border-amber/40 bg-amber/10' : 'border-steel-800 bg-steel-900'
              }`}
            >
              <div className={`text-sm font-bold ${b.earned ? 'text-amber' : 'text-fog'}`}>
                {b.earned ? '✓ ' : ''}
                {b.label}
              </div>
              {!b.earned && <div className="mt-0.5 text-xs leading-snug text-fog">{b.hint}</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-steel-900 px-3 py-4 text-center">
      <div className="nums font-display text-3xl font-black text-amber">{value}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-fog">{label}</div>
    </div>
  )
}

// Hand-rolled trend line — no chart dep. Mirrors BodyView's Sparkline (last ~12 points scaled to the box).
function Sparkline({ values }: { values: number[] }) {
  const pts = values.slice(-12)
  if (pts.length < 2) return null
  const W = 300, H = 64, P = 6
  const min = Math.min(...pts), max = Math.max(...pts)
  const span = max - min || 1
  const x = (i: number) => P + (i / (pts.length - 1)) * (W - 2 * P)
  const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P)
  const d = pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="mt-3" preserveAspectRatio="none" role="img" aria-label="Readiness trend">
      <polyline points={d} fill="none" stroke="#ff8a3d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(pts.length - 1)} cy={y(pts.at(-1)!)} r="3" fill="#ffae5e" />
    </svg>
  )
}
