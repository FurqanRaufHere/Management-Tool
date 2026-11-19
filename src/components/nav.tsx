"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { CalendarCheck2, Camera, FileText, Mail, Settings, ShieldCheck, Sun, Users, Menu } from "lucide-react";

const ITEMS = [
  { href: "", label: "Today", icon: Sun },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck2 },
  { href: "/students", label: "Students", icon: Users },
  { href: "/emails", label: "Emails", icon: Mail },
  { href: "/media", label: "Photos and videos", short: "Media", icon: Camera },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

function useActive(base: string) {
  const path = usePathname();
  return (href: string) => (href === "" ? path === base : path.startsWith(base + href));
}

export function SideNav({ base, drafts, isAdmin }: { base: string; drafts: number; isAdmin: boolean }) {
  const isActive = useActive(base);
  return (
    <nav className="space-y-0.5">
      {ITEMS.map((it) => {
        const active = isActive(it.href);
        return (
          <Link
            key={it.href}
            href={base + it.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14.5px] transition-colors",
              active ? "bg-surface font-medium text-ink shadow-[0_0_0_1px_#E3E7E4]" : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink",
            )}
          >
            <it.icon className={clsx("h-[18px] w-[18px]", active ? "text-board" : "text-faint")} strokeWidth={1.9} />
            <span className="flex-1">{it.label}</span>
            {it.href === "/emails" && drafts > 0 && (
              <span className="num rounded-full bg-absent-soft px-2 py-0.5 text-xs font-semibold text-absent" title={`${drafts} emails waiting`}>
                {drafts}
              </span>
            )}
          </Link>
        );
      })}
      {isAdmin && (
        <Link
          href="/admin"
          className="mt-3 flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14.5px] text-ink-soft transition-colors hover:bg-ink/[0.04] hover:text-ink"
        >
          <ShieldCheck className="h-[18px] w-[18px] text-faint" strokeWidth={1.9} />
          <span className="flex-1">Admin</span>
        </Link>
      )}
    </nav>
  );
}

const MOBILE = ["", "/attendance", "/emails", "/media"];

export function MobileNav({ base, drafts, isAdmin }: { base: string; drafts: number; isAdmin: boolean }) {
  const isActive = useActive(base);
  const more = ["/students", "/reports", "/settings"];
  const moreActive = more.some((m) => isActive(m));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {ITEMS.filter((i) => MOBILE.includes(i.href)).map((it) => {
        const active = isActive(it.href);
        return (
          <Link key={it.href} href={base + it.href} className={clsx("relative flex flex-col items-center gap-1 py-2.5 text-[11px]", active ? "text-board" : "text-muted")}>
            <it.icon className="h-5 w-5" strokeWidth={1.9} />
            {it.short ?? it.label}
            {it.href === "/emails" && drafts > 0 && (
              <span className="num absolute right-[22%] top-1.5 rounded-full bg-absent px-1.5 text-[10px] font-semibold text-white">{drafts}</span>
            )}
          </Link>
        );
      })}
      <details className="group relative">
        <summary className={clsx("flex cursor-pointer list-none flex-col items-center gap-1 py-2.5 text-[11px] [&::-webkit-details-marker]:hidden", moreActive ? "text-board" : "text-muted")}>
          <Menu className="h-5 w-5" strokeWidth={1.9} />
          More
        </summary>
        <div className="absolute bottom-full right-2 mb-2 w-48 rounded-xl border border-line bg-surface p-1.5 shadow-lift">
          {ITEMS.filter((i) => more.includes(i.href)).map((it) => (
            <Link key={it.href} href={base + it.href} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-paper">
              <it.icon className="h-4 w-4 text-faint" /> {it.label}
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin" className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-paper">
              <ShieldCheck className="h-4 w-4 text-faint" /> Admin
            </Link>
          )}
        </div>
      </details>
    </nav>
  );
}
