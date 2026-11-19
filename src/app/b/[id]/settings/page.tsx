import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireBootcamp } from "@/lib/access";
import { BootcampForm } from "@/components/bootcamp-form";
import { DriveSettings, TeamSettings, ArchiveSetting } from "./parts";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bootcamp, user } = await requireBootcamp(id);
  const team = await db
    .select({ userId: schema.members.userId, role: schema.members.role, name: schema.users.name, email: schema.users.email })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(eq(schema.members.bootcampId, id));
  const pending = await db.select().from(schema.invites).where(eq(schema.invites.bootcampId, id));

  return (
    <div className="max-w-2xl space-y-14">
      <header>
        <h1 className="h-page">Settings</h1>
        <p className="mt-1 text-muted">Changes apply to everyone working on this bootcamp.</p>
      </header>

      <BootcampForm
        bootcampId={id}
        initial={{
          name: bootcamp.name,
          venue: bootcamp.venue ?? "",
          classStart: bootcamp.classStart,
          classEnd: bootcamp.classEnd,
          classDays: bootcamp.classDays,
          supervisorName: bootcamp.supervisorName ?? "",
          supervisorEmail: bootcamp.supervisorEmail ?? "",
          reportCc: bootcamp.reportCc.join(", "),
          warningThreshold: bootcamp.warningThreshold,
        }}
      />

      <DriveSettings bootcampId={id} folderId={bootcamp.driveFolderId} folderName={bootcamp.driveFolderName} />

      <TeamSettings
        bootcampId={id}
        currentUserId={user.id}
        team={team.map((t) => ({ ...t, name: t.name ?? t.email }))}
        invites={pending.map((p) => ({ id: p.id, email: p.email }))}
      />

      <ArchiveSetting bootcampId={id} archived={bootcamp.archived} />
    </div>
  );
}
