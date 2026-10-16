import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

let cached: Db | null = null;

export function db(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  cached = drizzle(postgres(url, { max: 5 }), { schema });
  return cached;
}

export const hasDb = () => Boolean(process.env.DATABASE_URL);

export function makeDb(url: string): Db {
  return drizzle(postgres(url, { max: 3, onnotice: () => {} }), { schema });
}
