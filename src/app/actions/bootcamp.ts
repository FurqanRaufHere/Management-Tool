"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { authorizeBootcamp, requireUser } from "@/lib/access";
import { run, UserError } from "@/lib/action";
import { ensureTemplates } from "@/lib/queries";
import { getDriveFolder, parseDriveFolderId } from "@/lib/google";
import { findAllowedUser, forgetAccess, getAccess } from "@/lib/allowlist";
import { emailAllowed } from "@/lib/env";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 17:30.");
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid supervisor email.");

const bootcampFields = z.object({
  name: z.string().trim().min(2, "Give the bootcamp a name.").max(120),
  venue: z.string().trim().max(160).optional().default(""),
  classStart: hhmm,
  classEnd: hhmm,
  classDays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one class day."),
  supervisorName: z.string().trim().max(120).optional().default(""),
  supervisorEmail: optionalEmail,
  reportCc: z.string().optional().default(""),
  warningThreshold: z.number().int().min(1).max(30),
});

function parseCc(input: string): string[] {
  const list = input
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const e of list) if (!z.string().email().safeParse(e).success) throw new UserError(`"${e}" is not a valid email address.`);
  return Array.from(new Set(list));
}

export async function createBootcamp(input: z.input<typeof bootcampFields>) {
  return run(async () => {
    const user = await requireUser();
    const f = bootcampFields.parse(input);
    if (f.classEnd <= f.classStart) throw new UserError("Class end time must be after the start time.");
    const [b] = await db
      .insert(schema.bootcamps)
      .values({
        name: f.name,
        venue: f.venue || null,
        classStart: f.classStart,
        classEnd: f.classEnd,
        classDays: f.classDays,
        supervisorName: f.supervisorName || null,
        supervisorEmail: f.supervisorEmail || null,
        reportCc: parseCc(f.reportCc),
        warningThreshold: f.warningThreshold,
      })
      .returning();
    await db.insert(schema.members).values({ bootcampId: b.id, userId: user.id, role: "OWNER" });
    await ensureTemplates(b.id);
    return { id: b.id };
  });
}

export async function updateBootcamp(bootcampId: string, input: z.input<typeof bootcampFields>) {
  return run(async () => {
    await authorizeBootcamp(bootcampId);
    const f = bootcampFields.parse(input);
    if (f.classEnd <= f.classStart) throw new UserError("Class end time must be after the start time.");
    await db
      .update(schema.bootcamps)
      .set({
        name: f.name,
        venue: f.venue || null,
        classStart: f.classStart,
        classEnd: f.classEnd,
        classDays: f.classDays,
        supervisorName: f.supervisorName || null,
        supervisorEmail: f.supervisorEmail || null,
        reportCc: parseCc(f.reportCc),
        warningThreshold: f.warningThreshold,
      })
      .where(eq(schema.bootcamps.id, bootcampId));
    revalidatePath(`/b/${bootcampId}`, "layout");
  });
}

export async function connectDriveFolder(bootcampId: string, link: string) {
  return run(async () => {
    const { user } = await authorizeBootcamp(bootcampId);
    const folderId = parseDriveFolderId(link);
    if (!folderId) throw new UserError("Paste a Google Drive folder link, like https://drive.google.com/drive/folders/...");
    const folder = await getDriveFolder(user.id, folderId);
    await db
      .update(schema.bootcamps)
      .set({ driveFolderId: folder.id, driveFolderName: folder.name })
      .where(eq(schema.bootcamps.id, bootcampId));
    revalidatePath(`/b/${bootcampId}`, "layout");
    return folder;
  });
}

export async function disconnectDriveFolder(bootcampId: string) {
  return run(async () => {
    await authorizeBootcamp(bootcampId);
    await db.update(schema.bootcamps).set({ driveFolderId: null, driveFolderName: null }).where(eq(schema.bootcamps.id, bootcampId));
    revalidatePath(`/b/${bootcampId}`, "layout");
  });
}

/**
 * Adds a co-TA, but only someone already allowed on TA Desk. An admin can pass allow to add
 * a new person to the allowed list in the same step.
 */
export async function addCoTa(bootcampId: string, emailInput: string, opts: { allow?: boolean } = {}) {
  return run(async () => {
    const { user } = await authorizeBootcamp(bootcampId);
    const email = z.string().trim().toLowerCase().email("Enter a valid email address.").parse(emailInput);
    const allow = z.boolean().optional().parse(opts.allow);
    const access = await getAccess(email, { fresh: true });
    if (!access.allowed) {
      const row = await findAllowedUser(email);
      // A deactivated person was turned off on purpose, so don't switch them back on from here.
      const canAllow = user.isAdmin && !row && emailAllowed(email);
      if (!allow || !canAllow) {
        if (row && user.isAdmin) throw new UserError("This person's access is turned off. Turn it back on from the Admin page first.");
        return { status: "not_allowed" as const, canAllow };
      }
      await db.insert(schema.allowedUsers).values({ email, role: "TA", addedById: user.id }).onConflictDoNothing();
      forgetAccess(email);
    }
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (existing) {
      await db.insert(schema.members).values({ bootcampId, userId: existing.id, role: "TA" }).onConflictDoNothing();
    } else {
      await db.insert(schema.invites).values({ bootcampId, email }).onConflictDoNothing();
    }
    revalidatePath(`/b/${bootcampId}/settings`);
    return { status: existing ? ("added" as const) : ("pending" as const) };
  });
}

export async function removeMember(bootcampId: string, userId: string) {
  return run(async () => {
    const { user } = await authorizeBootcamp(bootcampId);
    const rows = await db.select().from(schema.members).where(eq(schema.members.bootcampId, bootcampId));
    const target = rows.find((r) => r.userId === userId);
    if (!target) throw new UserError("That person is not on this bootcamp.");
    if (target.role === "OWNER" && rows.filter((r) => r.role === "OWNER").length === 1) {
      throw new UserError("Every bootcamp needs an owner. Make someone else an owner first.");
    }
    if (target.userId === user.id && rows.length === 1) throw new UserError("You're the only TA on this bootcamp.");
    await db.delete(schema.members).where(and(eq(schema.members.bootcampId, bootcampId), eq(schema.members.userId, userId)));
    revalidatePath(`/b/${bootcampId}/settings`);
  });
}

export async function cancelInvite(bootcampId: string, inviteId: string) {
  return run(async () => {
    await authorizeBootcamp(bootcampId);
    await db.delete(schema.invites).where(and(eq(schema.invites.id, inviteId), eq(schema.invites.bootcampId, bootcampId)));
    revalidatePath(`/b/${bootcampId}/settings`);
  });
}

export async function setArchived(bootcampId: string, archived: boolean) {
  return run(async () => {
    await authorizeBootcamp(bootcampId);
    await db.update(schema.bootcamps).set({ archived }).where(eq(schema.bootcamps.id, bootcampId));
    revalidatePath("/", "layout");
  });
}
