// POST /push/subscribe — store a browser Web Push subscription for the signed-in user (M7 Part G).
// The JWT is the trust boundary (mirrors functions/sync): userId comes from the token `sub`, never
// the body, so one user can't register a push endpoint under another's id.
// ponytail: deploy-gated — the actual SEND (VAPID-signed dispatch) runs from a Cron Worker at deploy
// (see functions/push/send.ts). This endpoint just persists the subscription; it's real and testable.
import { authUserId } from '../lib/jwt'

type Env = { DB: D1Database; JWT_SECRET: string }

type PushSub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const uid = await authUserId(request, env.JWT_SECRET)
  if (!uid) return json({ error: 'unauthorized' }, 401)

  const sub = await request.json<PushSub>().catch(() => ({} as PushSub))
  const endpoint = sub.endpoint
  const p256dh = sub.keys?.p256dh
  const auth = sub.keys?.auth
  if (!endpoint || !p256dh || !auth) return json({ error: 'invalid subscription' }, 400)

  // Upsert by endpoint so re-subscribing (or moving the endpoint to another user) refreshes cleanly.
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, userId, p256dh, auth, createdAt) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET userId = excluded.userId, p256dh = excluded.p256dh, auth = excluded.auth`,
  )
    .bind(endpoint, uid, p256dh, auth, new Date().toISOString())
    .run()

  return json({ ok: true })
}
