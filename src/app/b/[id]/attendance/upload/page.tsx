import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireBootcamp } from "@/lib/access";
import { getSession } from "@/lib/queries";
import { isValidDateKey, todayIn } from "@/lib/dates";
import { UploadFlow } from "./flow";

export const metadata = { title: "Upload attendance" };

export default async function UploadAttendance({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }> }) {
  const { id } = await params;
  const { date: qd } = await searchParams;
  const { bootcamp } = await requireBootcamp(id);
  const today = todayIn(bootcamp.timezone);
  const date = qd && isValidDateKey(qd) && qd <= today ? qd : today;
  const roster = await db
    .select({ id: schema.students.id, name: schema.students.name, email: schema.students.email, rollNo: schema.students.rollNo })
    .from(schema.students)
    .where(and(eq(schema.students.bootcampId, id), eq(schema.students.active, true)))
    .orderBy(asc(schema.students.name));
  const session = await getSession(id, date);
  const manual = session
    ? (
        await db
          .select({ studentId: schema.attendance.studentId, status: schema.attendance.status })
          .from(schema.attendance)
          .where(and(eq(schema.attendance.sessionId, session.id), eq(schema.attendance.source, "manual")))
      ).reduce<Record<string, string>>((m, r) => ((m[r.studentId] = r.status), m), {})
    : {};
  return <UploadFlow bootcampId={id} roster={roster} initialDate={date} today={today} manual={manual} alreadyUploaded={session?.attendanceUploadedAt ? session.attendanceFileName ?? "a sheet" : null} />;
}
