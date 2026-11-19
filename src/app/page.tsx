import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Plus, ShieldCheck } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/access";
import { Mark } from "@/components/mark";
import { Button, Empty } from "@/components/ui";
import { UserMenu } from "@/components/user-menu";
import { formatHHmm12 } from "@/lib/dates";

export default async function Home({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requireUser();
  const { all } = await searchParams;
  const rows = await db
    .select({ b: schema.bootcamps })
    .from(schema.members)
    .innerJoin(schema.bootcamps, eq(schema.bootcamps.id, schema.members.bootcampId))
    .where(and(eq(schema.members.userId, user.id)));
  const active = rows.map((r) => r.b).filter((b) => !b.archived);
  const archived = rows.map((r) => r.b).filter((b) => b.archived);

  if (active.length === 1 && !all) redirect(`/b/${active[0].id}`);
  if (rows.length === 0 && !user.isAdmin) redirect("/new");

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
      <header className="mb-12 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[17px] font-semibold tracking-tight">TA Desk</span>
        </div>
        <div className="flex items-center gap-2">
          {user.isAdmin && (
            <Button href="/admin" variant="ghost" size="sm">
              <ShieldCheck className="h-4 w-4" /> Admin
            </Button>
          )}
          <UserMenu name={user.name ?? ""} email={user.email ?? ""} image={user.image ?? null} />
        </div>
      </header>
      <div className="mb-6 flex items-end justify-between gap-4">
        <h1 className="h-page">Your bootcamps</h1>
        <Button href="/new" variant="primary" size="sm">
          <Plus className="h-4 w-4" /> New bootcamp
        </Button>
      </div>
      {active.length === 0 && (
        <Empty title="No active bootcamps">
          {user.isAdmin ? "Start a new one, or open any bootcamp from the Admin page." : "Start a new one when your next batch begins."}
        </Empty>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface empty:hidden">
        {active.map((b) => (
          <li key={b.id}>
            <Link href={`/b/${b.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-board-mist">
              <div>
                <p className="font-medium">{b.name}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {formatHHmm12(b.classStart)} to {formatHHmm12(b.classEnd)}
                  {b.venue ? `, ${b.venue}` : ""}
                </p>
              </div>
              <span className="text-sm text-board">Open</span>
            </Link>
          </li>
        ))}
      </ul>
      {archived.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-muted">Finished bootcamps ({archived.length})</summary>
          <ul className="mt-3 space-y-1">
            {archived.map((b) => (
              <li key={b.id}>
                <Link href={`/b/${b.id}`} className="text-sm text-ink-soft underline-offset-2 hover:underline">
                  {b.name}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
