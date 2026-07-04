// Streak-nudge sender (M7 Part G / R10). Intended to run from a **Cloudflare Cron Worker** bound to
// the same D1 (Pages Functions have no cron trigger), e.g. once a day. The SELECTION logic here is
// real and deploy-agnostic; only the final VAPID-signed dispatch is deploy-gated.
//
// ponytail: we do NOT hand-roll ES256 VAPID signing (≈50 lines of WebCrypto that can't be exercised
// until a real push endpoint + keys + HTTPS deploy exist). `deliverWebPush` is the single seam to wire
// at deploy — drop in a maintained web-push builder (e.g. pushforge, Workers-compatible) there. Until
// then this module typechecks and its selection is unit-inspectable, matching the M1/M2 gated-code ethos.

export type PushEnv = {
  DB: D1Database
  VAPID_PUBLIC: string
  VAPID_PRIVATE: string
  VAPID_SUBJECT: string // 'mailto:you@example.com'
}

type SubRow = { endpoint: string; userId: string; p256dh: string; auth: string }

const RISK_MIN_DAYS = 7 // a week off → nudge (mirrors consistency.detrainingRisk 'soon')
const DAY_MS = 86_400_000

/** Whole days between an ISO date and now (UTC day math — good enough for a daily cron). */
const daysSince = (isoDate: string, nowMs: number): number =>
  Math.floor((nowMs - Date.parse(isoDate + 'T00:00:00Z')) / DAY_MS)

/** Nudge everyone whose last session is ≥ RISK_MIN_DAYS ago. Returns how many were dispatched. */
export async function notifyStreaksAtRisk(env: PushEnv, nowMs: number): Promise<{ notified: number }> {
  const subs = await env.DB.prepare(
    `SELECT endpoint, userId, p256dh, auth FROM push_subscriptions`,
  ).all<SubRow>()

  let notified = 0
  for (const sub of subs.results ?? []) {
    const last = await env.DB.prepare(
      `SELECT MAX(date) AS d FROM sessions WHERE userId = ? AND deletedAt IS NULL`,
    )
      .bind(sub.userId)
      .first<{ d: string | null }>()
    if (!last?.d) continue
    const days = daysSince(last.d, nowMs)
    if (days < RISK_MIN_DAYS) continue
    await deliverWebPush(sub, {
      title: 'Your streak is cooling off 🥶',
      body: `${days} days since your last session — a quick one keeps the momentum.`,
      url: '/app/today',
    }, env)
    notified++
  }
  return { notified }
}

export type PushPayload = { title: string; body: string; url: string }

/**
 * DEPLOY-GATED SEAM. Sends one VAPID-signed Web Push. Wire a maintained web-push builder here at
 * deploy (VAPID keys live in the Cron Worker env). Left unimplemented on purpose so nothing fragile
 * or untestable ships now — see the module header.
 */
export async function deliverWebPush(_sub: SubRow, _payload: PushPayload, _env: PushEnv): Promise<void> {
  throw new Error('deliverWebPush: wire VAPID dispatch at deploy (see functions/push/send.ts header)')
}
