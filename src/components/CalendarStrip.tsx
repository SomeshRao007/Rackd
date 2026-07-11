import { useEffect, useRef, useState } from 'react'

// Month calendar for Today (M8.2): month header + scrollable day strip, expandable to a full
// month grid. Pure display — dates in, colors out: today = amber, finished workout = green,
// upcoming scheduled training day = amber dot.

const pad = (n: number) => String(n).padStart(2, '0')
const isoDate = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`
const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`)
const monthLabel = (y: number, m0: number) =>
  new Date(Date.UTC(y, m0, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })

type Marks = {
  today: string
  doneDates: Set<string>
  scheduledDates?: Set<string>
  // date → enrolled plan-day label ("Upper", "Metabolic Burst"); shown in the full-month grid (M8.3).
  scheduledLabels?: Map<string, string>
}

// Every case carries exactly one 1px border so all cells share the same box height; today-ness is an
// amber border, done-ness a green fill (their combination = amber border + green fill). No outset ring.
const cellClasses = (date: string, { today, doneDates }: Marks): string => {
  const done = doneDates.has(date)
  const isToday = date === today
  if (done && isToday) return 'border border-amber bg-green-500/20 text-green-300'
  if (done) return 'border border-green-500/60 bg-green-500/20 text-green-300'
  if (isToday) return 'border border-amber bg-amber text-ink'
  return 'border border-steel-800 bg-steel-900 text-fog'
}

const showDot = (date: string, { today, doneDates, scheduledDates }: Marks): boolean =>
  (scheduledDates?.has(date) ?? false) && !doneDates.has(date) && date !== today

export function CalendarStrip(props: Marks) {
  const { today } = props
  const [expanded, setExpanded] = useState(false)
  const todayRef = useRef<HTMLLIElement>(null)
  const [y, m0, d] = today.split('-').map(Number)

  useEffect(() => {
    todayRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [])

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-bold">{monthLabel(y, m0 - 1)}</h2>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Open full calendar"
          className="grid size-7 place-items-center rounded-lg text-fog transition-colors hover:bg-steel-800 hover:text-chalk"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>
      </div>

      <ul className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
        {Array.from({ length: daysInMonth(y, m0 - 1) }, (_, i) => {
          const date = isoDate(y, m0 - 1, i + 1)
          return (
            <li key={date} ref={i + 1 === d ? todayRef : undefined} className="shrink-0">
              <div className={`flex w-10 flex-col items-center rounded-xl py-1.5 ${cellClasses(date, props)}`}>
                <span className="text-[0.6rem] font-semibold uppercase">
                  {utc(date).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}
                </span>
                <span className="nums text-sm font-bold">{i + 1}</span>
                <span className={`size-1 rounded-full ${showDot(date, props) ? 'bg-amber' : 'bg-transparent'}`} />
              </div>
            </li>
          )
        })}
      </ul>

      {expanded && <MonthModal {...props} onClose={() => setExpanded(false)} />}
    </div>
  )
}

// Full month grid, Monday-anchored, with ‹ › month navigation. View-only.
function MonthModal(props: Marks & { onClose: () => void }) {
  const [ty, tm0] = props.today.split('-').map(Number)
  const [month, setMonth] = useState({ y: ty, m0: tm0 - 1 })
  const move = (delta: number) => {
    const m = month.m0 + delta
    setMonth({ y: month.y + Math.floor(m / 12), m0: ((m % 12) + 12) % 12 })
  }
  const leadBlanks = (utc(isoDate(month.y, month.m0, 1)).getUTCDay() + 6) % 7 // Mon-anchored

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-ink/95 backdrop-blur">
      <div className="mx-auto w-full max-w-lg px-4 pt-5">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="flex-1 font-display text-xl font-black tracking-tight">Calendar</h2>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-lg text-fog transition-colors hover:bg-steel-800 hover:text-chalk"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between">
          <button type="button" onClick={() => move(-1)} aria-label="Previous month" className="grid size-9 place-items-center rounded-lg text-fog hover:bg-steel-800 hover:text-chalk">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span className="font-display text-lg font-bold">{monthLabel(month.y, month.m0)}</span>
          <button type="button" onClick={() => move(1)} aria-label="Next month" className="grid size-9 place-items-center rounded-lg text-fog hover:bg-steel-800 hover:text-chalk">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1.5 text-center">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w, i) => (
            <span key={i} className="text-[0.65rem] font-semibold uppercase text-fog">{w}</span>
          ))}
          {Array.from({ length: leadBlanks }, (_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: daysInMonth(month.y, month.m0) }, (_, i) => {
            const date = isoDate(month.y, month.m0, i + 1)
            const label = !props.doneDates.has(date) ? props.scheduledLabels?.get(date) : undefined
            return (
              <div key={date} className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 ${cellClasses(date, props)}`}>
                <span className="nums text-sm font-bold leading-none">{i + 1}</span>
                {label ? (
                  <span className="w-full truncate text-center text-[0.5rem] font-semibold uppercase leading-none tracking-tight">
                    {label}
                  </span>
                ) : (
                  <span className={`size-1 rounded-full ${showDot(date, props) ? 'bg-amber' : 'bg-transparent'}`} />
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fog">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded bg-amber" /> Today</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded border border-green-500/60 bg-green-500/20" /> Workout done</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-amber" /> Training day</span>
        </div>
      </div>
    </div>
  )
}
