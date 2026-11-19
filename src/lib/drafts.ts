import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import type { Bootcamp, ClassSession, TemplateKind } from "@/db/schema";
import { ensureTemplates, studentStats } from "./queries";
import { firstNameOf, renderTemplate } from "./templates";
import { formatDayLong } from "./dates";

export function templateVars(
  bootcamp: Bootcamp,
  student: { name: string; absent?: number },
  date: string,
  taName: string,
) {
  return {
    studentName: student.name,
    firstName: firstNameOf(student.name),
    date: formatDayLong(date),
    bootcamp: bootcamp.name,
    taName,
    absences: student.absent === undefined ? "" : `${student.absent} ${student.absent === 1 ? "class" : "classes"}`,
    venue: bootcamp.venue ?? "",
  };
}

/** Prepares (but never sends) emails from a template for the given students. */
export async function createDrafts(opts: {
  bootcamp: Bootcamp;
  kind: TemplateKind;
  studentIds: string[];
  session: ClassSession | null;
  date: string;
  taName: string;
  templateId?: string;
}) {
  const { bootcamp, kind, studentIds, session, date, taName } = opts;
  if (!studentIds.length) return 0;
  const all = await ensureTemplates(bootcamp.id);
  const tpl = (opts.templateId && all.find((t) => t.id === opts.templateId)) || all.find((t) => t.kind === kind) || all[0];
  if (!tpl) return 0;
  const stats = await studentStats(bootcamp.id, studentIds);
  const rows = stats
    .filter((s) => s.active && s.email)
    .map((s) => {
      const vars = templateVars(bootcamp, s, kind === "ABSENCE" ? date : (s.lastAbsent ?? date), taName);
      return {
        bootcampId: bootcamp.id,
        studentId: s.id,
        sessionId: session?.id ?? null,
        kind,
        to: s.email!,
        subject: renderTemplate(tpl.subject, vars),
        body: renderTemplate(tpl.body, vars),
      };
    });
  if (!rows.length) return 0;
  const inserted = await db.insert(schema.emails).values(rows).onConflictDoNothing().returning({ id: schema.emails.id });
  return inserted.length;
}

/** Removes unsent absence drafts for students who are no longer marked absent. */
export async function clearAbsenceDrafts(sessionId: string, studentIds: string[]) {
  if (!studentIds.length) return;
  await db
    .delete(schema.emails)
    .where(
      and(
        eq(schema.emails.sessionId, sessionId),
        eq(schema.emails.kind, "ABSENCE"),
        inArray(schema.emails.studentId, studentIds),
        inArray(schema.emails.status, ["DRAFT", "FAILED"]),
      ),
    );
}
