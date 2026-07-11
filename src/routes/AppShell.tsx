import { NavLink, Outlet, Link } from 'react-router-dom'
import { useEffect } from 'react'
import { seedCatalog } from '../db/database'
import { startSync, stopSync } from '../db/sync'
import { useAuth } from '../auth/AuthContext'

// Sync only runs against a real backend (prod, or VITE_SYNC=1 under wrangler); plain `npm run dev` has no Pages Functions, so it stays off.
const SYNC_ON = import.meta.env.PROD || import.meta.env.VITE_SYNC === '1'

const NAV = [
  { to: '/app/today', label: 'Today', icon: TodayIcon },
  { to: '/app/plans', label: 'Plans', icon: PlansIcon },
  { to: '/app/progress', label: 'Progress', icon: ProgressIcon },
  { to: '/app/history', label: 'History', icon: HistoryIcon },
]

export function AppShell() {
  const { user, token, signOut } = useAuth()

  useEffect(() => {
    seedCatalog()
  }, [])

  useEffect(() => {
    if (!token || !SYNC_ON) return
    startSync(token)
    return () => {
      void stopSync()
    }
  }, [token])

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col bg-ink">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-steel-800 bg-ink/90 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Mark />
          <span className="truncate text-sm font-medium text-fog">
            {user?.name ?? 'Athlete'}
          </span>
        </div>

        <Link
          to="/app/settings"
          aria-label="Settings"
          className="grid size-9 place-items-center rounded-lg text-fog transition-colors hover:bg-steel-800 hover:text-chalk focus-visible:outline-2 focus-visible:outline-amber"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>

        <button
          type="button"
          onClick={signOut}
          aria-label="Sign out"
          className="grid size-9 place-items-center rounded-lg text-fog transition-colors hover:bg-steel-800 hover:text-chalk focus-visible:outline-2 focus-visible:outline-amber"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </header>

      <main className="flex-1 px-4 pb-28 pt-5">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-lg border-t border-steel-800 bg-steel-950/95 backdrop-blur">
        <ul className="flex">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-3 text-xs font-semibold transition-colors ${
                    isActive ? 'text-amber' : 'text-fog hover:text-chalk'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`grid h-1 w-8 place-items-center rounded-full transition-colors ${
                        isActive ? 'bg-amber' : 'bg-transparent'
                      }`}
                    />
                    <Icon />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

function Mark() {
  return (
    <img
      src="/favicon.svg"
      alt=""
      aria-hidden="true"
      className="size-8 shrink-0"
    />
  )
}

function TodayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}
function HistoryIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 4v4h4M12 7v5l3 2" />
    </svg>
  )
}
function PlansIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 7h8M8 12h8M8 17h5" />
    </svg>
  )
}
function ProgressIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 15v3M12 10v8M17 6v12" />
    </svg>
  )
}
