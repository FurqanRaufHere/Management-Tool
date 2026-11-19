import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { getSession } from "./auth";
import { getAccess } from "./allowlist";

export type CurrentUser = { id: string; name?: string | null; email?: string | null; image?: string | null; isAdmin: boolean };

const REMOVED = "Your access to TA Desk was removed. Contact your admin if this is a mistake.";

/** The signed-in user, checked against the allow list so removed people are locked out mid-session. */
export async function requireUser(): Promise<CurrentUser> {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  const access = await getAccess(session.user.email);
  if (!access.allowed) redirect("/login?error=removed");
  return { ...session.user, isAdmin: access.admin };
}

/** Pages under /admin. Everyone else gets a 404 so the page isn't advertised. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  return user;
}

/** Same check as requireUser for actions and API routes. Throws instead of redirecting. */
export async function authorizeUser(): Promise<CurrentUser> {
  const session = await getSession();
  if (!session?.user?.id) throw new AccessError("Your session has ended. Sign in again.");
  const access = await getAccess(session.user.email);
  if (!access.allowed) throw new AccessError(REMOVED);
  return { ...session.user, isAdmin: access.admin };
}

export async function authorizeAdmin(): Promise<CurrentUser> {
  const user = await authorizeUser();
  if (!user.isAdmin) throw new AccessError("Only admins can do this.");
  return user;
}

/** Members see their bootcamps. Admins can open and act on any bootcamp, with role null if they're not on it. */
async function bootcampFor(bootcampId: string, user: CurrentUser) {
  const rows = await db
    .select({ bootcamp: schema.bootcamps, role: schema.members.role })
    .from(schema.members)
    .innerJoin(schema.bootcamps, eq(schema.bootcamps.id, schema.members.bootcampId))
    .where(and(eq(schema.members.bootcampId, bootcampId), eq(schema.members.userId, user.id)))
    .limit(1);
  if (rows[0]) return rows[0];
  if (!user.isAdmin) return null;
  const [bootcamp] = await db.select().from(schema.bootcamps).where(eq(schema.bootcamps.id, bootcampId)).limit(1);
  return bootcamp ? { bootcamp, role: null } : null;
}

/** Loads a bootcamp for a page, only if the current user is a member of it or an admin. */
export async function requireBootcamp(bootcampId: string) {
  const user = await requireUser();
  const m = await bootcampFor(bootcampId, user);
  if (!m) notFound();
  return { user, bootcamp: m.bootcamp, role: m.role };
}

/** Same check for actions and API routes. Throws instead of redirecting. */
export async function authorizeBootcamp(bootcampId: string) {
  const user = await authorizeUser();
  const m = await bootcampFor(bootcampId, user);
  if (!m) throw new AccessError("You don't have access to this bootcamp.");
  return { user, bootcamp: m.bootcamp, role: m.role };
}

export class AccessError extends Error {}
