import { Navigate } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { todayISO } from '../lib/dates'

export function Landing() {
  const { user, signIn, register, loginWithPassword } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to="/app" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await (mode === 'register'
      ? register(email, password, name, dob)
      : loginWithPassword(email, password))
    // On success `user` is set → the <Navigate> above redirects on the next render.
    if (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <main className="relative mx-auto flex min-h-svh max-w-lg flex-col overflow-hidden px-6">
      {/* ambient sodium-lamp glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-amber/20 blur-3xl"
      />

      <header className="flex items-center gap-2.5 pt-8">
        <span className="grid size-9 place-items-center rounded-lg bg-amber text-ink">
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
            <rect x="1.5" y="9.5" width="2.5" height="5" rx="0.75" />
            <rect x="4.5" y="7.5" width="3" height="9" rx="1" />
            <rect x="7.5" y="10.75" width="9" height="2.5" rx="1.25" />
            <rect x="16.5" y="7.5" width="3" height="9" rx="1" />
            <rect x="20" y="9.5" width="2.5" height="5" rx="0.75" />
          </svg>
        </span>
        <span className="font-display text-lg font-bold tracking-tight">
          Rackd
        </span>
      </header>

      <div className="flex flex-1 flex-col justify-center py-12">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber">
          Workout log · offline-first
        </p>
        <h1 className="mt-3 font-display text-6xl font-black leading-[0.95] tracking-tight">
          Log the set.
          <br />
          <span className="text-amber">Beat the last.</span>
        </h1>
        <p className="mt-5 max-w-sm text-lg text-fog">
          It remembers what you lifted last time, so today&rsquo;s set is one tap.
          No signal in the gym? Doesn&rsquo;t matter. Built for you and everyone
          you train with.
        </p>

        {/* the signature: a live-looking "last set" readout — the app's whole pitch */}
        <div className="mt-8 w-fit rounded-2xl border border-steel-800 bg-steel-900 p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-fog">
            Last bench press
          </span>
          <div className="nums mt-1 flex items-baseline gap-2 font-display font-black">
            <span className="text-5xl">80</span>
            <span className="text-2xl text-fog">kg</span>
            <span className="px-1 text-2xl text-steel-600">×</span>
            <span className="text-5xl">5</span>
            <span className="text-lg text-fog">reps</span>
          </div>
        </div>
      </div>

      <div className="pb-10">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {mode === 'register' && (
            <>
              <input
                type="text"
                required
                autoComplete="name"
                placeholder="Your name"
                aria-label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-steel-700 bg-steel-900 px-4 py-3.5 text-chalk placeholder:text-fog focus-visible:outline-2 focus-visible:outline-amber"
              />
              <label className="flex items-center justify-between gap-3 rounded-xl border border-steel-700 bg-steel-900 px-4 py-3.5 text-fog">
                <span>Date of birth</span>
                <input
                  type="date"
                  autoComplete="bday"
                  max={todayISO()}
                  aria-label="Date of birth"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="nums bg-transparent text-right text-chalk outline-none [color-scheme:dark]"
                />
              </label>
            </>
          )}
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@email.com"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-steel-700 bg-steel-900 px-4 py-3.5 text-chalk placeholder:text-fog focus-visible:outline-2 focus-visible:outline-amber"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              placeholder={mode === 'register' ? 'Password (min 8 characters)' : 'Password'}
              aria-label="Password"
              aria-invalid={error ? true : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-steel-700 bg-steel-900 px-4 py-3.5 pr-12 text-chalk placeholder:text-fog focus-visible:outline-2 focus-visible:outline-amber"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-fog transition-colors hover:text-chalk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68" />
                  <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <path d="m2 2 20 20" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-amber py-4 font-display text-base font-black uppercase tracking-wide text-ink transition-colors hover:bg-amber/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:opacity-60"
          >
            {busy ? 'One sec…' : mode === 'register' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="mt-3 text-center text-sm text-fog">
          {mode === 'register' ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'register' ? 'login' : 'register')
              setError(null)
            }}
            className="font-bold text-amber hover:underline"
          >
            {mode === 'register' ? 'Sign in' : 'Create account'}
          </button>
        </p>

        <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-steel-600">
          <span className="h-px flex-1 bg-steel-800" />
          or
          <span className="h-px flex-1 bg-steel-800" />
        </div>

        <button
          type="button"
          onClick={signIn}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-chalk py-4 font-display text-base font-black uppercase tracking-wide text-ink transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <path fill="#EA4335" d="M12 11v3.5h4.9c-.2 1.3-1.6 3.8-4.9 3.8-2.9 0-5.3-2.4-5.3-5.4S9 7.5 12 7.5c1.7 0 2.8.7 3.4 1.3l2.3-2.2C16.3 5.2 14.4 4.4 12 4.4 7.4 4.4 3.7 8.1 3.7 12.7S7.4 21 12 21c4.9 0 8.1-3.4 8.1-8.2 0-.6-.1-1-.2-1.5H12z" />
          </svg>
          Sign in with Google
        </button>
        <p className="mt-3 text-center text-xs text-fog">
          Your sets stay on your device until you sign in.
        </p>
      </div>
    </main>
  )
}
