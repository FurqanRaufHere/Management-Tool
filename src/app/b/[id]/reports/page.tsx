import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireBootcamp } from "@/lib/access";
import { getSession, reportInput } from "@/lib/queries";
import { isValidDateKey, todayIn } from "@/lib/dates";
import { ReportComposer } from "./composer";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }> }) {
  const { id } = await params;
  const { date: qd } = await searchParams;
  const { bootcamp, user } = await requireBootcamp(id);
  const today = todayIn(bootcamp.timezone);
  const date = qd && isValidDateKey(qd) && qd <= today ? qd : today;

  const sessions = await db
    .select({ id: schema.classSessions.id, date: schema.classSessions.date })
    .from(schema.classSessions)
    .where(eq(schema.classSessions.bootcampId, id))
    .orderBy(desc(schema.classSessions.date))
    .limit(60);
  const sent = await db
    .select({ id: schema.reports.id, date: schema.classSessions.date, to: schema.reports.to, createdAt: schema.reports.createdAt })
    .from(schema.reports)
    .innerJoin(schema.classSessions, eq(schema.classSessions.id, schema.reports.sessionId))
    .where(eq(schema.classSessions.bootcampId, id))
    .orderBy(desc(schema.reports.createdAt))
    .limit(60);

  const session = await getSession(id, date);
  const input = await reportInput(bootcamp, date, user.name ?? user.email ?? "TA", session?.notes ?? "");

  return (
    <ReportComposer
      bootcampId={id}
      date={date}
      today={today}
      hasSession={!!session}
      dates={Array.from(new Set([today, ...sessions.map((s) => s.date)]))}
      sentDates={Array.from(new Set(sent.map((s) => s.date)))}
      input={{
        ...input,
        startedAt: input.startedAt?.toISOString() ?? null,
        endedAt: input.endedAt?.toISOString() ?? null,
      }}
      to={bootcamp.supervisorEmail ?? ""}
      supervisorName={bootcamp.supervisorName ?? ""}
      cc={bootcamp.reportCc}
      history={sent.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() }))}
    />
  );
}
