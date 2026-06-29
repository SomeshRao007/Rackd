import { authUserId } from '../lib/jwt'

type Env = { DB: D1Database; JWT_SECRET: string }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

/** Fetch a shared plan snapshot by code. Auth-required (adopter copies it into their
 *  own plans). Returns { name, days, shareCode } — the input to adoptPlan. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const uid = await authUserId(request, env.JWT_SECRET)
  if (!uid) return json({ error: 'unauthorized' }, 401)

  const row = await env.DB.prepare(
    `SELECT name, planJson, shareCode FROM shared_plans WHERE shareCode = ?1`,
  )
    .bind(params.code as string)
    .first<{ name: string; planJson: string; shareCode: string }>()
  if (!row) return json({ error: 'not found' }, 404)

  const { days } = JSON.parse(row.planJson) as { days: string }
  return json({ name: row.name, days, shareCode: row.shareCode })
}
