// Server-only Postgres pool. Neon in prod/preview (DATABASE_URL from the
// platform env), any Postgres 16 in dev/CI. Never imported from client code.
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalThis.__pgPool) {
    globalThis.__pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    });
  }
  return globalThis.__pgPool;
}

// --- Tenant isolation at the DB layer (RLS) ---------------------------------
// Row-level security policies key off the `app.org_id` GUC. Any access to a
// FORCE-RLS'd tenant table must run inside a transaction that has set it —
// otherwise the rows are invisible. These helpers are the ONLY correct way to
// touch those tables; they make the DB enforce isolation even if an app-level
// `WHERE org_id = $1` is ever forgotten.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Run fn in a transaction with app.org_id set to orgId (validated as a UUID). */
export async function withOrg<T>(orgId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(orgId)) throw new Error("withOrg: orgId is not a uuid");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // set_config with a literal (not a bind param) — SET LOCAL cannot be
    // parameterized; the UUID check above guards against injection.
    await client.query(`SET LOCAL app.org_id = '${orgId}'`);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Single query scoped to an org (RLS-active). */
export async function orgQuery<R extends QueryResultRow = QueryResultRow>(
  orgId: string,
  text: string,
  params: unknown[] = []
): Promise<QueryResult<R>> {
  return withOrg(orgId, (c) => c.query<R>(text, params));
}

/** Set the org GUC inside an already-open transaction (for multi-step writes). */
export async function setOrg(client: PoolClient, orgId: string): Promise<void> {
  if (!UUID_RE.test(orgId)) throw new Error("setOrg: orgId is not a uuid");
  await client.query(`SET LOCAL app.org_id = '${orgId}'`);
}
