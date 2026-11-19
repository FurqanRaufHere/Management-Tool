"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { clsx } from "clsx";
import { Plus, Search, Upload } from "lucide-react";
import type { StudentStat } from "@/lib/queries";
import { importStudents, readUploadedSheet, saveStudent, setStudentsActive } from "@/app/actions/students";
import { draftForStudents } from "@/app/actions/emails";
import { extractStudents, guessStudentMapping, type StudentMapping } from "@/lib/mapping";
import type { Sheet } from "@/lib/sheet-utils";
import { formatDayShort } from "@/lib/dates";
import { Button, Dialog, Empty, Field, useToast } from "@/components/ui";
import { ColumnSelect, FileDrop } from "@/components/file-drop";

type Filter = "all" | "watch" | "withdrawn";

export function StudentsView({
  bootcampId,
  students,
  threshold,
  warnId,
  welcome,
}: {
  bootcampId: string;
  students: StudentStat[];
  threshold: number;
  warnId: string | null;
  welcome: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set(warnId ? [warnId] : []));
  const [importing, setImporting] = useState(welcome && students.length === 0);
  const [editing, setEditing] = useState<StudentStat | "new" | null>(null);
  const [pending, start] = useTransition();

  const needsWarning = (s: StudentStat) => s.active && (s.absent >= threshold || s.streak >= 2);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return students.filter((s) => {
      if (filter === "withdrawn" ? s.active : !s.active) return false;
      if (filter === "watch" && !needsWarning(s)) return false;
      if (!term) return true;
      return [s.name, s.email, s.phone, s.rollNo].some((v) => v?.toLowerCase().includes(term));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, q, filter, threshold]);

  useEffect(() => {
    if (warnId) document.getElementById(`s-${warnId}`)?.scrollIntoView({ block: "center" });
  }, [warnId]);

  const allShownSelected = shown.length > 0 && shown.every((s) => selected.has(s.id));
  const toggle = (id: string) =>
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function warn() {
    start(async () => {
      const r = await draftForStudents(bootcampId, Array.from(selected), "WARNING");
      if (!r.ok) return toast({ tone: "error", text: r.error });
      toast({ tone: "ok", text: `${r.data.drafted} warning ${r.data.drafted === 1 ? "email is" : "emails are"} ready to check.` });
      router.push(`/b/${bootcampId}/emails?kind=WARNING`);
    });
  }

  function setActive(active: boolean) {
    start(async () => {
      const r = await setStudentsActive(bootcampId, Array.from(selected), active);
      if (!r.ok) return toast({ tone: "error", text: r.error });
      toast({ tone: "ok", text: active ? "Students restored." : "Students marked as withdrawn." });
      setSelected(new Set());
      router.refresh();
    });
  }

  const watchCount = students.filter(needsWarning).length;
  const withdrawnCount = students.filter((s) => !s.active).length;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-page">Students</h1>
          <p className="mt-1 text-muted">
            {students.filter((s) => s.active).length} enrolled{withdrawnCount ? `, ${withdrawnCount} withdrawn` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add student
          </Button>
          <Button variant="primary" onClick={() => setImporting(true)}>
            <Upload className="h-4 w-4" /> Import from Excel
          </Button>
        </div>
      </header>

      {students.length === 0 ? (
        <Empty title="No students yet" action={<Button variant="primary" onClick={() => setImporting(true)}>Import from Excel</Button>}>
          Upload the sheet with your students&apos; names, emails and phone numbers. You can add more later.
        </Empty>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input className="field pl-9" placeholder="Search by name, email, phone or roll number" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex rounded-lg border border-line-strong bg-surface p-0.5 text-sm" role="tablist">
              {(
                [
                  ["all", "Enrolled"],
                  ["watch", `Need a warning${watchCount ? ` (${watchCount})` : ""}`],
                  ["withdrawn", "Withdrawn"],
                ] as [Filter, string][]
              ).map(([k, l]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={filter === k}
                  onClick={() => setFilter(k)}
                  className={clsx("rounded-md px-3 py-1.5", filter === k ? "bg-ink text-white" : "text-ink-soft hover:text-ink")}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {selected.size > 0 && (
            <div className="sticky top-16 z-10 mb-3 flex animate-rise flex-wrap items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-sm text-white lg:top-3">
              <span className="num">{selected.size} selected</span>
              <span className="flex-1" />
              {filter !== "withdrawn" && (
                <>
                  <button onClick={warn} disabled={pending} className="rounded-md bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20">
                    Draft warning email
                  </button>
                  <button onClick={() => setActive(false)} disabled={pending} className="rounded-md px-3 py-1.5 text-white/80 hover:bg-white/10">
                    Mark withdrawn
                  </button>
                </>
              )}
              {filter === "withdrawn" && (
                <button onClick={() => setActive(true)} disabled={pending} className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/20">
                  Restore
                </button>
              )}
              <button onClick={() => setSelected(new Set())} className="rounded-md px-2 py-1.5 text-white/70 hover:text-white">
                Clear
              </button>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[13px] text-muted">
                  <th className="w-10 py-3 pl-4">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-board"
                      checked={allShownSelected}
                      onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((s) => s.id)))}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="py-3 pr-4 font-medium">Student</th>
                  <th className="py-3 pr-4 font-medium">Phone</th>
                  <th className="py-3 pr-4 font-medium">Attendance</th>
                  <th className="py-3 pr-4 text-right font-medium">Absent</th>
                  <th className="py-3 pr-4 text-right font-medium">Leave</th>
                  <th className="py-3 pr-4 font-medium">Last absent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((s) => (
                  <tr
                    key={s.id}
                    id={`s-${s.id}`}
                    className={clsx("group cursor-pointer hover:bg-board-mist/70", selected.has(s.id) && "bg-board-mist", s.id === warnId && "outline outline-2 -outline-offset-2 outline-absent/40")}
                    onClick={() => setEditing(s)}
                  >
                    <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="h-4 w-4 accent-board" checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Select ${s.name}`} />
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-ink">
                        {s.name}
                        {s.rollNo && <span className="ml-2 text-xs font-normal text-faint">{s.rollNo}</span>}
                      </p>
                      <p className={clsx("text-[13px]", s.email ? "text-muted" : "text-absent")}>{s.email ?? "No email on file"}</p>
                    </td>
                    <td className="num py-3 pr-4 text-ink-soft">{s.phone ?? <span className="text-faint">None</span>}</td>
                    <td className="py-3 pr-4">
                      {s.rate === null ? (
                        <span className="text-faint">No classes yet</span>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
                            <div className={clsx("h-full rounded-full", s.rate >= 80 ? "bg-board" : s.rate >= 60 ? "bg-leave" : "bg-absent")} style={{ width: `${s.rate}%` }} />
                          </div>
                          <span className="num text-ink-soft">{s.rate}%</span>
                        </div>
                      )}
                    </td>
                    <td className={clsx("num py-3 pr-4 text-right", s.absent >= threshold ? "font-semibold text-absent" : "text-ink-soft")}>{s.absent}</td>
                    <td className="num py-3 pr-4 text-right text-ink-soft">{s.leave}</td>
                    <td className="num py-3 pr-4 text-ink-soft">
                      {s.lastAbsent ? formatDayShort(s.lastAbsent) : <span className="text-faint">Never</span>}
                      {s.streak >= 2 && <span className="ml-2 rounded bg-absent-soft px-1.5 py-0.5 text-xs text-absent">{s.streak} in a row</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">No students match.</p>}
          </div>
        </>
      )}

      <ImportDialog open={importing} onClose={() => setImporting(false)} bootcampId={bootcampId} />
      <StudentDialog bootcampId={bootcampId} student={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function StudentDialog({ bootcampId, student, onClose }: { bootcampId: string; student: StudentStat | "new" | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const s = student === "new" ? null : student;
  const [v, setV] = useState({ name: "", email: "", phone: "", rollNo: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    setV({ name: s?.name ?? "", email: s?.email ?? "", phone: s?.phone ?? "", rollNo: s?.rollNo ?? "" });
    setError(null);
  }, [student, s]);
  return (
    <Dialog open={student !== null} onClose={onClose} title={s ? s.name : "Add a student"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveStudent(bootcampId, s?.id ?? null, {
              name: v.name,
              email: v.email.trim() || null,
              phone: v.phone.trim() || null,
              rollNo: v.rollNo.trim() || null,
            });
            if (!r.ok) return setError(r.error);
            toast({ tone: "ok", text: s ? "Student updated." : "Student added." });
            onClose();
            router.refresh();
          });
        }}
      >
        <Field label="Full name" htmlFor="sn">
          <input id="sn" className="field" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required />
        </Field>
        <Field label="Email" htmlFor="se" hint="Follow-up and warning emails go here.">
          <input id="se" type="email" className="field" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone" htmlFor="sp">
            <input id="sp" className="field" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          </Field>
          <Field label="Roll or LMS ID" htmlFor="sr">
            <input id="sr" className="field" value={v.rollNo} onChange={(e) => setV({ ...v, rollNo: e.target.value })} />
          </Field>
        </div>
        {s && s.rate !== null && (
          <p className="rounded-lg bg-paper px-4 py-3 text-sm text-ink-soft">
            Attended {s.present + s.late} classes, absent {s.absent}, on leave {s.leave}.
          </p>
        )}
        {error && <p className="text-sm text-absent">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            {s ? "Save" : "Add student"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ImportDialog({ open, onClose, bootcampId }: { open: boolean; onClose: () => void; bootcampId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [sheet, setSheet] = useState<(Sheet & { fileName: string }) | null>(null);
  const [map, setMap] = useState<StudentMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) {
      setSheet(null);
      setMap(null);
      setError(null);
    }
  }, [open]);

  const result = useMemo(() => (sheet && map ? extractStudents(sheet, map) : null), [sheet, map]);
  const noEmail = result?.students.filter((s) => !s.email).length ?? 0;

  function onFile(files: File[]) {
    setError(null);
    const fd = new FormData();
    fd.set("file", files[0]);
    start(async () => {
      const r = await readUploadedSheet(bootcampId, fd);
      if (!r.ok) return setError(r.error);
      setSheet(r.data);
      setMap(guessStudentMapping(r.data));
    });
  }

  function commit() {
    if (!result) return;
    start(async () => {
      const r = await importStudents(bootcampId, result.students);
      if (!r.ok) return setError(r.error);
      toast({ tone: "ok", text: `Added ${r.data.added} students${r.data.updated ? ` and updated ${r.data.updated}` : ""}.` });
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={onClose} wide title="Import students" description="Upload an .xlsx or .csv file with one row per student.">
      {!sheet ? (
        <div className="space-y-4">
          <FileDrop accept=".xlsx,.csv" onFiles={onFile} disabled={pending} title={pending ? "Reading the file..." : "Drop the student sheet here, or click to choose"} hint="Name and email are needed. Phone and roll number help too." />
          {error && <p className="text-sm text-absent">{error}</p>}
        </div>
      ) : (
        map && (
          <div className="space-y-6">
            <div>
              <p className="mb-3 text-sm text-muted">
                We matched the columns in <span className="font-medium text-ink">{sheet.fileName}</span>. Fix any that look wrong.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <ColumnSelect label="Full name" value={map.name} headers={sheet.headers} onChange={(v) => setMap({ ...map, name: v })} hint={map.name === null && map.firstName !== null ? "Built from first and last name" : undefined} />
                <ColumnSelect label="Email" value={map.email} headers={sheet.headers} onChange={(v) => setMap({ ...map, email: v })} required />
                <ColumnSelect label="Phone" value={map.phone} headers={sheet.headers} onChange={(v) => setMap({ ...map, phone: v })} />
                <ColumnSelect label="Roll or LMS ID" value={map.rollNo} headers={sheet.headers} onChange={(v) => setMap({ ...map, rollNo: v })} />
                {map.name === null && (
                  <>
                    <ColumnSelect label="First name" value={map.firstName} headers={sheet.headers} onChange={(v) => setMap({ ...map, firstName: v })} />
                    <ColumnSelect label="Last name" value={map.lastName} headers={sheet.headers} onChange={(v) => setMap({ ...map, lastName: v })} />
                  </>
                )}
              </div>
            </div>

            {result && (
              <div>
                <p className="mb-2 text-sm font-medium">
                  {result.students.length} students found
                  {noEmail > 0 && <span className="font-normal text-leave">, {noEmail} without a valid email</span>}
                </p>
                <div className="max-h-64 overflow-auto rounded-lg border border-line">
                  <table className="w-full text-[13px]">
                    <thead className="sticky top-0 bg-paper text-left text-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Phone</th>
                        <th className="px-3 py-2 font-medium">Roll</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {result.students.slice(0, 200).map((s, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5">{s.name}</td>
                          <td className={clsx("px-3 py-1.5", !s.email && "text-absent")}>{s.email ?? "Missing"}</td>
                          <td className="num px-3 py-1.5 text-ink-soft">{s.phone}</td>
                          <td className="px-3 py-1.5 text-ink-soft">{s.rollNo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="hint">Importing the same sheet again updates students instead of adding them twice.</p>
              </div>
            )}

            {error && <p className="text-sm text-absent">{error}</p>}
            <div className="flex justify-between gap-2">
              <Button onClick={() => setSheet(null)}>Choose another file</Button>
              <Button variant="primary" loading={pending} disabled={!result?.students.length} onClick={commit}>
                Import {result?.students.length ?? 0} students
              </Button>
            </div>
          </div>
        )
      )}
    </Dialog>
  );
}
