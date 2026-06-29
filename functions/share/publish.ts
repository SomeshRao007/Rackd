import { authUserId } from '../lib/jwt'

type Env = { DB: D1Database; JWT_SECRET: string }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

/** Publish a plan as an immutable shared snapshot. Owner-only writer keyed by
 *  (ownerUserId, planId), so re-publishing keeps the same shareCode. No LWW. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const uid = await authUserId(request, env.JWT_SECRET)
  if (!uid) return json({ error: 'unauthorized' }, 401)

  const body = await request
    .json<{ planId?: string; name?: string; days?: string }>()
    .catch(() => ({}) as { planId?: string; name?: string; days?: string })
  if (!body.planId || !body.name || typeof body.days !== 'string') {
    return json({ error: 'bad request' }, 400)
  }

  const ts = new Date().toISOString()
  const planJson = JSON.stringify({ name: body.name, days: body.days })
  // ponytail: shareCode is an unguessable random — no ACL/visibility column at family
  // scale. Upgrade path: a `visibility` column + per-row check if plans go public.
  const newCode = crypto.randomUUID()
  const row = await env.DB.prepare(
    `INSERT INTO shared_plans (shareCode, ownerUserId, planId, name, planJson, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
     ON CONFLICT(ownerUserId, planId) DO UPDATE SET
       name = excluded.name, planJson = excluded.planJson, updatedAt = excluded.updatedAt
     RETURNING shareCode`,
  )
    .bind(newCode, uid, body.planId, body.name, planJson, ts)
    .first<{ shareCode: string }>()

  return json({ shareCode: row?.shareCode ?? newCode })
}
