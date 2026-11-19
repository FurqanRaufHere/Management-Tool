"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { clsx } from "clsx";
import { Send, Trash2, RotateCcw } from "lucide-react";
import type { EmailStatus, Template, TemplateKind } from "@/db/schema";
import { deleteTemplate, discardEmails, restoreEmails, saveTemplate, sendEmails, updateDraft } from "@/app/actions/emails";
import { PLACEHOLDERS } from "@/lib/templates";
import { formatDayShort } from "@/lib/dates";
import { Button, Empty, Field, ProgressBar, useToast } from "@/components/ui";

type Row = {
  id: string;
  kind: TemplateKind;
  to: string;
  subject: string;
  body: string;
  status: EmailStatus;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  studentName: string | null;
  date: string | null;
};
type Tab = "ready" | "sent" | "discarded" | "templates";

const KIND_LABEL: Record<TemplateKind, string> = { ABSENCE: "Missed class", WARNING: "Warning", CUSTOM: "Other" };
const BATCH = 10;

export function Outbox({
  bootcampId,
  bootcampName,
  fromEmail,
  emails,
  templates,
  initialTab,
  initialKind,
}: {
  bootcampId: string;
  bootcampName: string;
  fromEmail: string;
  emails: Row[];
  templates: Template[];
  initialTab: Tab;
  initialKind: TemplateKind | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [kind, setKind] = useState<TemplateKind | null>(initialKind);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [, start] = useTransition();

  const inTab = (e: Row) =>
    tab === "ready" ? e.status === "DRAFT" || e.status === "FAILED" || e.status === "SENDING" : tab === "sent" ? e.status === "SENT" : e.status === "DISCARDED";
  const list = useMemo(() => emails.filter((e) => inTab(e) && (!kind || e.kind === kind)), [emails, tab, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = {
    ready: emails.filter((e) => e.status === "DRAFT" || e.status === "FAILED" || e.status === "SENDING").length,
    sent: emails.filter((e) => e.status === "SENT").length,
    discarded: emails.filter((e) => e.status === "DISCARDED").length,
  };
  const active = list.find((e) => e.id === activeId) ?? list[0] ?? null;

  useEffect(() => {
    setSelected(tab === "ready" ? new Set(list.filter((e) => e.status !== "SENDING").map((e) => e.id)) : new Set());
    // Select every ready email by default: the usual action is "check, then send all".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, kind, emails.length]);

  async function sendIds(ids: string[]) {
    if (!ids.length) return;
    setProgress({ done: 0, total: ids.length });
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < ids.length; i += BATCH) {
      const r = await sendEmails(bootcampId, ids.slice(i, i + BATCH));
      if (!r.ok) {
        toast({ tone: "error", text: r.error });
        break;
      }
      sent += r.data.sent;
      failed += r.data.failed;
      setProgress({ done: Math.min(ids.length, i + BATCH), total: ids.length });
      if (r.data.reconnect) {
        toast({ tone: "error", text: r.data.error ?? "Reconnect your Google account to keep sending." });
        break;
      }
    }
    setProgress(null);
    if (sent) toast({ tone: "ok", text: `Sent ${sent} ${sent === 1 ? "email" : "emails"} from ${fromEmail}.` });
    if (failed && sent) toast({ tone: "error", text: `${failed} didn't send. They're still in Ready to send with the reason.` });
    setSelected(new Set());
    router.refresh();
  }

  function discard(ids: string[]) {
    start(async () => {
      const r = await discardEmails(bootcampId, ids);
      if (!r.ok) return toast({ tone: "error", text: r.error });
      toast({ tone: "ok", text: ids.length === 1 ? "Email discarded." : `${ids.length} emails discarded.` });
      router.refresh();
    });
  }

  function restore(ids: string[]) {
    start(async () => {
      const r = await restoreEmails(bootcampId, ids);
      if (!r.ok) return toast({ tone: "error", text: r.error });
      toast({ tone: "ok", text: "Moved back to Ready to send." });
      router.refresh();
    });
  }

  const tabs: [Tab, string, number | null][] = [
    ["ready", "Ready to send", counts.ready],
    ["sent", "Sent", counts.sent],
    ["discarded", "Discarded", counts.discarded],
    ["templates", "Templates", null],
  ];

  return (
    <div>
      <header className="mb-6">
        <h1 className="h-page">Emails</h1>
        <p className="mt-1 text-muted">Emails go out from your Gmail ({fromEmail}). Nothing is sent until you press Send.</p>
      </header>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line">
        <div className="-mb-px flex gap-1 overflow-x-auto" role="tablist">
          {tabs.map(([k, l, n]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => {
                setTab(k);
                setActiveId(null);
              }}
              className={clsx(
                "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-3 pt-1 text-sm",
                tab === k ? "border-board font-medium text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {l}
              {n !== null && n > 0 && (
                <span className={clsx("num rounded-full px-1.5 text-xs", k === "ready" ? "bg-absent-soft text-absent" : "bg-paper text-muted")}>{n}</span>
              )}
            </button>
          ))}
        </div>
        {tab !== "templates" && (
          <div className="mb-2 flex gap-1 text-[13px]">
            {([null, "ABSENCE", "WARNING", "CUSTOM"] as (TemplateKind | null)[]).map((k) => (
              <button
                key={k ?? "all"}
                onClick={() => setKind(k)}
                className={clsx("rounded-md px-2.5 py-1", kind === k ? "bg-ink text-white" : "text-muted hover:bg-ink/[0.05] hover:text-ink")}
              >
                {k ? KIND_LABEL[k] : "All"}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "templates" ? (
        <Templates bootcampId={bootcampId} bootcampName={bootcampName} templates={templates} />
      ) : list.length === 0 ? (
        <Empty title={tab === "ready" ? "You're all caught up" : tab === "sent" ? "No emails sent yet" : "Nothing discarded"}>
          {tab === "ready"
            ? "When you upload attendance, an email is prepared here for each absent student. Warning emails you draft from the Students page also land here."
            : null}
        </Empty>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr]">
          <div className="min-w-0">
            {tab === "ready" && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-board"
                    checked={selected.size === list.length}
                    onChange={() => setSelected(selected.size === list.length ? new Set() : new Set(list.map((e) => e.id)))}
                  />
                  <span className="num">{selected.size} selected</span>
                </label>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" disabled={!selected.size || !!progress} onClick={() => discard(Array.from(selected))}>
                    Discard
                  </Button>
                  <Button size="sm" variant="primary" disabled={!selected.size || !!progress} onClick={() => sendIds(Array.from(selected))}>
                    <Send className="h-3.5 w-3.5" /> Send {selected.size || ""}
                  </Button>
                </div>
              </div>
            )}
            {progress && (
              <div className="mb-3 rounded-xl border border-line bg-surface px-4 py-3">
                <p className="num mb-2 text-sm">
                  Sending {progress.done} of {progress.total}...
                </p>
                <ProgressBar value={(progress.done / progress.total) * 100} />
              </div>
            )}
            <ul className="max-h-[68vh] divide-y divide-line overflow-auto rounded-xl border border-line bg-surface">
              {list.map((e) => (
                <li key={e.id} className={clsx("flex items-start gap-3 px-3 py-3", active?.id === e.id ? "bg-board-mist" : "hover:bg-paper/70")}>
                  {tab === "ready" && (
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-board"
                      checked={selected.has(e.id)}
                      disabled={e.status === "SENDING"}
                      onChange={() =>
                        setSelected((cur) => {
                          const n = new Set(cur);
                          if (n.has(e.id)) n.delete(e.id);
                          else n.add(e.id);
                          return n;
                        })
                      }
                      aria-label={`Select email to ${e.studentName ?? e.to}`}
                    />
                  )}
                  <button onClick={() => setActiveId(e.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium">{e.studentName ?? e.to}</p>
                      <span className="num shrink-0 text-xs text-faint">
                        {e.status === "SENT" && e.sentAt ? formatDayShort(e.sentAt.slice(0, 10)) : e.date ? formatDayShort(e.date) : formatDayShort(e.createdAt.slice(0, 10))}
                      </span>
                    </div>
                    <p className="truncate text-[13px] text-muted">{e.subject}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={clsx("rounded px-1.5 py-0.5 text-[11px] font-medium", e.kind === "WARNING" ? "bg-absent-soft text-absent" : "bg-paper text-ink-soft")}>
                        {KIND_LABEL[e.kind]}
                      </span>
                      {e.status === "FAILED" && <span className="text-[11px] font-medium text-absent">Didn&apos;t send</span>}
                      {e.status === "SENDING" && <span className="text-[11px] text-muted">Sending...</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {active && (
            <Editor
              key={active.id + active.status}
              bootcampId={bootcampId}
              email={active}
              busy={!!progress}
              onSend={() => sendIds([active.id])}
              onDiscard={() => discard([active.id])}
              onRestore={() => restore([active.id])}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Editor({
  bootcampId,
  email,
  busy,
  onSend,
  onDiscard,
  onRestore,
}: {
  bootcampId: string;
  email: Row;
  busy: boolean;
  onSend: () => void;
  onDiscard: () => void;
  onRestore: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [saving, start] = useTransition();
  const editable = email.status === "DRAFT" || email.status === "FAILED";
  const dirty = subject !== email.subject || body !== email.body;

  function save(after?: () => void) {
    start(async () => {
      const r = await updateDraft(bootcampId, email.id, subject, body);
      if (!r.ok) return toast({ tone: "error", text: r.error });
      if (!after) toast({ tone: "ok", text: "Changes saved." });
      router.refresh();
      after?.();
    });
  }

  return (
    <section className="panel flex min-h-[420px] flex-col" aria-label="Email">
      <div className="space-y-3 border-b border-line px-5 py-4">
        <p className="text-sm">
          <span className="text-muted">To </span>
          <span className="font-medium">{email.studentName}</span> <span className="text-muted">&lt;{email.to}&gt;</span>
        </p>
        {editable ? (
          <input className="field font-medium" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
        ) : (
          <p className="font-medium">{email.subject}</p>
        )}
      </div>
      {email.status === "FAILED" && email.error && <p className="mx-5 mt-4 rounded-lg bg-absent-soft px-3 py-2 text-[13px] text-absent">Last attempt failed: {email.error}</p>}
      <div className="flex-1 px-5 py-4">
        {editable ? (
          <textarea
            className="field min-h-[300px] resize-y text-[15px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Message"
          />
        ) : (
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-soft">{email.body}</div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
        {editable ? (
          <>
            <Button variant="ghost" size="sm" onClick={onDiscard} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" /> Discard
            </Button>
            <div className="flex gap-2">
              {dirty && (
                <Button size="sm" loading={saving} onClick={() => save()}>
                  Save changes
                </Button>
              )}
              <Button size="sm" variant="primary" disabled={busy || saving} onClick={() => (dirty ? save(onSend) : onSend())}>
                <Send className="h-3.5 w-3.5" /> Send this email
              </Button>
            </div>
          </>
        ) : email.status === "DISCARDED" ? (
          <Button size="sm" onClick={onRestore}>
            <RotateCcw className="h-3.5 w-3.5" /> Move back to Ready to send
          </Button>
        ) : (
          <p className="text-[13px] text-muted">{email.sentAt ? `Sent ${new Date(email.sentAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : "Sending..."}</p>
        )}
      </div>
    </section>
  );
}

function Templates({ bootcampId, bootcampName, templates }: { bootcampId: string; bootcampName: string; templates: Template[] }) {
  const router = useRouter();
  const toast = useToast();
  const [activeId, setActiveId] = useState<string | "new">(templates[0]?.id ?? "new");
  const active = activeId === "new" ? null : templates.find((t) => t.id === activeId) ?? null;
  const [name, setName] = useState(active?.name ?? "");
  const [subject, setSubject] = useState(active?.subject ?? "");
  const [body, setBody] = useState(active?.body ?? "");
  const [kind, setKind] = useState<TemplateKind>(active?.kind ?? "CUSTOM");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setName(active?.name ?? "");
    setSubject(active?.subject ?? "");
    setBody(active?.body ?? "");
    setKind(active?.kind ?? "CUSTOM");
    setError(null);
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  function insert(token: string) {
    const el = bodyRef.current;
    const text = `{{${token}}}`;
    if (!el) return setBody((b) => b + text);
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const next = body.slice(0, s) + text + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + text.length, s + text.length);
    });
  }

  const sample = (str: string) =>
    str
      .replace(/\{\{\s*firstName\s*\}\}/g, "Ayesha")
      .replace(/\{\{\s*studentName\s*\}\}/g, "Ayesha Khan")
      .replace(/\{\{\s*date\s*\}\}/g, "Monday, 26 October 2026")
      .replace(/\{\{\s*bootcamp\s*\}\}/g, bootcampName)
      .replace(/\{\{\s*absences\s*\}\}/g, "3 classes")
      .replace(/\{\{\s*taName\s*\}\}/g, "you")
      .replace(/\{\{\s*venue\s*\}\}/g, "the campus");

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <div>
        <ul className="space-y-1">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setActiveId(t.id)}
                className={clsx("w-full rounded-lg px-3 py-2 text-left", activeId === t.id ? "bg-surface shadow-[0_0_0_1px_#E3E7E4]" : "hover:bg-ink/[0.04]")}
              >
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted">{KIND_LABEL[t.kind]}</p>
              </button>
            </li>
          ))}
        </ul>
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setActiveId("new")}>
          New template
        </Button>
      </div>

      <form
        className="panel space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await saveTemplate(bootcampId, active?.id ?? null, kind, { name, subject, body });
            if (!r.ok) return setError(r.error);
            toast({ tone: "ok", text: "Template saved." });
            router.refresh();
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field label="Template name" htmlFor="tn">
            <input id="tn" className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Used for" htmlFor="tk">
            <select id="tk" className="field" value={kind} disabled={!!active} onChange={(e) => setKind(e.target.value as TemplateKind)}>
              <option value="ABSENCE">Missed class</option>
              <option value="WARNING">Warning</option>
              <option value="CUSTOM">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Subject" htmlFor="ts">
          <input id="ts" className="field" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <div>
          <label className="label" htmlFor="tb">
            Message
          </label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map((p) => (
              <button key={p.key} type="button" onClick={() => insert(p.key)} className="rounded-md border border-line-strong bg-paper px-2 py-1 text-xs text-ink-soft hover:border-board hover:text-board">
                {p.label}
              </button>
            ))}
          </div>
          <textarea id="tb" ref={bodyRef} className="field min-h-[260px] font-[inherit]" value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="hint">Click a field above to insert it. It&apos;s filled in for each student when the email is prepared.</p>
        </div>
        <details className="rounded-lg bg-paper px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Preview with a sample student</summary>
          <p className="mt-3 text-sm font-medium">{sample(subject)}</p>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{sample(body)}</div>
        </details>
        {error && <p className="text-sm text-absent">{error}</p>}
        <div className="flex justify-between gap-2">
          {active ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                start(async () => {
                  const r = await deleteTemplate(bootcampId, active.id);
                  if (!r.ok) return toast({ tone: "error", text: r.error });
                  setActiveId(templates.find((t) => t.id !== active.id)?.id ?? "new");
                  router.refresh();
                })
              }
            >
              Delete template
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" loading={pending}>
            Save template
          </Button>
        </div>
      </form>
    </div>
  );
}
