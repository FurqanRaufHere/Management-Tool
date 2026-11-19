import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

// One pool per server instance. Keep it small: serverless platforms run many instances,
// and a pooled connection string (Neon, Supabase pooler) is recommended in production.
const client =
  globalForDb.pg ??
  postgres(process.env.DATABASE_URL ?? "", {
    max: Number(process.env.DB_POOL_SIZE ?? 5),
    idle_timeout: 20,
    prepare: process.env.DB_PREPARE !== "false",
  });

if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export { schema };
