"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function UserMenu({ name, email, image, compact }: { name: string; email: string; image: string | null; compact?: boolean }) {
  const initials = (name || email)
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg p-1 hover:bg-ink/[0.05] [&::-webkit-details-marker]:hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-board-soft text-xs font-semibold text-board-deep">{initials}</span>
        )}
        {!compact && (
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm font-medium">{name || email}</span>
            <span className="block truncate text-xs text-muted">{email}</span>
          </span>
        )}
      </summary>
      <div className="absolute bottom-full left-0 z-30 mb-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lift group-[:not([open])]:hidden max-lg:bottom-auto max-lg:left-auto max-lg:right-0 max-lg:top-full max-lg:mt-2">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-paper hover:text-ink"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </details>
  );
}
