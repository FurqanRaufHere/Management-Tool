import Link from "next/link";
import { asc, count, desc, eq, inArray, isNotNull, max } from "drizzle-orm";
import { formatDistanceToNow } from "date-fns";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/access";
import { adminEmails } from "@/lib/env";
import { attendanceRate } from "@/lib/report";
import { formatDayShort, plural, todayIn } from "@/lib/dates";
import { Mark } from "@/components/mark";
import { Empty } from "@/components/ui";
import { UserMenu } from "@/components/user-menu";
import { AddPeople, PeopleList, type Person } from "./parts";

export const metadata = { title: "Admin" };

const { allowedUsers, users, googleAccounts, members, bootcamps, students, classSessions, attendance, reports } = schema;
const RATE_DAYS = 7;

function ago(d: Date | null | undefined) {
  return d ? formatDistanceToNow(d, { addSuffix: true }) : null;
}

async function loadPeople(me: string): Promise<Person[]> {
  const rows = await db
    .select({ p: allowedUsers, userId: users.id, userName: users.name })
    .from(allowedUsers)
    .leftJoin(users, eq(users.email, allowedUsers.email))
    .orderBy(asc(allowedUsers.email));
  // Admins from ADMIN_EMAILS have no row; their last sign-in is when their Google tokens were last saved.
  const envAdmins = adminEmails.length
    ? await db
        .select({ email: users.email, userId: users.id, name: users.name, lastSeen: googleAccounts.updatedAt })
        .from(users)
        .leftJoin(googleAccounts, eq(googleAccounts.userId, users.id))
        .where(inArray(users.email, adminEmails))
    : [];
  const counts = new Map(
    (await db.select({ userId: members.userId, n: count() }).from(members).groupBy(members.userId)).map((r) => [r.userId, r.n]),
  );

  const fromEnv: Person[] = adminEmails.map((email) => {
    const u = envAdmins.find((a) => a.email === email);
    return {
      id: null,
      email,
      name: u?.name ?? null,
      role: "ADMIN",
      active: true,
      fromEnv: true,
      lastSignIn: ago(u?.lastSeen),
      bootcamps: u?.userId ? (counts.get(u.userId) ?? 0) : 0,
      isYou: email === me,
    };
  });
  const listed: Person[] = rows
    .filter((r) => !adminEmails.includes(r.p.email))
    .map((r) => ({
      id: r.p.id,
      email: r.p.email,
      name: r.p.name ?? r.userName,
      role: r.p.role,
      active: r.p.active,
      fromEnv: false,
      lastSignIn: ago(r.p.lastSignInAt),
      bootcamps: r.userId ? (counts.get(r.userId) ?? 0) : 0,
      isYou: r.p.email === me,
    }));
  return [...fromEnv, ...listed];
}

