import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { adminEmails, allowedDomains } from "./env";
import { decideAccess, normalizeEmail, type Access } from "./people";

// Pages, actions and uploads all check access, so keep answers for a short while instead of
// querying on every request. Admin changes clear the entry, so they apply at once on this server.
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; access: Access }>();

export async function findAllowedUser(email: string) {
  const [row] = await db.select().from(schema.allowedUsers).where(eq(schema.allowedUsers.email, normalizeEmail(email))).limit(1);
  return row ?? null;
}

/** Is this email allowed to use TA Desk, and is it an admin? Pass fresh to skip the cache. */
export async function getAccess(email: string | null | undefined, opts: { fresh?: boolean } = {}): Promise<Access> {
  if (!email) return { allowed: false, admin: false, fromEnv: false };
  const key = normalizeEmail(email);
  const hit = cache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL_MS) return hit.access;
  const row = adminEmails.includes(key) ? null : await findAllowedUser(key);
  const access = decideAccess(key, { adminEmails, allowedDomains, row });
  cache.set(key, { at: Date.now(), access });
  return access;
}

/** Call after changing someone's row so the next request sees it. */
export function forgetAccess(email: string) {
  cache.delete(normalizeEmail(email));
}

export async function recordSignIn(email: string, name: string | null) {
  await db
    .update(schema.allowedUsers)
    .set({ lastSignInAt: new Date(), ...(name ? { name } : {}) })
    .where(eq(schema.allowedUsers.email, normalizeEmail(email)));
}
