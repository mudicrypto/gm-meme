import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { RpcCaller } from '../../src/tokens/supabase-repository';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../../../supabase/migrations');

/**
 * A real Postgres (PGlite, in-process) with our Supabase migrations applied, exposed
 * through the same rpc() shape supabase-js uses. Lets tests run the actual SQL.
 */
export async function createPgliteRpc(): Promise<{ rpc: RpcCaller; db: PGlite }> {
  const db = new PGlite();
  // Roles that exist in every Supabase project.
  await db.exec(`create role anon; create role authenticated; create role service_role;`);
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }

  const rpc: RpcCaller = async (fn, args) => {
    const names = Object.keys(args);
    const params = names.map((name) => {
      const value = args[name];
      // jsonb arguments arrive as JSON from PostgREST; text[] stays an array.
      return Array.isArray(value) && value.some((v) => typeof v === 'object')
        ? JSON.stringify(value)
        : value;
    });
    const sql = `select * from public.${fn}(${names.map((name, i) => `${name} => $${i + 1}`).join(', ')})`;
    try {
      const result = await db.query(sql, params);
      return { data: result.rows, error: null };
    } catch (err) {
      return { data: null, error: { message: (err as Error).message } };
    }
  };

  return { rpc, db };
}
