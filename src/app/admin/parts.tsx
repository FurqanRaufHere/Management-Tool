"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { clsx } from "clsx";
import { Search } from "lucide-react";
import { addPeople, removePerson, setPersonActive, setPersonRole } from "@/app/actions/admin";
import { Button, Dialog, Empty, Field, useToast } from "@/components/ui";

export type Person = {
  id: string | null;
  email: string;
  name: string | null;
  role: "ADMIN" | "TA";
  active: boolean;
  fromEnv: boolean;
  lastSignIn: string | null;
  bootcamps: number;
  isYou: boolean;
};

type AddResult = { added: string[]; already: string[]; invalid: string[]; inviteFailed: string[] };

function summary(r: AddResult) {
  const parts = [`Added ${r.added.length}`];
  if (r.already.length) parts.push(`${r.already.length} ${r.already.length === 1 ? "was" : "were"} already on the list`);
  if (r.invalid.length) parts.push(`${r.invalid.length} invalid: ${r.invalid.join(", ")}`);
  return parts.join(", ") + ".";
}

export function AddPeople() {
  const router = useRouter();
  const toast = useToast();
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<"TA" | "ADMIN">("TA");
  const [sendInvite, setSendInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="panel space-y-4 p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setResult(null);
        start(async () => {
          const r = await addPeople({ emails, role, sendInvite });
          if (!r.ok) return setError(r.error);
          setResult(r.data);
          toast({ tone: "ok", text: summary(r.data) });
          setEmails("");
          router.refresh();
        });
      }}
    >
      <Field label="Add people" htmlFor="add-emails" hint="Paste one or more Gmail addresses, separated by commas, spaces or new lines.">
        <textarea
          id="add-emails"
          className="field min-h-[96px]"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={"ayesha@gmail.com, bilal@gmail.com"}
        />
      </Field>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="sm:w-44">
          <Field label="Role" htmlFor="add-role">
            <select id="add-role" className="field" value={role} onChange={(e) => setRole(e.target.value as "TA" | "ADMIN")}>
              <option value="TA">TA</option>
              <option value="ADMIN">Admin</option>
            </select>
          </Field>
        </div>
        <label className="flex h-10 items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" className="h-4 w-4 accent-board" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
          Email them an invite
        </label>
        <Button type="submit" variant="primary" loading={pending} disabled={!emails.trim()} className="sm:ml-auto">
          Add
        </Button>
      </div>
      {error && <p className="text-sm text-absent">{error}</p>}
      {result && (
        <div className="space-y-1 text-sm">
          <p className="text-ink-soft">{summary(result)}</p>
          {result.inviteFailed.length > 0 && (
            <p className="text-absent">
              They were added, but the invite email didn&apos;t send to: {result.inviteFailed.join(", ")}. Let them know another way, or sign out
              and in again if your Google access has expired.
            </p>
          )}
        </div>
      )}
    </form>
  );
}

export function PeopleList({ people }: { people: Person[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.email.includes(q) || (p.name ?? "").toLowerCase().includes(q));
  }, [people, query]);

  return (
    <div className="space-y-3">
      <div className="relative sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
        <input
          type="search"
          className="field pl-9"
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search people"
        />
      </div>
      {shown.length === 0 ? (
        <Empty title={people.length ? "No one matches that search" : "No one has been added yet"}>
          {people.length ? "Try part of their name or email." : "Add people above so they can sign in."}
        </Empty>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          <li className="hidden grid-cols-[minmax(0,1fr)_150px_110px_130px_90px_190px] gap-4 px-4 py-2.5 text-xs text-muted md:grid">
            <span>Person</span>
            <span>Role</span>
            <span>Status</span>
            <span>Last sign-in</span>
            <span className="text-right">Bootcamps</span>
            <span />
          </li>
          {shown.map((p) => (
            <PersonRow key={p.id ?? p.email} person={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PersonRow({ person: p }: { person: Person }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const locked = p.fromEnv || p.isYou || !p.id;

  function act(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast({ tone: "error", text: r.error });
      toast({ tone: "ok", text: done });
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <li className="grid gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_150px_110px_130px_90px_190px] md:items-center md:gap-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {p.name ?? p.email}
          {p.isYou && <span className="font-normal text-muted"> (you)</span>}
        </p>
        {p.name && <p className="truncate text-xs text-muted">{p.email}</p>}
        {!p.name && !p.lastSignIn && <p className="text-xs text-muted">Name shows after first sign-in</p>}
      </div>

      <div className="text-sm">
        {p.fromEnv ? (
          <span className="text-ink-soft">Admin (set in server settings)</span>
        ) : (
          <select
            className="field h-8 text-[13px] md:w-full"
            value={p.role}
            disabled={locked || pending}
            aria-label={`Role for ${p.email}`}
            onChange={(e) => {
              const role = e.target.value as "ADMIN" | "TA";
              act(() => setPersonRole(p.id!, role), `${p.email} is now ${role === "ADMIN" ? "an admin" : "a TA"}.`);
            }}
          >
            <option value="TA">TA</option>
            <option value="ADMIN">Admin</option>
          </select>
        )}
      </div>

      <MobileLabel label="Status">
        <span className={clsx("inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium", p.active ? "bg-board-soft text-board-deep" : "bg-absent-soft text-absent")}>
          <span className={clsx("h-1.5 w-1.5 rounded-full", p.active ? "bg-board" : "bg-absent")} />
          {p.active ? "Active" : "Deactivated"}
        </span>
      </MobileLabel>
      <MobileLabel label="Last sign-in">
        <span className={clsx("text-sm", p.lastSignIn ? "text-ink-soft" : "text-faint")}>{p.lastSignIn ?? "Never"}</span>
      </MobileLabel>
      <MobileLabel label="Bootcamps" right>
        <span className="num text-sm">{p.bootcamps}</span>
      </MobileLabel>

      <div className="flex gap-2 md:justify-end">
        {!locked && (
          <>
            <Button
              size="sm"
              variant="ghost"
              loading={pending && !confirming}
              onClick={() => act(() => setPersonActive(p.id!, !p.active), p.active ? `${p.email} can no longer sign in.` : `${p.email} can sign in again.`)}
            >
              {p.active ? "Deactivate" : "Reactivate"}
            </Button>
            <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
              Remove
            </Button>
          </>
        )}
      </div>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title={`Remove ${p.email}?`}>
        <p className="text-sm text-ink-soft">
          They&apos;ll be signed out straight away and won&apos;t be able to sign in again unless an admin adds them back. Their bootcamps and records
          stay as they are.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={pending} onClick={() => act(() => removePerson(p.id!), `${p.email} was removed.`)}>
            Remove
          </Button>
        </div>
      </Dialog>
    </li>
  );
}

/** Shows a small label next to the value on phones, where the table header is hidden. */
function MobileLabel({ label, right, children }: { label: string; right?: boolean; children: React.ReactNode }) {
  return (
    <div className={clsx("flex items-center justify-between gap-3 md:block", right && "md:text-right")}>
      <span className="text-xs text-muted md:hidden">{label}</span>
      {children}
    </div>
  );
}