async function loadBootcamps() {
  const all = await db.select().from(bootcamps).orderBy(asc(bootcamps.archived), asc(bootcamps.name));
  const team = await db
    .select({ bootcampId: members.bootcampId, name: users.name, email: users.email })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId));
  const studentCounts = await db
    .select({ bootcampId: students.bootcampId, n: count() })
    .from(students)
    .where(eq(students.active, true))
    .groupBy(students.bootcampId);
  const marked = await db
    .select({ bootcampId: classSessions.bootcampId, date: classSessions.date, status: attendance.status, n: count() })
    .from(attendance)
    .innerJoin(classSessions, eq(classSessions.id, attendance.sessionId))
    .groupBy(classSessions.bootcampId, classSessions.date, attendance.status)
    .orderBy(desc(classSessions.date));
  const started = await db
    .select({ bootcampId: classSessions.bootcampId, last: max(classSessions.date) })
    .from(classSessions)
    .where(isNotNull(classSessions.startedAt))
    .groupBy(classSessions.bootcampId);
  const lastReports = await db
    .select({ bootcampId: classSessions.bootcampId, last: max(reports.createdAt) })
    .from(reports)
    .innerJoin(classSessions, eq(classSessions.id, reports.sessionId))
    .groupBy(classSessions.bootcampId);

  return all.map((b) => {
    const rows = marked.filter((m) => m.bootcampId === b.id);
    const days = Array.from(new Set(rows.map((r) => r.date))).slice(0, RATE_DAYS);
    const recent = rows.filter((r) => days.includes(r.date));
    const sum = (s: string) => recent.filter((r) => r.status === s).reduce((a, r) => a + r.n, 0);
    const counts = { present: sum("PRESENT"), late: sum("LATE"), absent: sum("ABSENT"), leave: sum("LEAVE"), unmarked: 0, total: 0 };
    const lastStarted = started.find((s) => s.bootcampId === b.id)?.last ?? null;
    const lastClass = [days[0], lastStarted].filter((d): d is string => !!d).sort().pop() ?? null;
    const lastReport = lastReports.find((r) => r.bootcampId === b.id)?.last ?? null;
    return {
      id: b.id,
      name: b.name,
      archived: b.archived,
      tas: team.filter((t) => t.bootcampId === b.id).map((t) => t.name ?? t.email),
      students: studentCounts.find((s) => s.bootcampId === b.id)?.n ?? 0,
      lastClass: lastClass ? formatDayShort(lastClass) : null,
      lastReport: lastReport ? formatDayShort(todayIn(b.timezone, new Date(lastReport))) : null,
      rate: days.length ? attendanceRate(counts) : null,
      days: days.length,
    };
  });
}

export default async function AdminPage() {
  const user = await requireAdmin();
  const [people, camps] = await Promise.all([loadPeople((user.email ?? "").toLowerCase()), loadBootcamps()]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5 sm:py-12">
      <header className="mb-12 flex items-center justify-between">
        <Link href="/?all=1" className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[17px] font-semibold tracking-tight">TA Desk</span>
        </Link>
        <UserMenu name={user.name ?? ""} email={user.email ?? ""} image={user.image ?? null} />
      </header>

      <h1 className="h-page">Admin</h1>
      <p className="mt-1 text-muted">Only people on this list can sign in to TA Desk.</p>

      <section className="mt-10 space-y-6">
        <div>
          <h2 className="h-section">People</h2>
          <p className="mt-1 text-sm text-muted">
            Each person also needs to be a Test user on the Google OAuth consent screen while the app is in Testing mode.
          </p>
        </div>
        <AddPeople />
        <PeopleList people={people} />
      </section>

      <section className="mt-14">
        <h2 className="h-section">Bootcamps</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Every bootcamp on TA Desk. Attendance rate covers the last {RATE_DAYS} class days with attendance.</p>
        {camps.length === 0 ? (
          <Empty title="No bootcamps yet">They show up here once a TA sets one up.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Bootcamp</th>
                  <th className="px-4 py-3 font-medium">TAs</th>
                  <th className="px-4 py-3 text-right font-medium">Students</th>
                  <th className="px-4 py-3 font-medium">Last class</th>
                  <th className="px-4 py-3 font-medium">Last report</th>
                  <th className="px-4 py-3 text-right font-medium">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {camps.map((b) => (
                  <tr key={b.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link href={`/b/${b.id}`} className="font-medium hover:text-board hover:underline">
                        {b.name}
                      </Link>
                      {b.archived && <p className="text-xs text-muted">Finished</p>}
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-ink-soft">{b.tas.length ? b.tas.join(", ") : <span className="text-faint">None</span>}</td>
                    <td className="num px-4 py-3 text-right">{b.students}</td>
                    <td className="px-4 py-3">{b.lastClass ?? <span className="text-faint">None yet</span>}</td>
                    <td className="px-4 py-3">{b.lastReport ?? <span className="text-faint">None yet</span>}</td>
                    <td className="num px-4 py-3 text-right">
                      {b.rate === null ? <span className="text-faint">No data</span> : `${b.rate}%`}
                      {b.rate !== null && b.days < RATE_DAYS && <p className="text-xs text-muted">{plural(b.days, "day")}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
