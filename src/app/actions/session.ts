"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { authorizeBootcamp } from "@/lib/access";
import { run, UserError } from "@/lib/action";
import { ensureSession } from "@/lib/queries";
import { isValidDateKey, todayIn, zonedDateTime } from "@/lib/dates";

export async function startClass(bootcampId: string) {
  return run(async () => {
    const { bootcamp } = await authorizeBootcamp(bootcampId);
    const s = await ensureSession(bootcampId, todayIn(bootcamp.timezone));
    if (s.startedAt) throw new UserError("Class has already been started. Edit the time if it's wrong.");
    await db.update(schema.classSessions).set({ startedAt: new Date() }).where(eq(schema.classSessions.id, s.id));
    revalidatePath(`/b/${bootcampId}`, "layout");
  });
}

export async function endClass(bootcampId: string) {
  return run(async () => {
    const { bootcamp } = await authorizeBootcamp(bootcampId);
    const s = await ensureSession(bootcampId, todayIn(bootcamp.timezone));
    if (!s.startedAt) throw new UserError("Start the class first, or enter the start time by hand.");
    if (s.endedAt) throw new UserError("Class has already ended. Edit the time if it's wrong.");
    await db.update(schema.classSessions).set({ endedAt: new Date() }).where(eq(schema.classSessions.id, s.id));
    revalidatePath(`/b/${bootcampId}`, "layout");
  });
}

const timeOrEmpty = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, "Use a time like 17:30.");

/** For when a TA forgot to press Start or End, or pressed it late. */
export async function editClassTimes(bootcampId: string, date: string, start: string, end: string, topic: string) {
  return run(async () => {
    const { bootcamp } = await authorizeBootcamp(bootcampId);
    if (!isValidDateKey(date)) throw new UserError("Pick a valid class date.");
    timeOrEmpty.parse(start);
    timeOrEmpty.parse(end);
    if (start && end && end <= start) throw new UserError("End time must be after the start time.");
    if (end && !start) throw new UserError("Add a start time too.");
    const tz = bootcamp.timezone;
    const startedAt = start ? zonedDateTime(date, start, tz) : null;
    const endedAt = end ? zonedDateTime(date, end, tz) : null;
    const now = Date.now() + 5 * 60_000;
    if ((startedAt && startedAt.getTime() > now) || (endedAt && endedAt.getTime() > now)) {
      throw new UserError("Times can't be in the future.");
    }
    const s = await ensureSession(bootcampId, date);
    await db
      .update(schema.classSessions)
      .set({ startedAt, endedAt, topic: topic.trim().slice(0, 200) || null })
      .where(eq(schema.classSessions.id, s.id));
    revalidatePath(`/b/${bootcampId}`, "layout");
  });
}
