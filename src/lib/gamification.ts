// Goal-tied gamification (M7 C7). Pure and DERIVED — badges are computed from primitives the DB
// layer already knows (session count, streak, PRs, goal outcomes), so nothing new is stored. A
// couple of badges are tied to the ACTIVE goal so points pull toward the goal, not just app-opens.

export type Badge = { id: string; label: string; earned: boolean; hint: string }

export type BadgeInput = {
  sessionCount: number
  streakWeeks: number // current weekly streak (consistency.trainingStreak.current)
  prCount: number
  goalCompletedCount: number // goals closed as hit (R7 outcome)
  activeGoalPct: number | null // progress % of the active goal, or null if none
}

/** The full badge set with earned flags — the UI shows earned + locked (hint = how to earn). */
export function badges(i: BadgeInput): Badge[] {
  return [
    { id: 'first-session', label: 'First rep', earned: i.sessionCount >= 1, hint: 'Log your first session.' },
    { id: 'ten-sessions', label: 'Ten in the bank', earned: i.sessionCount >= 10, hint: 'Log 10 sessions.' },
    { id: 'streak-4', label: '4-week streak', earned: i.streakWeeks >= 4, hint: 'Train 4 weeks in a row.' },
    { id: 'first-pr', label: 'Record breaker', earned: i.prCount >= 1, hint: 'Set a personal record.' },
    // goal-tied — only meaningful with an active/closed goal.
    { id: 'goal-halfway', label: 'Halfway there', earned: (i.activeGoalPct ?? 0) >= 50, hint: 'Reach 50% of your active goal.' },
    { id: 'goal-crusher', label: 'Goal crusher', earned: i.goalCompletedCount >= 1, hint: 'Complete a goal.' },
  ]
}

/** Count earned — the headline number for the Recovery view. */
export const earnedCount = (list: Badge[]): number => list.filter((b) => b.earned).length
