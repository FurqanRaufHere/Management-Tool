"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { authorizeBootcamp } from "@/lib/access";
import { run, UserError } from "@/lib/action";
import { ensureSession } from "@/lib/queries";
import { clearAbsenceDrafts, createDrafts } from "@/lib/drafts";
import { isValidDateKey, todayIn } from "@/lib/dates";

const statusEnum = z.enum(["PRESENT", "LATE", "ABSENT", "LEAVE"]);
const dateKey = z.string().refine(isValidDateKey, "Pick a valid class date.");

/**
 * Saves a full day of attendance from a reviewed upload. Re-uploading the same day replaces
 * uploaded marks but keeps any status a TA set by hand (such as leave), unless overwriteManual is set.
 */
export async function saveAttendance(input: {
  bootcampId: string;
  date: string;
  fileName: string;
  marks: { studentId: string; status: z.infer<typeof statusEnum> }[];
  overwriteManual?: boolean;
}) {
  return run(async () => {
    const { bootcamp, user } = await authorizeBootcamp(input.bootcampId);
    const date = dateKey.parse(input.date);
    if (date > todayIn(bootcamp.timezone)) throw new UserError("You can't record attendance for a future date.");
    const marks = z.array(z.object({ studentId: z.string(), status: statusEnum })).parse(input.marks);
    if (!marks.length) throw new UserError("No students were matched, so there is nothing to save.");

    const ids = Array.from(new Set(marks.map((m) => m.studentId)));
    const valid = await db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(and(eq(schema.students.bootcampId, bootcamp.id), inArray(schema.students.id, ids)));
    if (valid.length !== ids.length) throw new UserError("Some students in this upload are not on the roster. Refresh and try again.");

    const session = await ensureSession(bootcamp.id, date);
    const existing = await db.select().from(schema.attendance).where(eq(schema.attendance.sessionId, session.id));
    const manual = new Map(existing.filter((e) => e.source === "manual").map((e) => [e.studentId, e.status]));

    const finalMarks = marks.map((m) =>
      !input.overwriteManual && manual.has(m.studentId) ? { ...m, status: manual.get(m.studentId)!, source: "manual" } : { ...m, source: "upload" },
    );

    await db.transaction(async (tx) => {
      for (const m of finalMarks) {
        await tx
          .insert(schema.attendance)
          .values({ sessionId: session.id, studentId: m.studentId, status: m.status, source: m.source })
          .onConflictDoUpdate({
            target: [schema.attendance.sessionId, schema.attendance.studentId],
            set: { status: m.status, source: m.source },
          });
      }
      await tx
        .update(schema.classSessions)
        .set({ attendanceUploadedAt: new Date(), attendanceFileName: input.fileName.slice(0, 200) })
        .where(eq(schema.classSessions.id, session.id));
    });

    const absent = finalMarks.filter((m) => m.status === "ABSENT").map((m) => m.studentId);
    const notAbsent = finalMarks.filter((m) => m.status !== "ABSENT").map((m) => m.studentId);
    await clearAbsenceDrafts(session.id, notAbsent);
    const drafted = await createDrafts({
      bootcamp,
      kind: "ABSENCE",
      studentIds: absent,
      session,
      date,
      taName: user.name ?? "Your TA",
    });

    revalidatePath(`/b/${bootcamp.id}`, "layout");
    return { saved: finalMarks.length, absent: absent.length, drafted, keptManual: finalMarks.filter((m) => m.source === "manual").length };
  });
}

/** Changes one student's mark for a day, e.g. to record approved leave. */
export async function setMark(bootcampId: string, date: string, studentId: string, status: z.infer<typeof statusEnum> | null) {
  return run(async () => {
    const { bootcamp, user } = await authorizeBootcamp(bootcampId);
    dateKey.parse(date);
    const [student] = await db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(and(eq(schema.students.id, studentId), eq(schema.students.bootcampId, bootcampId)))
      .limit(1);
    if (!student) throw new UserError("Student not found.");
    const session = await ensureSession(bootcampId, date);
    if (status === null) {
      await db
        .delete(schema.attendance)
        .where(and(eq(schema.attendance.sessionId, session.id), eq(schema.attendance.studentId, studentId)));
      await clearAbsenceDrafts(session.id, [studentId]);
    } else {
      statusEnum.parse(status);
      await db
        .insert(schema.attendance)
        .values({ sessionId: session.id, studentId, status, source: "manual" })
        .onConflictDoUpdate({
          target: [schema.attendance.sessionId, schema.attendance.studentId],
          set: { status, source: "manual" },
        });
      if (status === "ABSENT") {
        await createDrafts({ bootcamp, kind: "ABSENCE", studentIds: [studentId], session, date, taName: user.name ?? "Your TA" });
      } else {
        await clearAbsenceDrafts(session.id, [studentId]);
      }
    }
    revalidatePath(`/b/${bootcampId}`, "layout");
  });
}
