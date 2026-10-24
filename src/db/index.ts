import 'server-only';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type Database = PostgresJsDatabase<typeof schema>;
const globalDb = globalThis as typeof globalThis & { unbookinDb?: Database };

function getDatabase(): Database {
  if (globalDb.unbookinDb) return globalDb.unbookinDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required before using the database.');
  const client = postgres(url, { prepare: false, max: 10 });
  globalDb.unbookinDb = drizzle(client, { schema, casing: 'snake_case' });
  return globalDb.unbookinDb;
}

// Defer client creation until a database property is first accessed.
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const database = getDatabase();
    const value = Reflect.get(database, property, database);
    return typeof value === 'function' ? value.bind(database) : value;
  },
});
