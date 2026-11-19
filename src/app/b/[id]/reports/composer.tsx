"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { clsx } from "clsx";
import { Send } from "lucide-react";
import { sendReport } from "@/app/actions/report";
import { reportHtml, reportText, type ReportInput } from "@/lib/report";
import { formatDayLong, formatDayShort } from "@/lib/dates";
import { Button, Field, useToast } from "@/components/ui";

type Serialized = Omit<ReportInput, "startedAt" | "endedAt"> & { startedAt: string | null; endedAt: string | null };

export function ReportComposer({
  bootcampId,
  date,
  today,
  hasSession,
  dates,
  sentDates,
  input,
  to: initialTo,
  supervisorName,
  cc: initialCc,
  history,
}: {
  bootcampId: string;
  date: string;
  today: string;
  hasSession: boolean;
  dates: string[];
  sentDates: string[];
  input: Serialized;
  to: string;
  supervisorName: string;
  cc: string[];
  history: { id: string; date: string; to: string; createdAt: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [notes, setNotes] = useState(input.notes);
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState(initialCc.join(", "));
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const full: ReportInput = useMemo(
    () => ({
      ...input,
      notes,
      startedAt: input.startedAt ? new Date(input.startedAt) : null,
      endedAt: input.endedAt ? new Date(input.endedAt) : null,
    }),
    [input, notes],
  );
  const html = useMemo(() => reportHtml(full), [full]);

  const warnings: string[] = [];
  if (!input.startedAt) warnings.push("Start time isn't logged.");
  if (!input.endedAt) warnings.push("End time isn't logged.");
  if (input.counts.total - input.counts.unmarked === 0) warnings.push("No attendance uploaded for this day.");
  if (input.media.photos + input.media.videos + input.media.endSnapshots === 0) warnings.push("No photos or videos uploaded.");
  const alreadySent = sentDates.includes(date);

  function send() {
    setConfirming(false);
    start(async () => {
      const r = await sendReport(bootcampId, date, {
        to,
        cc: cc
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        notes,
      });
      if (!r.ok) return toast({ tone: "error", text: r.error });
      toast({ tone: "ok", text: `Report sent to ${to}.` });
      router.refresh();
    });
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-page">Daily report</h1>
          <p className="mt-1 text-muted">Check the summary, add a note if needed, and send it to {supervisorName || "your supervisor"}.</p>
        </div>
        <div className="w-full sm:w-64">
          <label className="label" htmlFor="rd">
            Class day
          </label>
          <select id="rd" className="field" value={date} onChange={(e) => router.push(`/b/${bootcampId}/reports?date=${e.target.value}`)}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {d === today ? "Today, " : ""}
                {formatDayLong(d)}
                {sentDates.includes(d) ? " (sent)" : ""}
              </option>
            ))}
          </select>
        </div>
      </header>

      {!hasSession ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
          <p className="font-medium">Nothing recorded for {formatDayLong(date)} yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">Start the class or upload attendance first, then come back to send the report.</p>
          <div className="mt-5">
            <Button href={`/b/${bootcampId}`}>Go to Today</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="overflow-hidden rounded-xl border border-line bg-[#f2f4f1]">
            <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 text-[13px] text-muted">
              <span>Preview of the email</span>
              <button
                className="hover:text-ink"
                onClick={() => {
                  navigator.clipboard.writeText(reportText(full)).then(() => toast({ tone: "ok", text: "Report copied as text." }));
                }}
              >
                Copy as text
              </button>
            </div>
            <iframe title="Report preview" srcDoc={html} className="h-[720px] w-full" sandbox="" />
          </div>

          <div className="space-y-5">
            {warnings.length > 0 && (
              <div className="rounded-xl border border-leave/25 bg-leave-soft/70 px-4 py-3">
                <p className="text-sm font-medium text-leave">Before you send</p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px] text-ink-soft">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <Link href={`/b/${bootcampId}`} className="mt-2 inline-block text-[13px] text-board hover:underline">
                  Fix on the Today page
                </Link>
              </div>
            )}
            <Field label="Notes for your supervisor" htmlFor="rn" hint="Optional. Anything worth flagging: lab issues, students who left early, a room change.">
              <textarea id="rn" rows={5} className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Lab ran 15 minutes over because the Wi-Fi was down." />
            </Field>
            <Field label="Send to" htmlFor="rt">
              <input id="rt" type="email" className="field" value={to} onChange={(e) => setTo(e.target.value)} placeholder="supervisor@atomcamp.com" />
            </Field>
            <Field label="Copy to" htmlFor="rc" hint="Separate addresses with commas.">
              <input id="rc" className="field" value={cc} onChange={(e) => setCc(e.target.value)} />
            </Field>
            {confirming ? (
              <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
                <p className="text-sm">{alreadySent ? "You already sent this day's report. Send an updated copy?" : `Send the report for ${formatDayShort(date)} to ${to}?`}</p>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={send}>
                    Yes, send it
                  </Button>
                  <Button size="sm" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="primary" size="lg" className="w-full" disabled={!to} loading={pending} onClick={() => setConfirming(true)}>
                <Send className="h-4 w-4" /> {alreadySent ? "Send updated report" : "Send report"}
              </Button>
            )}

            {history.length > 0 && (
              <div className="pt-4">
                <p className="mb-2 text-sm font-medium">Sent reports</p>
                <ul className="space-y-1.5">
                  {history.slice(0, 10).map((h) => (
                    <li key={h.id} className="flex justify-between gap-3 text-[13px]">
                      <Link href={`/b/${bootcampId}/reports?date=${h.date}`} className={clsx("hover:text-board", h.date === date ? "font-medium text-ink" : "text-ink-soft")}>
                        {formatDayShort(h.date)}
                      </Link>
                      <span className="num truncate text-muted">
                        {new Date(h.createdAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })} to {h.to}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
