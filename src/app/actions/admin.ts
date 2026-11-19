"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { authorizeAdmin } from "@/lib/access";
import { run, UserError } from "@/lib/action";
import { forgetAccess } from "@/lib/allowlist";
import { adminEmails } from "@/lib/env";
import { GoogleError, sendGmail } from "@/lib/google";
import { changeBlockedReason, parseEmailList, type PersonChange } from "@/lib/people";
import { textToEmailHtml } from "@/lib/templates";

const MAX_AT_ONCE = 500;
const role = z.enum(["ADMIN", "TA"]);

const addInput = z.object({
  emails: z.string().max(50_000, "That's too much text. Paste up to 500 emails at a time."),
  role,
  sendInvite: z.boolean(),
});

export async function addPeople(input: z.input<typeof addInput>) {
  return run(async () => {
    const admin = await authorizeAdmin();
    const f = addInput.parse(input);
    const { emails, invalid } = parseEmailList(f.emails);
    if (emails.length === 0) throw new UserError(invalid.length ? `None of those are valid email addresses: ${invalid.join(", ")}` : "Paste at least one email.");
    if (emails.length > MAX_AT_ONCE) throw new UserError(`Add up to ${MAX_AT_ONCE} people at a time.`);

    const existing = await db.select({ email: schema.allowedUsers.email }).from(schema.allowedUsers).where(inArray(schema.allowedUsers.email, emails));
    const taken = new Set([...existing.map((r) => r.email), ...adminEmails]);
    const fresh = emails.filter((e) => !taken.has(e));
    const added = fresh.length
      ? (
          await db
            .insert(schema.allowedUsers)
            .values(fresh.map((email) => ({ email, role: f.role, addedById: admin.id })))
            .onConflictDoNothing()
            .returning({ email: schema.allowedUsers.email })
        ).map((r) => r.email)
      : [];
    added.forEach(forgetAccess);

    const inviteFailed: string[] = [];
    if (f.sendInvite) {
      for (let i = 0; i < added.length; i++) {
        try {
          await sendInvite(admin, added[i]);
        } catch (e) {
          if (!(e instanceof GoogleError)) console.error(e);
          // An expired Google sign-in fails every send, so stop trying after the first one.
          if (e instanceof GoogleError && e.reconnect) {
            inviteFailed.push(...added.slice(i));
            break;
          }
          inviteFailed.push(added[i]);
        }
      }
    }

    revalidatePath("/admin");
    return { added, already: emails.filter((e) => !added.includes(e)), invalid, inviteFailed };
  });
}

async function sendInvite(admin: { id: string; name?: string | null }, email: string) {
  const url = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const from = admin.name || "Your admin";
  const text = [
    "Hi,",
    `${from} has added you to TA Desk, where teaching assistants take attendance, follow up with students and send class reports.`,
    `Open ${url} and sign in with Google using this same Gmail address (${email}).`,
    `Thanks,\n${from}`,
  ].join("\n\n");
  await sendGmail(admin.id, { to: email, subject: "You've been added to TA Desk", text, html: textToEmailHtml(text) });
}

/** Loads the person and checks the change is allowed. Never trusts the client about who is an admin. */
async function personFor(id: string, change: PersonChange) {
  const admin = await authorizeAdmin();
  const personId = z.string().min(1).max(64).parse(id);
  const [person] = await db.select().from(schema.allowedUsers).where(eq(schema.allowedUsers.id, personId)).limit(1);
  if (!person) throw new UserError("That person is no longer on the list. Refresh the page.");
  const blocked = changeBlockedReason(admin.email ?? "", person.email, change, adminEmails);
  if (blocked) throw new UserError(blocked);
  return person;
}

export async function setPersonRole(id: string, newRole: "ADMIN" | "TA") {
  return run(async () => {
    const r = role.parse(newRole);
    const person = await personFor(id, "role");
    await db.update(schema.allowedUsers).set({ role: r }).where(eq(schema.allowedUsers.id, person.id));
    forgetAccess(person.email);
    revalidatePath("/admin");
  });
}

export async function setPersonActive(id: string, active: boolean) {
  return run(async () => {
    const on = z.boolean().parse(active);
    const person = await personFor(id, on ? "role" : "deactivate");
    await db.update(schema.allowedUsers).set({ active: on }).where(eq(schema.allowedUsers.id, person.id));
    forgetAccess(person.email);
    revalidatePath("/admin");
  });
}

export async function removePerson(id: string) {
  return run(async () => {
    const person = await personFor(id, "remove");
    await db.delete(schema.allowedUsers).where(eq(schema.allowedUsers.id, person.id));
    forgetAccess(person.email);
    revalidatePath("/admin");
  });
}
