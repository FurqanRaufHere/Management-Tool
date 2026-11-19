import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireBootcamp } from "@/lib/access";
import { driveFolderUrl } from "@/lib/google";
import { todayIn } from "@/lib/dates";
import { Button, Empty } from "@/components/ui";
import { MediaUploader } from "./uploader";

export const metadata = { title: "Photos and videos" };

export default async function MediaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { id } = await params;
  const { kind } = await searchParams;
  const { bootcamp } = await requireBootcamp(id);
  const rows = await db
    .select({ m: schema.media, date: schema.classSessions.date, folder: schema.classSessions.driveFolderId })
    .from(schema.media)
    .innerJoin(schema.classSessions, eq(schema.classSessions.id, schema.media.sessionId))
    .where(eq(schema.classSessions.bootcampId, id))
    .orderBy(desc(schema.classSessions.date), desc(schema.media.createdAt))
    .limit(600);

  const byDate = new Map<string, { folder: string | null; items: (typeof rows)[number]["m"][] }>();
  for (const r of rows) {
    const g = byDate.get(r.date) ?? { folder: r.folder, items: [] };
    g.items.push(r.m);
    byDate.set(r.date, g);
  }
  const history = Array.from(byDate.entries()).map(([date, g]) => ({
    date,
    folderUrl: g.folder && !g.folder.startsWith("mock_") ? driveFolderUrl(g.folder) : null,
    items: g.items.map((m) => ({ id: m.id, kind: m.kind, fileName: m.fileName, size: m.size, link: m.driveLink, mimeType: m.mimeType, createdAt: m.createdAt.toISOString() })),
  }));

  return (
    <div>
      <header className="mb-6">
        <h1 className="h-page">Photos and videos</h1>
        <p className="mt-1 text-muted">
          {bootcamp.driveFolderId ? (
            <>
              Files go straight into{" "}
              <a href={driveFolderUrl(bootcamp.driveFolderId)} target="_blank" rel="noreferrer" className="text-board underline-offset-2 hover:underline">
                {bootcamp.driveFolderName ?? "your Drive folder"}
              </a>
              , in a folder for each class day.
            </>
          ) : (
            "Connect a Google Drive folder to start uploading."
          )}
        </p>
      </header>
      {!bootcamp.driveFolderId ? (
        <Empty title="No Drive folder connected" action={<Button href={`/b/${id}/settings#drive`} variant="primary">Connect Drive folder</Button>}>
          Paste the link to the folder atomcamp shared with you. You need Editor access to it.
        </Empty>
      ) : (
        <MediaUploader
          bootcampId={id}
          today={todayIn(bootcamp.timezone)}
          history={history}
          initialKind={kind === "END_SNAPSHOT" || kind === "VIDEO" ? kind : "PHOTO"}
        />
      )}
    </div>
  );
}
