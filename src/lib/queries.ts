import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import type { AttendanceStatus, Bootcamp } from "@/db/schema";
import { DEFAULT_TEMPLATES } from "./templates";
import type { ReportInput } from "./report";
import { driveFolderUrl } from "./google";

const { classSessions, students, attendance, media, emails, reports, templates } = schema;

export async function getSession(bootcampId: string, date: string) {
  const [s] = await db
    .select()
    .from(classSessions)
    .where(and(eq(classSessions.bootcampId, bootcampId), eq(classSessions.date, date)))
    .limit(1);
  return s ?? null;
}

export async function ensureSession(bootcampId: string, date: string) {
  await db.insert(classSessions).values({ bootcampId, date }).onConflictDoNothing();
  return (await getSession(bootcampId, date))!;
}

export async function ensureTemplates(bootcampId: string) {
  const existing = await db.select().from(templates).where(eq(templates.bootcampId, bootcampId)).orderBy(asc(templates.kind), asc(templates.name));
  if (existing.length) return existing;
  await db.insert(templates).values(DEFAULT_TEMPLATES.map((t) => ({ ...t, bootcampId })));
  return db.select().from(templates).where(eq(templates.bootcampId, bootcampId)).orderBy(asc(templates.kind), asc(templates.name));
}

export type Counts = ReportInput["counts"];

export async function sessionSummary(bootcamp: Bootcamp, date: string) {
  const session = await getSession(bootcamp.id, date);
  const [{ total }] = await db
    .select({ total: count() })
    .from(students)
    .where(and(eq(students.bootcampId, bootcamp.id), eq(students.active, true)));

  const records = session
    ? await db
        .select({ status: attendance.status, name: students.name, studentId: students.id })
        .from(attendance)
        .innerJoin(students, eq(students.id, attendance.studentId))
        .where(and(eq(attendance.sessionId, session.id), eq(students.active, true)))
    : [];
  const mediaRows = session
    ? await db.select().from(media).where(eq(media.sessionId, session.id)).orderBy(asc(media.createdAt))
    : [];
  const emailRows = session
    ? await db
        .select({ status: emails.status, n: count() })
        .from(emails)
        .where(and(eq(emails.sessionId, session.id), eq(emails.kind, "ABSENCE")))
        .groupBy(emails.status)
    : [];
  const [lastReport] = session
    ? await db.select().from(reports).where(eq(reports.sessionId, session.id)).orderBy(desc(reports.createdAt)).limit(1)
    : [];

  const by = (s: AttendanceStatus) => records.filter((a) => a.status === s);
  const counts: Counts = {
    present: by("PRESENT").length,
    late: by("LATE").length,
    absent: by("ABSENT").length,
    leave: by("LEAVE").length,
    unmarked: Math.max(0, total - records.length),
    total,
  };
  const emailCount = (s: string) => emailRows.find((e) => e.status === s)?.n ?? 0;
  const folderId = session?.driveFolderId && !session.driveFolderId.startsWith("mock_") ? session.driveFolderId : bootcamp.driveFolderId;

  return {
    session,
    counts,
    absentees: by("ABSENT").map((a) => a.name).sort(),
    onLeave: by("LEAVE").map((a) => a.name).sort(),
    mediaItems: mediaRows,
    media: {
      photos: mediaRows.filter((m) => m.kind === "PHOTO").length,
      videos: mediaRows.filter((m) => m.kind === "VIDEO").length,
      endSnapshots: mediaRows.filter((m) => m.kind === "END_SNAPSHOT").length,
      folderUrl: folderId ? driveFolderUrl(folderId) : null,
    },
    emails: { drafts: emailCount("DRAFT"), sent: emailCount("SENT"), failed: emailCount("FAILED") },
    lastReport: lastReport ?? null,
  };
}

export type StudentStat = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  rollNo: string | null;
  active: boolean;
  present: number;
  late: number;
  absent: number;
  leave: number;
  /** Absences in a row, counting back from the latest class. Leave days don't break the run. */
  streak: number;
  lastAbsent: string | null;
  rate: number | null;
};

/** Per-student attendance totals across all class days of a bootcamp. */
export async function studentStats(bootcampId: string, onlyIds?: string[]): Promise<StudentStat[]> {
  const studentWhere = onlyIds
    ? and(eq(students.bootcampId, bootcampId), inArray(students.id, onlyIds.length ? onlyIds : ["-"]))
    : eq(students.bootcampId, bootcampId);
  const [roster, records] = await Promise.all([
    db.select().from(students).where(studentWhere).orderBy(asc(students.name)),
    db
      .select({ studentId: attendance.studentId, status: attendance.status, date: classSessions.date })
      .from(attendance)
      .innerJoin(classSessions, eq(classSessions.id, attendance.sessionId))
      .where(eq(classSessions.bootcampId, bootcampId)),
  ]);
  const byStudent = new Map<string, { date: string; status: AttendanceStatus }[]>();
  for (const r of records) {
    const list = byStudent.get(r.studentId) ?? [];
    list.push({ date: r.date, status: r.status });
    byStudent.set(r.studentId, list);
  }
  return roster.map((s) => {
    const list = (byStudent.get(s.id) ?? []).sort((a, b) => (a.date < b.date ? 1 : -1));
    const c = { PRESENT: 0, LATE: 0, ABSENT: 0, LEAVE: 0 };
    for (const r of list) c[r.status]++;
    let streak = 0;
    for (const r of list) {
      if (r.status === "ABSENT") streak++;
      else if (r.status === "LEAVE") continue;
      else break;
    }
    const counted = c.PRESENT + c.LATE + c.ABSENT;
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      phone: s.phone,
      rollNo: s.rollNo,
      active: s.active,
      present: c.PRESENT,
      late: c.LATE,
      absent: c.ABSENT,
      leave: c.LEAVE,
      streak,
      lastAbsent: list.find((r) => r.status === "ABSENT")?.date ?? null,
      rate: counted ? Math.round(((c.PRESENT + c.LATE) / counted) * 100) : null,
    };
  });
}

export async function reportInput(bootcamp: Bootcamp, date: string, taName: string, notes: string): Promise<ReportInput> {
  const s = await sessionSummary(bootcamp, date);
  return {
    bootcamp,
    date,
    topic: s.session?.topic ?? null,
    startedAt: s.session?.startedAt ?? null,
    endedAt: s.session?.endedAt ?? null,
    counts: s.counts,
    absentees: s.absentees,
    onLeave: s.onLeave,
    media: s.media,
    absenceEmailsSent: s.emails.sent,
    taName,
    notes,
  };
}
