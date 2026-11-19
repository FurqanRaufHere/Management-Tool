"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { clsx } from "clsx";
import type { AttendanceStatus } from "@/db/schema";
import { setMark } from "@/app/actions/attendance";
import { STATUS_META, useToast } from "@/components/ui";
import { formatDayLong } from "@/lib/dates";

const ORDER: AttendanceStatus[] = ["PRESENT", "LATE", "LEAVE", "ABSENT"];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function AttendanceGrid({
  bootcampId,
  students,
  dates,
  marks,
  today,
}: {
  bootcampId: string;
  students: { id: string; name: string; rollNo: string | null }[];
  dates: string[];
  marks: Record<string, Record<string, AttendanceStatus>>;
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const scroller = useRef<HTMLDivElement>(null);
  const [local, setLocal] = useState(marks);
  const [open, setOpen] = useState<{ studentId: string; date: string } | null>(null);
  const [, start] = useTransition();

  useEffect(() => setLocal(marks), [marks]);
  useEffect(() => {
    // Most recent classes are on the right; start scrolled there.
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);

  function change(studentId: string, date: string, status: AttendanceStatus | null) {
    const prev = local[studentId]?.[date];
    setLocal((cur) => {
      const n = { ...cur, [studentId]: { ...(cur[studentId] ?? {}) } };
      if (status) n[studentId][date] = status;
      else delete n[studentId][date];
      return n;
    });
    setOpen(null);
    start(async () => {
      const r = await setMark(bootcampId, date, studentId, status);
      if (!r.ok) {
        toast({ tone: "error", text: r.error });
        setLocal((cur) => ({ ...cur, [studentId]: { ...(cur[studentId] ?? {}), ...(prev ? { [date]: prev } : {}) } }));
        return;
      }
      if (status === "ABSENT" && prev !== "ABSENT") toast({ tone: "ok", text: "Marked absent. A follow-up email is ready in Emails." });
      router.refresh();
    });
  }

  const dayTotals = dates.map((d) => {
    let p = 0;
    let n = 0;
    for (const s of students) {
      const m = local[s.id]?.[d];
      if (!m) continue;
      if (m !== "LEAVE") n++;
      if (m === "PRESENT" || m === "LATE") p++;
    }
    return n ? Math.round((p / n) * 100) : null;
  });

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line px-4 py-3 text-[12px] text-muted">
        {ORDER.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={clsx("h-3 w-3 rounded-[4px]", STATUS_META[s].dot)} />
            {STATUS_META[s].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px] border border-dashed border-line-strong" /> Not marked
        </span>
      </div>
      <div ref={scroller} className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-[2] min-w-[200px] border-b border-r border-line bg-surface px-4 py-2 text-left text-[13px] font-medium text-muted">Student</th>
              {dates.map((d) => {
                const dt = new Date(`${d}T12:00:00Z`);
                return (
                  <th key={d} className={clsx("border-b border-line px-1 py-2 text-center font-normal", d === today && "bg-chalk/25")} title={formatDayLong(d)}>
                    <span className="block text-[10px] text-faint">{DOW[dt.getUTCDay()]}</span>
                    <span className="num block text-[12px] text-ink-soft">{dt.getUTCDate()}</span>
                    <span className="block text-[10px] text-faint">{dt.toLocaleString("en", { month: "short", timeZone: "UTC" })}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {students.map((s, rowIdx) => (
              <tr key={s.id} className="group">
                <td className="sticky left-0 z-[1] max-w-[240px] truncate border-r border-line bg-surface px-4 py-1.5 group-hover:bg-board-mist">{s.name}</td>
                {dates.map((d) => {
                  const m = local[s.id]?.[d];
                  const isOpen = open?.studentId === s.id && open.date === d;
                  return (
                    <td key={d} className={clsx("relative px-1 py-1 text-center group-hover:bg-board-mist", d === today && "bg-chalk/10")}>
                      <button
                        onClick={() => setOpen(isOpen ? null : { studentId: s.id, date: d })}
                        className={clsx(
                          "h-6 w-6 rounded-[6px] transition-transform hover:scale-110",
                          m ? STATUS_META[m].dot : "border border-dashed border-line-strong bg-transparent",
                          m === "LATE" && "opacity-70",
                        )}
                        aria-label={`${s.name}, ${formatDayLong(d)}: ${m ? STATUS_META[m].label : "not marked"}. Change`}
                      />
                      {isOpen && (
                        <div className={clsx("absolute left-1/2 z-20 w-40 -translate-x-1/2 animate-rise", rowIdx >= students.length - 3 && rowIdx > 2 ? "bottom-full mb-1" : "top-full mt-1")}><div className=" rounded-xl border border-line bg-surface p-1.5 text-left shadow-lift">
                          {ORDER.map((st) => (
                            <button
                              key={st}
                              onClick={() => change(s.id, d, st)}
                              className={clsx("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] hover:bg-paper", m === st && "font-semibold")}
                            >
                              <span className={clsx("h-2.5 w-2.5 rounded-[3px]", STATUS_META[st].dot)} />
                              {STATUS_META[st].label}
                            </button>
                          ))}
                          {m && (
                            <button onClick={() => change(s.id, d, null)} className="mt-1 w-full rounded-lg border-t border-line px-2.5 py-1.5 text-left text-[13px] text-muted hover:bg-paper">
                              Clear mark
                            </button>
                          )}
                        </div></div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 z-[1] border-r border-t border-line bg-paper px-4 py-2 text-[13px] text-muted">Attendance</td>
              {dayTotals.map((t, i) => (
                <td key={dates[i]} className={clsx("num border-t border-line bg-paper px-1 py-2 text-center text-[11px]", t !== null && t < 70 ? "text-absent" : "text-ink-soft")}>
                  {t === null ? "" : `${t}%`}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
