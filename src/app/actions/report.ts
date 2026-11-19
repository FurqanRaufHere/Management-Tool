"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { authorizeBootcamp } from "@/lib/access";
import { run, UserError } from "@/lib/action";
import { getSession, reportInput } from "@/lib/queries";
import { reportHtml, reportSubject, reportText } from "@/lib/report";
import { sendGmail } from "@/lib/google";
import { isValidDateKey } from "@/lib/dates";

export async function saveReportNotes(bootcampId: string, date: string, notes: string) {
  return run(async () => {
    await authorizeBootcamp(bootcampId);
    if (!isValidDateKey(date)) throw new UserError("Pick a valid class date.");
    const s = await getSession(bootcampId, date);
    if (!s) throw new UserError("There is no class recorded for that day.");
    await db.update(schema.classSessions).set({ notes: notes.slice(0, 5000) }).where(eq(schema.classSessions.id, s.id));
  });
}

export async function sendReport(bootcampId: string, date: string, opts: { to: string; cc: string[]; notes: string }) {
  return run(async () => {
    const { bootcamp, user } = await authorizeBootcamp(bootcampId);
    if (!isValidDateKey(date)) throw new UserError("Pick a valid class date.");
    const to = z.string().trim().toLowerCase().email("Add the supervisor's email in Settings first.").parse(opts.to);
    const cc = z.array(z.string().trim().toLowerCase().email()).max(10).parse(opts.cc.filter(Boolean));
    const s = await getSession(bootcampId, date);
    if (!s) throw new UserError("There is no class recorded for that day yet.");

    await db.update(schema.classSessions).set({ notes: opts.notes.slice(0, 5000) }).where(eq(schema.classSessions.id, s.id));
    const input = await reportInput(bootcamp, date, user.name ?? user.email ?? "TA", opts.notes);
    const res = await sendGmail(user.id, {
      to,
      cc,
      subject: reportSubject(input),
      html: reportHtml(input),
      text: reportText(input),
    });
    await db.insert(schema.reports).values({ sessionId: s.id, to, cc, notes: opts.notes, sentById: user.id, gmailId: res.id });
    revalidatePath(`/b/${bootcampId}`, "layout");
  });
}
