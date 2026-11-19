"use client";

import { clsx } from "clsx";
import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AttendanceStatus } from "@/db/schema";

// ---------- Button ----------

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  href?: string;
};

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-[background,border,color,box-shadow] disabled:cursor-not-allowed disabled:opacity-55";
const buttonVariants = {
  primary: "bg-board text-white hover:bg-board-deep active:bg-board-deep shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]",
  secondary: "border border-line-strong bg-surface text-ink hover:border-faint hover:bg-paper",
  ghost: "text-ink-soft hover:bg-ink/[0.05] hover:text-ink",
  danger: "border border-absent/25 bg-surface text-absent hover:bg-absent-soft",
};
const buttonSizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-[15px]" };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, href, ...rest },
  ref,
) {
  const cls = clsx(buttonBase, buttonVariants[variant], buttonSizes[size], className);
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button ref={ref} className={cls} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ---------- Status ----------

export const STATUS_META: Record<AttendanceStatus, { label: string; short: string; cls: string; dot: string }> = {
  PRESENT: { label: "Present", short: "P", cls: "bg-board-soft text-board-deep", dot: "bg-board" },
  LATE: { label: "Late", short: "Lt", cls: "bg-late-soft text-late", dot: "bg-late" },
  LEAVE: { label: "On leave", short: "L", cls: "bg-leave-soft text-leave", dot: "bg-leave" },
  ABSENT: { label: "Absent", short: "A", cls: "bg-absent-soft text-absent", dot: "bg-absent" },
};

export function StatusPill({ status, className }: { status: AttendanceStatus | null; className?: string }) {
  if (!status) return <span className={clsx("inline-flex h-6 items-center rounded-md px-2 text-xs text-faint", className)}>Not marked</span>;
  const m = STATUS_META[status];
  return (
    <span className={clsx("inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium", m.cls, className)}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

// ---------- Dialog ----------

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={clsx(
        "m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-lift backdrop:bg-ink/30 backdrop:backdrop-blur-[2px] open:animate-rise",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button onClick={onClose} className="-mr-2 rounded-md p-1.5 text-muted hover:bg-paper hover:text-ink" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

// ---------- Toasts ----------

type Toast = { id: number; tone: "ok" | "error"; text: string };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.tone === "error" ? 8000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "pointer-events-auto flex max-w-md animate-rise items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lift",
              t.tone === "ok" ? "bg-ink text-white" : "border border-absent/30 bg-surface text-absent",
            )}
          >
            <span className="leading-snug">{t.text}</span>
            <button
              onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
              className="-mr-1 opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

// ---------- Small pieces ----------

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function ProgressBar({ value, tone = "board" }: { value: number; tone?: "board" | "absent" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div
        className={clsx("h-full rounded-full transition-[width] duration-300", tone === "board" ? "bg-board" : "bg-absent")}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
