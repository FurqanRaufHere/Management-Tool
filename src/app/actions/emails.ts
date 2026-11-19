"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { authorizeBootcamp } from "@/lib/access";
import { run, UserError } from "@/lib/action";
import { createDrafts } from "@/lib/drafts";
import { GoogleError, sendGmail } from "@/lib/google";
import { textToEmailHtml } from "@/lib/templates";
import { ensureTemplates } from "@/lib/queries";
import { todayIn } from "@/lib/dates";

const { emails } = schema;

export async function updateDraft(bootcampId: string, id: string, subject: string, body: string) {
  return run(async () => {
    await authorizeBootcamp(bootcampId);
    const s = z.string().trim().min(1, "The subject can't be empty.").max(250).parse(subject);
    const b = z.string().trim().min(1, "The message can't be empty.").max(20000).parse(body);
    const res = await db
      .update(emails)
      .set({ subject: s, body: b })
      .where(and(eq(emails.id, id), eq(emails.bootcampId, bootcampId), inArray(emails.status, ["DRAFT", "FAILED"])))
      .returning({ id: emails.id });
    if (!res.length) throw new UserError("This email was already sent, so it can't be edited.");
    revalidatePath(`/b/${bootcampId}/emails`);
  });
}

export async function discardEmails(bootcampId: string, ids: string[]) {
  return run(async () => {
    await authorizeBootcamp(bootcampId);
    if (!ids.length) return;
    await db
      .update(emails)
      .set({ status: "DISCARDED" })
      .where(and(eq(emails.bootcampId, bootcampId), inArray(emails.id, ids), inArray(emails.status, ["DRAFT", "FAILED"])));
    revalidatePath(`/b/${bootcampId}`, "layout");
  });
}

export async function restoreEmails(bootcampId: string, ids: string[]) {
  return run(async () => {
    await authorizeBootcamp(bootcampId);
    if (!ids.length) return;
    await db
      .update(emails)
      .set({ status: "DRAFT" })
      .where(and(eq(emails.bootcampId, bootcampId), inArray(emails.id, ids), eq(emails.status, "DISCARDED")));
    revalidatePath(`/b/${bootcampId}`, "layout");
  });
}

/** Creates warning (or custom) drafts for chosen students and returns them for editing. */
export async function draftForStudents(bootcampId: string, studentIds: string[], kind: "WARNING" | "CUSTOM", templateId?: string) {
  return run(async () => {
    const { bootcamp, user } = await authorizeBootcamp(bootcampId);
    if (!studentIds.length) throw new UserError("Pick at least one student.");
    const n = await createDrafts({
      bootcamp,
      kind,
      studentIds,
      session: null,
      date: todayIn(bootcamp.timezone),
      taName: user.name ?? "Your TA",
      templateId,
    });
    if (n === 0) throw new UserError("None of those students have an email address on file.");
    revalidatePath(`/b/${bootcampId}/emails`);
    return { drafted: n };
  });
}

/**
 * Sends drafts one by one through the TA's Gmail. Each row is claimed (DRAFT -> SENDING) before sending,
 * so a double click or two TAs pressing Send at once can never email a student twice.
 */
export async function sendEmails(bootcampId: string, ids: string[]) {
  return run(async () => {
    const { user } = await authorizeBootcamp(bootcampId);
    if (!ids.length) throw new UserError("Pick at least one email to send.");
    if (ids.length > 200) throw new UserError("Send up to 200 emails at a time.");

    const claimed = await db
      .update(emails)
      .set({ status: "SENDING", error: null })
      .where(and(eq(emails.bootcampId, bootcampId), inArray(emails.id, ids), inArray(emails.status, ["DRAFT", "FAILED"])))
      .returning();

    let sent = 0;
    let failed = 0;
    let stopError: string | null = null;
    for (const m of claimed) {
      if (stopError) {
        await db.update(emails).set({ status: "FAILED", error: stopError }).where(eq(emails.id, m.id));
        failed++;
        continue;
      }
      try {
        const res = await sendGmail(user.id, { to: m.to, subject: m.subject, text: m.body, html: textToEmailHtml(m.body) });
        await db
          .update(emails)
          .set({ status: "SENT", sentAt: new Date(), sentById: user.id, gmailId: res.id, error: null })
          .where(eq(emails.id, m.id));
        sent++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not send.";
        await db.update(emails).set({ status: "FAILED", error: msg }).where(eq(emails.id, m.id));
        failed++;
        // A sign-in problem will fail every remaining email the same way. Stop and tell the TA once.
        if (e instanceof GoogleError && e.reconnect) stopError = msg;
      }
    }
    revalidatePath(`/b/${bootcampId}`, "layout");
    return { sent, failed, skipped: ids.length - claimed.length, reconnect: !!stopError, error: stopError };
  });
}

const templateInput = z.object({
  name: z.string().trim().min(1, "Name the template.").max(80),
  subject: z.string().trim().min(1, "Add a subject line.").max(250),
  body: z.string().trim().min(1, "Write the message.").max(20000),
});

export async function saveTemplate(
  bootcampId: string,
  id: string | null,
  kind: "ABSENCE" | "WARNING" | "CUSTOM",
  input: z.input<typeof templateInput>,
) {
  return run(async () => {
    await authorizeBootcamp(bootcampId);
    await ensureTemplates(bootcampId);
    const t = templateInput.parse(input);
    if (id) {
      await db
        .update(schema.templates)
        .set(t)
        .where(and(eq(schema.templates.id, id), eq(schema.templates.bootcampId, bootcampId)));
    } else {
      await db.insert(schema.templates).values({ ...t, kind, bootcampId });
    }
    revalidatePath(`/b/${bootcampId}/emails`);
  });
}

export async function deleteTemplate(bootcampId: string, id: string) {
  return run(async () => {
    await authorizeBootcamp(bootcampId);
    const all = await ensureTemplates(bootcampId);
    const t = all.find((x) => x.id === id);
    if (!t) throw new UserError("Template not found.");
    if (t.kind !== "CUSTOM" && all.filter((x) => x.kind === t.kind).length === 1) {
      throw new UserError("Keep at least one template of this type. Edit it instead.");
    }
    await db.delete(schema.templates).where(eq(schema.templates.id, id));
    revalidatePath(`/b/${bootcampId}/emails`);
  });
}
