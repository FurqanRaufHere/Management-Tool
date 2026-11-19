import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireBootcamp } from "@/lib/access";
import { ensureTemplates } from "@/lib/queries";
import { Outbox } from "./outbox";

export const metadata = { title: "Emails" };
// Sending a batch through Gmail can take a little while.
export const maxDuration = 60;

export default async function EmailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; kind?: string }> }) {
  const { id } = await params;
  const { tab, kind } = await searchParams;
  const { bootcamp, user } = await requireBootcamp(id);
  const [rows, templates] = await Promise.all([
    db
      .select({
        id: schema.emails.id,
        kind: schema.emails.kind,
        to: schema.emails.to,
        subject: schema.emails.subject,
        body: schema.emails.body,
        status: schema.emails.status,
        error: schema.emails.error,
        sentAt: schema.emails.sentAt,
        createdAt: schema.emails.createdAt,
        studentName: schema.students.name,
        date: schema.classSessions.date,
      })
      .from(schema.emails)
      .leftJoin(schema.students, eq(schema.students.id, schema.emails.studentId))
      .leftJoin(schema.classSessions, eq(schema.classSessions.id, schema.emails.sessionId))
      .where(and(eq(schema.emails.bootcampId, id), inArray(schema.emails.status, ["DRAFT", "FAILED", "SENDING", "SENT", "DISCARDED"])))
      .orderBy(desc(schema.emails.createdAt))
      .limit(500),
    ensureTemplates(id),
  ]);
  return (
    <Outbox
      bootcampId={id}
      bootcampName={bootcamp.name}
      fromEmail={user.email ?? ""}
      emails={rows.map((r) => ({ ...r, sentAt: r.sentAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() }))}
      templates={templates}
      initialTab={tab === "sent" || tab === "discarded" || tab === "templates" ? tab : "ready"}
      initialKind={kind === "WARNING" || kind === "ABSENCE" ? kind : null}
    />
  );
}
