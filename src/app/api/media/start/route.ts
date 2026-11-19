import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { authorizeBootcamp, AccessError } from "@/lib/access";
import { ensureSession } from "@/lib/queries";
import { ensureChildFolder, GoogleError, startResumableUpload } from "@/lib/google";
import { formatDayShort, isValidDateKey, todayIn, weekdayOf } from "@/lib/dates";

const MAX_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB, plenty for a phone video of a class
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const body = z.object({
  bootcampId: z.string().min(1),
  date: z.string().refine(isValidDateKey),
  kind: z.enum(["PHOTO", "VIDEO", "END_SNAPSHOT"]),
  name: z.string().min(1).max(250),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().positive().max(MAX_BYTES),
});

const KIND_LABEL = { PHOTO: "Photo", VIDEO: "Video", END_SNAPSHOT: "End of class" } as const;

export async function POST(req: Request) {
  try {
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "This file can't be uploaded. Files must be under 4 GB." }, { status: 400 });
    const b = parsed.data;
    if (!/^(image|video)\//.test(b.mimeType)) {
      return NextResponse.json({ error: `${b.name} is not a photo or video.` }, { status: 400 });
    }
    const { bootcamp, user } = await authorizeBootcamp(b.bootcampId);
    if (b.date > todayIn(bootcamp.timezone)) return NextResponse.json({ error: "Pick today or an earlier class day." }, { status: 400 });
    if (!bootcamp.driveFolderId) {
      return NextResponse.json({ error: "Connect a Google Drive folder in Settings before uploading." }, { status: 400 });
    }

    const session = await ensureSession(bootcamp.id, b.date);
    let dayFolder = session.driveFolderId;
    if (!dayFolder) {
      dayFolder = await ensureChildFolder(user.id, bootcamp.driveFolderId, `${b.date} ${DAYS[weekdayOf(b.date)]}`);
      await db.update(schema.classSessions).set({ driveFolderId: dayFolder }).where(eq(schema.classSessions.id, session.id));
    }

    const ext = b.name.includes(".") ? b.name.slice(b.name.lastIndexOf(".")) : "";
    const base = b.name.slice(0, b.name.length - ext.length).slice(0, 120);
    const fileName = `${KIND_LABEL[b.kind]} ${formatDayShort(b.date)} - ${base}${ext}`;

    const origin = req.headers.get("origin") ?? new URL(req.url).origin;
    const uploadUrl = await startResumableUpload(user.id, {
      name: fileName,
      mimeType: b.mimeType,
      size: b.size,
      parentId: dayFolder,
      origin,
    });
    return NextResponse.json({ uploadUrl, fileName });
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof GoogleError) return NextResponse.json({ error: e.message, reconnect: e.reconnect }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Could not start the upload. Try again." }, { status: 500 });
  }
}
