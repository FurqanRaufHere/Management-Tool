import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Upload } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireBootcamp } from "@/lib/access";
import { todayIn } from "@/lib/dates";
import { Button, Empty } from "@/components/ui";
import { AttendanceGrid } from "./grid";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bootcamp } = await requireBootcamp(id);
  const sessions = await db
    .select()
    .from(schema.classSessions)
    .where(eq(schema.classSessions.bootcampId, id))
    .orderBy(desc(schema.classSessions.date))
    .limit(40);
  const withMarks = sessions.filter((s) => s.attendanceUploadedAt);
  const students = await db
    .select({ id: schema.students.id, name: schema.students.name, rollNo: schema.students.rollNo })
    .from(schema.students)
    .where(and(eq(schema.students.bootcampId, id), eq(schema.students.active, true)))
    .orderBy(asc(schema.students.name));
  const sessionIds = sessions.map((s) => s.id);
  const records = sessionIds.length
    ? await db
        .select({ sessionId: schema.attendance.sessionId, studentId: schema.attendance.studentId, status: schema.attendance.status })
        .from(schema.attendance)
        .where(inArray(schema.attendance.sessionId, sessionIds))
    : [];
  const dateBySession = new Map(sessions.map((s) => [s.id, s.date]));
  const marks: Record<string, Record<string, (typeof records)[number]["status"]>> = {};
  for (const r of records) {
    const d = dateBySession.get(r.sessionId)!;
    (marks[r.studentId] ??= {})[d] = r.status;
  }
  const dates = Array.from(new Set([...withMarks.map((s) => s.date), ...records.map((r) => dateBySession.get(r.sessionId)!)])).sort();

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-page">Attendance</h1>
          <p className="mt-1 text-muted">
            {dates.length} {dates.length === 1 ? "class" : "classes"} recorded. Click any mark to change it, for example to record approved leave.
          </p>
        </div>
        <Button href={`/b/${id}/attendance/upload`} variant="primary">
          <Upload className="h-4 w-4" /> Upload sheet
        </Button>
      </header>
      {students.length === 0 ? (
        <Empty title="Add students first" action={<Button href={`/b/${id}/students`}>Go to students</Button>}>
          Attendance sheets are matched against your student list.
        </Empty>
      ) : dates.length === 0 ? (
        <Empty title="No attendance yet" action={<Button href={`/b/${id}/attendance/upload`} variant="primary">Upload today&apos;s sheet</Button>}>
          Export the attendance sheet from the LMS and upload it. You&apos;ll check the matches before anything is saved.
        </Empty>
      ) : (
        <AttendanceGrid bootcampId={id} students={students} dates={dates} marks={marks} today={todayIn(bootcamp.timezone)} />
      )}
    </div>
  );
}
