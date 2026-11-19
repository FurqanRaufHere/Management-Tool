import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireBootcamp } from "@/lib/access";
import { Mark } from "@/components/mark";
import { SideNav, MobileNav } from "@/components/nav";
import { UserMenu } from "@/components/user-menu";

export default async function BootcampLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bootcamp, user } = await requireBootcamp(id);
  const [{ drafts }] = await db
    .select({ drafts: count() })
    .from(schema.emails)
    .where(and(eq(schema.emails.bootcampId, id), eq(schema.emails.status, "DRAFT")));
  const otherCount = await db.$count(schema.members, eq(schema.members.userId, user.id));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-paper px-3 py-5 lg:flex">
        <Link href={otherCount > 1 ? "/?all=1" : `/b/${id}`} className="mb-6 flex items-center gap-2.5 px-2">
          <Mark />
          <span className="text-[17px] font-semibold tracking-tight">TA Desk</span>
        </Link>
        <div className="mb-5 px-2">
          <p className="truncate text-sm font-medium text-ink" title={bootcamp.name}>
            {bootcamp.name}
          </p>
          {otherCount > 1 && (
            <Link href="/?all=1" className="text-[13px] text-muted hover:text-board">
              Switch bootcamp
            </Link>
          )}
        </div>
        <SideNav base={`/b/${id}`} drafts={drafts} isAdmin={user.isAdmin} />
        <div className="mt-auto border-t border-line pt-3">
          <UserMenu name={user.name ?? ""} email={user.email ?? ""} image={user.image ?? null} />
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link href={`/b/${id}`} className="flex min-w-0 items-center gap-2">
          <Mark className="h-6 w-6 shrink-0" />
          <span className="truncate text-sm font-semibold">{bootcamp.name}</span>
        </Link>
        <UserMenu compact name={user.name ?? ""} email={user.email ?? ""} image={user.image ?? null} />
      </header>

      <main className="min-w-0 px-4 pb-28 pt-6 sm:px-8 lg:px-12 lg:pb-16 lg:pt-10">
        <div className="mx-auto max-w-[1080px]">{children}</div>
      </main>
      <MobileNav base={`/b/${id}`} drafts={drafts} isAdmin={user.isAdmin} />
    </div>
  );
}
