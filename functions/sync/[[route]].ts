import { jwtVerify } from 'jose'

type Env = { DB: D1Database; JWT_SECRET: string }
type Checkpoint = { id: string; updatedAt: string } | null
type Row = Record<string, unknown>

// Synced collections and their columns (id first); userId is forced from the JWT, never the client body — the per-user isolation boundary.
const TABLES: Record<string, string[]> = {
  sessions: ['id', 'userId', 'date', 'title', 'plannedDay', 'createdAt', 'updatedAt', 'deletedAt'],
  setlogs: ['id', 'userId', 'sessionId', 'exerciseId', 'exerciseName', 'weightKg', 'reps', 'order', 'createdAt', 'updatedAt', 'deletedAt'],
  plans: ['id', 'userId', 'name', 'days', 'sourceShareCode', 'createdAt', 'updatedAt', 'deletedAt'],
}

// `order` is a SQL keyword — quote it.
const q = (c: string) => (c === 'order' ? '"order"' : c)

/** LWW: an incoming write wins only if STRICTLY newer than master. Pure → unit-tested. */
export const lwwWins = (incomingUpdatedAt: string, masterUpdatedAt: string): boolean =>
  incomingUpdatedAt > masterUpdatedAt

// D1 row → RxDB doc; we never hard-delete, so _deleted is always false and the tombstone rides in deletedAt as an ordinary LWW value.
const toDoc = (row: Row) => ({ ...row, _deleted: false })

async function authUserId(request: Request, env: Env): Promise<string | null> {
  const header = request.headers.get('Authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  // verify is the trust boundary — a throw here means forged/expired → unauthorized.
  try {
    const { payload } = await jwtVerify(
      header.slice(7),
      new TextEncoder().encode(env.JWT_SECRET),
    )
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

async function pull(table: string, env: Env, uid: string, body: { checkpoint?: Checkpoint; limit?: number }) {
  const cols = TABLES[table]
  const ck = body.checkpoint ?? null
  const limit = Math.min(Number(body.limit) || 100, 500)
  const sel = cols.map(q).join(', ')
  const binds: unknown[] = [uid]
  let sql = `SELECT ${sel} FROM ${table} WHERE userId = ?1`
  if (ck) {
    // (updatedAt, id) tuple walk — same ordering as the index and ORDER BY.
    sql += ` AND (updatedAt > ?2 OR (updatedAt = ?2 AND id > ?3))`
    binds.push(ck.updatedAt, ck.id)
  }
  sql += ` ORDER BY updatedAt ASC, id ASC LIMIT ${limit}`
  const { results } = await env.DB.prepare(sql).bind(...binds).all<Row>()
  const documents = results.map(toDoc)
  const last = results[results.length - 1]
  const checkpoint = last ? { id: last.id as string, updatedAt: last.updatedAt as string } : ck
  return { documents, checkpoint }
}

async function push(table: string, env: Env, uid: string, body: { rows?: { newDocumentState: Row }[] }) {
  const cols = TABLES[table]
  const rows = body.rows ?? []
  if (rows.length === 0) return { documents: [] }

  const setCols = cols.filter((c) => c !== 'id' && c !== 'userId') // never overwrite id/userId
  const updateSet = setCols.map((c) => `${q(c)}=excluded.${q(c)}`).join(', ')
  const placeholders = cols.map((_, i) => `?${i + 1}`).join(', ')
  // LWW upsert; the userId guard stops one user clobbering another's row on an id collision.
  const insertSql =
    `INSERT INTO ${table} (${cols.map(q).join(', ')}) VALUES (${placeholders}) ` +
    `ON CONFLICT(id) DO UPDATE SET ${updateSet} ` +
    `WHERE excluded.updatedAt > ${table}.updatedAt AND ${table}.userId = excluded.userId`

  const ids: string[] = []
  const incoming = new Map<string, Row>()
  const stmts = rows.map((r) => {
    const d = r.newDocumentState
    ids.push(d.id as string)
    incoming.set(d.id as string, d)
    const vals = cols.map((c) => (c === 'userId' ? uid : d[c] ?? null))
    return env.DB.prepare(insertSql).bind(...vals)
  })
  await env.DB.batch(stmts)

  // Conflicts = master rows newer than what the client pushed, so RxDB reconciles to server state without waiting for the next pull.
  const sel = cols.map(q).join(', ')
  const inClause = ids.map((_, i) => `?${i + 2}`).join(', ')
  const { results } = await env.DB
    .prepare(`SELECT ${sel} FROM ${table} WHERE userId = ?1 AND id IN (${inClause})`)
    .bind(uid, ...ids)
    .all<Row>()
  const conflicts = results
    .filter((m) => lwwWins(m.updatedAt as string, (incoming.get(m.id as string)?.updatedAt as string) ?? ''))
    .map(toDoc)
  return { documents: conflicts }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const route = (params.route as string[]) ?? []
  const [action, table] = route
  if (!TABLES[table] || (action !== 'pull' && action !== 'push')) return json({ error: 'not found' }, 404)

  const uid = await authUserId(request, env)
  if (!uid) return json({ error: 'unauthorized' }, 401)

  const body = await request.json<Record<string, never>>().catch(() => ({}))
  const result = action === 'pull' ? await pull(table, env, uid, body) : await push(table, env, uid, body)
  return json(result)
}
