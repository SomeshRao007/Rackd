import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type User = {
  id: string
  name: string
  email: string
  picture?: string
  dob?: string // YYYY-MM-DD
  provider?: 'google' | 'password' // gates which account fields are editable
}

// Partial account edit (Settings → Account). Only include the fields being changed.
export type AccountUpdate = {
  name?: string
  dob?: string
  email?: string
  currentPassword?: string
  newPassword?: string
}

type AuthState = {
  user: User | null
  token: string | null
  loading: boolean
  signIn: () => void
  signOut: () => void
  // Email/password. Resolve to null on success, or a user-facing error message.
  register: (email: string, password: string, name: string, dob: string) => Promise<string | null>
  loginWithPassword: (email: string, password: string) => Promise<string | null>
  updateAccount: (fields: AccountUpdate) => Promise<string | null>
}

const AuthContext = createContext<AuthState | null>(null)
const TOKEN_KEY = 'wa_token'
const STUB = import.meta.env.VITE_AUTH_STUB === '1'

/** Decode a JWT payload (no verification — client display only; the Worker verifies). */
function userFromToken(token: string): User | null {
  const part = token.split('.')[1]
  if (!part) return null
  const json = JSON.parse(
    atob(part.replace(/-/g, '+').replace(/_/g, '/')),
  ) as Record<string, unknown>
  if (typeof json.sub !== 'string') return null
  // expiry guard — treat an expired token as signed-out
  if (typeof json.exp === 'number' && json.exp * 1000 < Date.now()) return null
  return {
    id: json.sub,
    name: (json.name as string) ?? (json.email as string) ?? 'Athlete',
    email: (json.email as string) ?? '',
    picture: json.picture as string | undefined,
    dob: json.dob as string | undefined,
    provider: json.provider as 'google' | 'password' | undefined,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // OAuth redirect lands as ?token=...; capture then clean the URL.
    const url = new URL(window.location.href)
    const fromUrl = url.searchParams.get('token')
    if (fromUrl) {
      localStorage.setItem(TOKEN_KEY, fromUrl)
      url.searchParams.delete('token')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
    const stored = localStorage.getItem(TOKEN_KEY)
    if (stored) {
      const u = userFromToken(stored)
      if (u) {
        setToken(stored)
        setUser(u)
      } else {
        localStorage.removeItem(TOKEN_KEY)
      }
    }
    setLoading(false)
  }, [])

  const value = useMemo<AuthState>(() => {
    // POST a credential/account change → on success store the minted JWT (same path as the
    // ?token= redirect), so register / login / account-edit all update identity in place.
    const postJson = async (path: string, payload: unknown, bearer?: string | null): Promise<string | null> => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (bearer) headers.Authorization = `Bearer ${bearer}`
      const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(payload) })
      const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string }
      if (!res.ok || !data.token) return data.error ?? 'Something went wrong. Please try again.'
      const u = userFromToken(data.token)
      if (!u) return 'Something went wrong. Please try again.'
      localStorage.setItem(TOKEN_KEY, data.token)
      setToken(data.token)
      setUser(u)
      return null
    }

    return {
      user,
      token,
      loading,
      register: (email, password, name, dob) => postJson('/auth/register', { email, password, name, dob }),
      loginWithPassword: (email, password) => postJson('/auth/login', { email, password }),
      updateAccount: (fields) => postJson('/auth/account', fields, token),
      signIn: () => {
        if (STUB) {
          // Built (incl. `wrangler pages dev`): get a REAL JWT from the dev-only function so sync uses the same verified path as prod.
          if (import.meta.env.PROD) {
            window.location.href = '/auth/dev-login'
            return
          }
          // Plain `npm run dev`: no backend → fabricate a client-only identity (sync off).
          const stub = btoa(
            JSON.stringify({
              sub: 'stub-user',
              name: 'Local Dev',
              email: 'dev@local',
            }),
          )
          const fake = `stub.${stub}.stub`
          localStorage.setItem(TOKEN_KEY, fake)
          setToken(fake)
          setUser(userFromToken(fake))
          return
        }
        window.location.href = '/auth/google/login'
      },
      signOut: () => {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setUser(null)
      },
    }
  }, [user, token, loading])

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
