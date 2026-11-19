import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { authorizeBootcamp, AccessError } from "@/lib/access";
import { getSession } from "@/lib/queries";
import { getDriveFile, GoogleError } from "@/lib/google";
import { googleMock } from "@/lib/env";
import { isValidDateKey } from "@/lib/dates";

const body = z.object({
  bootcampId: z.string().min(1),
  date: z.string().refine(isValidDateKey),
  kind: z.enum(["PHOTO", "VIDEO", "END_SNAPSHOT"]),
  driveFileId: z.string().min(5).max(200),
  fileName: z.string().min(1).max(300),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().nonnegative(),
});

/** Records a finished upload after checking with Drive that the file really landed in today's folder. */
export async function POST(req: Request) {
  try {
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid upload details." }, { status: 400 });
    const b = parsed.data;
    const { bootcamp, user } = await authorizeBootcamp(b.bootcampId);
    const session = await getSession(bootcamp.id, b.date);
    if (!session?.driveFolderId) return NextResponse.json({ error: "Upload was not started for this day." }, { status: 400 });

    let link: string | null = null;
    let size = b.size;
    if (!googleMock) {
      const f = await getDriveFile(user.id, b.driveFileId);
      if (!f.parents?.includes(session.driveFolderId)) {
        return NextResponse.json({ error: "That file is not in this class's Drive folder." }, { status: 400 });
      }
      link = f.webViewLink ?? null;
      size = f.size || b.size;
    }

    const [row] = await db
      .insert(schema.media)
      .values({
        sessionId: session.id,
        kind: b.kind,
        fileName: b.fileName,
        mimeType: b.mimeType,
        size,
        driveFileId: b.driveFileId,
        driveLink: link,
        uploadedById: user.id,
      })
      .onConflictDoNothing()
      .returning();
    revalidatePath(`/b/${bootcamp.id}`, "layout");
    return NextResponse.json({ id: row?.id ?? null });
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof GoogleError) return NextResponse.json({ error: e.message, reconnect: e.reconnect }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "The file uploaded, but we couldn't record it. Refresh to check." }, { status: 500 });
  }
}
