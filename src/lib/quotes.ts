// Motivational quotes for the Today header (M7 R10/C7). Static list; the day's quote is picked
// DETERMINISTICALLY from the date (no Math.random — matches the codebase's determinism rule, and
// keeps it stable across re-renders on the same day).

import { daysBetween } from './dates'

export const QUOTES: string[] = [
  'The set you don’t want to do is the one that counts.',
  'Discipline is choosing what you want most over what you want now.',
  'You don’t have to be extreme, just consistent.',
  'The weight doesn’t know you’re tired. Lift it anyway.',
  'Small sessions, stacked daily, beat heroic ones you skip.',
  'Show up on the days you don’t feel like it — that’s the whole game.',
  'Progress is a rep you couldn’t do last month.',
  'Rest is part of the plan, not a break from it.',
  'Your future self is watching through memories. Give them a good one.',
  'Strong is a skill. Practice it today.',
]

/** The quote for a given day (ISO `yyyy-mm-dd`), stable for that date. */
export function quoteOfDay(iso: string): string {
  const day = daysBetween('1970-01-01', iso.slice(0, 10))
  return QUOTES[((day % QUOTES.length) + QUOTES.length) % QUOTES.length]
}
