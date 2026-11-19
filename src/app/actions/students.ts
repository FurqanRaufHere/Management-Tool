"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { authorizeBootcamp } from "@/lib/access";
import { run, UserError } from "@/lib/action";
import { readSheet } from "@/lib/sheets";
import type { Sheet } from "@/lib/sheet-utils";

const MAX_FILE = 5 * 1024 * 1024;

/** Reads an uploaded spreadsheet so the browser can show a preview and a column mapping. */
export async function readUploadedSheet(bootcampId: string, form: FormData) {
  return run(async (): Promise<Sheet & { fileName: string }> => {
    await authorizeBootcamp(bootcampId);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a file to upload.");
    if (file.size > MAX_FILE) throw new UserError("That file is larger than 5 MB. Remove extra sheets or columns and try again.");
    try {
      const sheet = await readSheet(await file.arrayBuffer(), file.name);
      return { ...sheet, fileName: file.name };
    } catch (e) {
      throw new UserError(e instanceof Error ? e.message : "Could not read that file.");
    }
  });
}

const studentInput = z.object({
  name: z.string().trim().min(1, "Every student needs a name.").max(160),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .nullable(),
  phone: z.string().trim().max(40).nullable(),
  rollNo: z.string().trim().max(60).nullable(),
  extra: z.record(z.string(), z.string()).optional().default({}),
});

/**
 * Adds or updates students from an import. Matches existing students by email, then by roll number,
 * so importing the same sheet twice updates rather than duplicates.
 */
export async function importStudents(bootcampId: string, rows: z.input<typeof studentInput>[]) {
  return run(async () => {
    await authorizeBootcamp(bootcampId);
    if (rows.length === 0) throw new UserError("No students to import.");
    if (rows.length > 2000) throw new UserError("Import up to 2,000 students at a time.");
    const parsed = rows.map((r, i) => {
      const res = studentInput.safeParse(r);
      if (!res.success) throw new UserError(`Row ${i + 1}: ${res.error.issues[0]?.message}`);
      return res.data;
    });

    const existing = await db.select().from(schema.students).where(eq(schema.students.bootcampId, bootcampId));
    const byEmail = new Map(existing.filter((s) => s.email).map((s) => [s.email!, s]));
    const byRoll = new Map(existing.filter((s) => s.rollNo).map((s) => [s.rollNo!.toLowerCase(), s]));

    let added = 0;
    let updated = 0;
    const seen = new Set<string>();
    await db.transaction(async (tx) => {
      for (const r of parsed) {
        const key = r.email ?? (r.rollNo ? `roll:${r.rollNo.toLowerCase()}` : `name:${r.name.toLowerCase()}`);
        if (seen.has(key)) continue; // duplicate row in the same sheet
        seen.add(key);
        const match = (r.email && byEmail.get(r.email)) || (r.rollNo && byRoll.get(r.rollNo.toLowerCase())) || null;
        if (match) {
          await tx
            .update(schema.students)
            .set({
              name: r.name,
              email: r.email ?? match.email,
              phone: r.phone ?? match.phone,
              rollNo: r.rollNo ?? match.rollNo,
              extra: { ...(match.extra ?? {}), ...r.extra },
              active: true,
            })
            .where(eq(schema.students.id, match.id));
          updated++;
        } else {
          await tx.insert(schema.students).values({ bootcampId, ...r });
          added++;
        }
      }
    });
    revalidatePath(`/b/${bootcampId}`, "layout");
    return { added, updated };
  });
}

export async function saveStudent(bootcampId: string, studentId: string | null, input: z.input<typeof studentInput>) {
  return run(async () => {
    await authorizeBootcamp(bootcampId);
    const r = studentInput.parse(input);
    if (r.email) {
      const [clash] = await db
        .select({ id: schema.students.id })
        .from(schema.students)
        .where(and(eq(schema.students.bootcampId, bootcampId), eq(schema.students.email, r.email)))
        .limit(1);
      if (clash && clash.id !== studentId) throw new UserError("Another student already uses that email.");
    }
    if (studentId) {
      await db
        .update(schema.students)
        .set({ name: r.name, email: r.email, phone: r.phone, rollNo: r.rollNo })
        .where(and(eq(schema.students.id, studentId), eq(schema.students.bootcampId, bootcampId)));
    } else {
      await db.insert(schema.students).values({ bootcampId, ...r });
    }
    revalidatePath(`/b/${bootcampId}`, "layout");
  });
}

/** Withdrawn students stay in history but drop out of counts, emails and reports. */
export async function setStudentsActive(bootcampId: string, ids: string[], active: boolean) {
  return run(async () => {
    await authorizeBootcamp(bootcampId);
    if (!ids.length) return;
    await db
      .update(schema.students)
      .set({ active, updatedAt: sql`now()` })
      .where(and(eq(schema.students.bootcampId, bootcampId), inArray(schema.students.id, ids)));
    revalidatePath(`/b/${bootcampId}`, "layout");
  });
}
