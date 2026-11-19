"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { clsx } from "clsx";
import { ArrowLeft } from "lucide-react";
import type { AttendanceStatus } from "@/db/schema";
import { readUploadedSheet } from "@/app/actions/students";
import { saveAttendance } from "@/app/actions/attendance";
import { guessAttendanceMapping, matchAttendance, type AttendanceMapping, type StudentRef } from "@/lib/mapping";
import type { Sheet } from "@/lib/sheet-utils";
import { formatDayLong } from "@/lib/dates";
import { Button, Field, STATUS_META, useToast } from "@/components/ui";
import { ColumnSelect, FileDrop } from "@/components/file-drop";

type Missing = "ABSENT" | "SKIP";
const CHOICES: AttendanceStatus[] = ["PRESENT", "LATE", "LEAVE", "ABSENT"];
// Exceptions first, so the TA sees absences and gaps without scrolling past 30 present students.
const RANK: Record<string, number> = { ABSENT: 0, null: 1, LEAVE: 2, LATE: 3, PRESENT: 4 };

export function UploadFlow({
  bootcampId,
  roster,
  initialDate,
  today,
  manual,
  alreadyUploaded,
}: {
  bootcampId: string;
  roster: StudentRef[];
  initialDate: string;
  today: string;
  manual: Record<string, string>;
  alreadyUploaded: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(initialDate);
  const [sheet, setSheet] = useState<(Sheet & { fileName: string }) | null>(null);
  const [map, setMap] = useState<AttendanceMapping | null>(null);
  const [missing, setMissing] = useState<Missing>("ABSENT");
  const [blankAs, setBlankAs] = useState<AttendanceStatus>("ABSENT");
  const [overrides, setOverrides] = useState<Record<string, AttendanceStatus>>({});
  const [keepManual, setKeepManual] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reading, startRead] = useTransition();
  const [saving, startSave] = useTransition();

  const matched = useMemo(() => (sheet && map ? matchAttendance(sheet, map, roster) : []), [sheet, map, roster]);

  // One status per roster student: override > sheet > "not in sheet" rule.
  const plan = useMemo(() => {
    const fromSheet = new Map<string, AttendanceStatus>();
    const noStatusColumn = map?.status === null;
    for (const m of matched) if (m.studentId && !fromSheet.has(m.studentId)) fromSheet.set(m.studentId, m.status ?? (noStatusColumn ? "PRESENT" : blankAs));
    return roster.map((s) => {
      const sheetStatus = fromSheet.get(s.id) ?? null;
      const base: AttendanceStatus | null = sheetStatus ?? (missing === "ABSENT" ? "ABSENT" : null);
      const manualStatus = keepManual ? (manual[s.id] as AttendanceStatus | undefined) : undefined;
      const status = overrides[s.id] ?? manualStatus ?? base;
      return { student: s, inSheet: sheetStatus !== null, status, base: manualStatus ?? base, manualKept: !overrides[s.id] && !!manualStatus };
    }).sort((a, b) => RANK[String(a.base)] - RANK[String(b.base)] || a.student.name.localeCompare(b.student.name));
  }, [matched, roster, missing, blankAs, overrides, manual, keepManual, map]);

  const unmatched = matched.filter((m) => !m.studentId && (m.raw.name || m.raw.email || m.raw.rollNo));
  const counts = CHOICES.reduce<Record<string, number>>((acc, c) => ((acc[c] = plan.filter((p) => p.status === c).length), acc), {});
  const toSave = plan.filter((p) => p.status !== null);
  const blankStatuses = map?.status === null ? 0 : matched.filter((m) => m.studentId && m.status === null).length;
  const canMatch = map && (map.email !== null || map.rollNo !== null || map.name !== null);

  function onFile(files: File[]) {
    setError(null);
    const fd = new FormData();
    fd.set("file", files[0]);
    startRead(async () => {
      const r = await readUploadedSheet(bootcampId, fd);
      if (!r.ok) return setError(r.error);
      setSheet(r.data);
      setMap(guessAttendanceMapping(r.data));
      setOverrides({});
    });
  }

  function save() {
    setError(null);
    startSave(async () => {
      const r = await saveAttendance({
        bootcampId,
        date,
        fileName: sheet?.fileName ?? "upload",
        marks: toSave.map((p) => ({ studentId: p.student.id, status: p.status! })),
        overwriteManual: !keepManual,
      });
      if (!r.ok) return setError(r.error);
      const d = r.data;
      toast({
        tone: "ok",
        text: `Saved ${d.saved} marks.${d.drafted ? ` ${d.drafted} follow-up ${d.drafted === 1 ? "email is" : "emails are"} ready to review.` : ""}`,
      });
      router.push(d.drafted ? `/b/${bootcampId}/emails` : `/b/${bootcampId}`);
      router.refresh();
    });
  }

  return (
    <div>
      <Link href={`/b/${bootcampId}/attendance`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Attendance
      </Link>
      <h1 className="h-page">Upload attendance</h1>
      <p className="mt-1 max-w-2xl text-muted">Nothing is saved until you confirm. You&apos;ll see who matched, and you can mark leave before saving.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[300px_1fr]">
        <div className="space-y-5">
          <Field label="Class date" htmlFor="date" hint={formatDayLong(date)}>
            <input id="date" type="date" className="field" max={today} value={date} onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setDate(v);
                router.replace(`/b/${bootcampId}/attendance/upload?date=${v}`, { scroll: false });
              }} />
          </Field>
          {alreadyUploaded && (
            <p className="rounded-lg bg-leave-soft px-3 py-2.5 text-[13px] text-leave">
              You already uploaded {alreadyUploaded} for this day. Uploading again updates the marks.
            </p>
          )}
          {sheet ? (
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="truncate text-sm font-medium" title={sheet.fileName}>
                {sheet.fileName}
              </p>
              <p className="text-[13px] text-muted">{sheet.rows.length} rows</p>
              <Button size="sm" className="mt-3" onClick={() => setSheet(null)}>
                Use a different file
              </Button>
            </div>
          ) : (
            <FileDrop accept=".xlsx,.csv" onFiles={onFile} disabled={reading} compact title={reading ? "Reading..." : "Choose the LMS sheet"} hint=".xlsx or .csv" />
          )}
          {sheet && map && (
            <div className="space-y-4">
              <p className="text-sm font-medium">Columns in this file</p>
              <ColumnSelect label="Email" value={map.email} headers={sheet.headers} onChange={(v) => setMap({ ...map, email: v })} />
              <ColumnSelect label="Roll or LMS ID" value={map.rollNo} headers={sheet.headers} onChange={(v) => setMap({ ...map, rollNo: v })} />
              <ColumnSelect label="Name" value={map.name} headers={sheet.headers} onChange={(v) => setMap({ ...map, name: v })} />
              <ColumnSelect
                label="Attendance status"
                value={map.status}
                headers={sheet.headers}
                onChange={(v) => setMap({ ...map, status: v })}
                hint={map.status === null ? "No status column: everyone listed counts as present." : undefined}
              />
              {map.status !== null && (
              <div>
                <label className="label">Students listed with no status</label>
                <select className="field" value={blankAs} onChange={(e) => setBlankAs(e.target.value as AttendanceStatus)}>
                  <option value="ABSENT">Count as absent</option>
                  <option value="PRESENT">Count as present</option>
                </select>
              </div>
              )}
              <div>
                <label className="label">Students missing from the file</label>
                <select className="field" value={missing} onChange={(e) => setMissing(e.target.value as Missing)}>
                  <option value="ABSENT">Mark absent</option>
                  <option value="SKIP">Leave unmarked</option>
                </select>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-absent">{error}</p>}
        </div>

        <div>
          {!sheet || !map ? (
            <div className="flex h-full min-h-[280px] items-center justify-center rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
              Choose a file to see who matched.
            </div>
          ) : !canMatch ? (
            <p className="rounded-xl bg-leave-soft p-5 text-sm text-leave">Pick at least one of email, roll number or name so rows can be matched to students.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                {CHOICES.map((c) => (
                  <span key={c} className={clsx("num rounded-lg px-3 py-1.5 text-sm font-medium", STATUS_META[c].cls)}>
                    {counts[c]} {STATUS_META[c].label.toLowerCase()}
                  </span>
                ))}
                {plan.some((p) => p.status === null) && (
                  <span className="num rounded-lg bg-paper px-3 py-1.5 text-sm text-muted">{plan.filter((p) => p.status === null).length} unmarked</span>
                )}
              </div>

              {(unmatched.length > 0 || blankStatuses > 0 || Object.keys(manual).length > 0) && (
                <div className="space-y-2">
                  {unmatched.length > 0 && (
                    <details className="rounded-xl border border-leave/25 bg-leave-soft/60 px-4 py-3 text-sm">
                      <summary className="cursor-pointer font-medium text-leave">
                        {unmatched.length} {unmatched.length === 1 ? "row" : "rows"} in the file didn&apos;t match a student
                      </summary>
                      <ul className="mt-2 space-y-1 text-ink-soft">
                        {unmatched.slice(0, 30).map((u) => (
                          <li key={u.rowIndex}>
                            Row {u.rowIndex + 2}: {[u.raw.name, u.raw.email, u.raw.rollNo].filter(Boolean).join(", ")}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[13px] text-muted">Add them on the Students page if they&apos;re new, then upload again.</p>
                    </details>
                  )}
                  {Object.keys(manual).length > 0 && (
                    <label className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-board" checked={keepManual} onChange={(e) => setKeepManual(e.target.checked)} />
                      <span>
                        Keep the {Object.keys(manual).length} marks set by hand for this day (such as approved leave)
                      </span>
                    </label>
                  )}
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="max-h-[60vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-[1] bg-surface">
                      <tr className="border-b border-line text-left text-[13px] text-muted">
                        <th className="px-4 py-2.5 font-medium">Student</th>
                        <th className="px-4 py-2.5 font-medium">Mark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {plan.map((p) => (
                        <tr key={p.student.id} className={clsx(!p.inSheet && "bg-paper/60")}>
                          <td className="px-4 py-2">
                            <p className="font-medium">{p.student.name}</p>
                            <p className="text-[12px] text-muted">
                              {!p.inSheet ? "Not in the file" : p.manualKept ? "Kept your earlier change" : overrides[p.student.id] ? "Changed by you" : "From the file"}
                            </p>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Mark for ${p.student.name}`}>
                              {CHOICES.map((c) => (
                                <button
                                  key={c}
                                  role="radio"
                                  aria-checked={p.status === c}
                                  onClick={() => setOverrides((o) => ({ ...o, [p.student.id]: c }))}
                                  className={clsx(
                                    "h-7 rounded-md px-2.5 text-[12px] font-medium transition-colors",
                                    p.status === c ? STATUS_META[c].cls + " ring-1 ring-inset ring-current/20" : "text-faint hover:bg-paper hover:text-ink-soft",
                                  )}
                                >
                                  {STATUS_META[c].label}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-muted">
                  {counts.ABSENT > 0 ? `A follow-up email will be prepared for each absent student. You'll review them before anything is sent.` : "No follow-up emails needed."}
                </p>
                <Button variant="primary" size="lg" loading={saving} disabled={toSave.length === 0} onClick={save}>
                  Save attendance for {formatDayLong(date).split(",")[0]}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
