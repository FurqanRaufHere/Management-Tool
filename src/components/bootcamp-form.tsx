"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { createBootcamp, updateBootcamp } from "@/app/actions/bootcamp";
import { Button, Field, useToast } from "./ui";

const DAYS = [
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 6, l: "Sat" },
  { v: 0, l: "Sun" },
];

export type BootcampFormValues = {
  name: string;
  venue: string;
  classStart: string;
  classEnd: string;
  classDays: number[];
  supervisorName: string;
  supervisorEmail: string;
  reportCc: string;
  warningThreshold: number;
};

export function BootcampForm({ bootcampId, initial }: { bootcampId?: string; initial?: BootcampFormValues }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<BootcampFormValues>(
    initial ?? {
      name: "",
      venue: "",
      classStart: "17:30",
      classEnd: "21:00",
      classDays: [1, 2, 3, 4, 5],
      supervisorName: "",
      supervisorEmail: "",
      reportCc: "",
      warningThreshold: 3,
    },
  );
  const set = <K extends keyof BootcampFormValues>(k: K, val: BootcampFormValues[K]) => setV((s) => ({ ...s, [k]: val }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = bootcampId ? await updateBootcamp(bootcampId, v) : await createBootcamp(v);
      if (!res.ok) return setError(res.error);
      if (bootcampId) {
        toast({ tone: "ok", text: "Settings saved." });
        router.refresh();
      } else if (res.data) {
        router.push(`/b/${(res.data as { id: string }).id}/students?welcome=1`);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <fieldset className="space-y-5">
        <legend className="h-section mb-4">Class</legend>
        <Field label="Bootcamp name" htmlFor="name">
          <input id="name" className="field" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Python for the AI Era, Batch 3" required />
        </Field>
        <Field label="Venue" htmlFor="venue" hint="Shown in the supervisor report.">
          <input id="venue" className="field" value={v.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Iqra University, Islamabad campus" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Class starts" htmlFor="start">
            <input id="start" type="time" className="field" value={v.classStart} onChange={(e) => set("classStart", e.target.value)} required />
          </Field>
          <Field label="Class ends" htmlFor="end">
            <input id="end" type="time" className="field" value={v.classEnd} onChange={(e) => set("classEnd", e.target.value)} required />
          </Field>
        </div>
        <div>
          <span className="label">Class days</span>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => {
              const on = v.classDays.includes(d.v);
              return (
                <button
                  type="button"
                  key={d.v}
                  aria-pressed={on}
                  onClick={() => set("classDays", on ? v.classDays.filter((x) => x !== d.v) : [...v.classDays, d.v])}
                  className={clsx(
                    "h-9 w-12 rounded-lg border text-sm font-medium transition-colors",
                    on ? "border-board bg-board-soft text-board-deep" : "border-line-strong bg-surface text-muted hover:border-faint",
                  )}
                >
                  {d.l}
                </button>
              );
            })}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="h-section mb-4">Supervisor report</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supervisor name" htmlFor="sname">
            <input id="sname" className="field" value={v.supervisorName} onChange={(e) => set("supervisorName", e.target.value)} />
          </Field>
          <Field label="Supervisor email" htmlFor="semail">
            <input id="semail" type="email" className="field" value={v.supervisorEmail} onChange={(e) => set("supervisorEmail", e.target.value)} />
          </Field>
        </div>
        <Field label="Also send a copy to" htmlFor="cc" hint="Optional. Separate several addresses with commas.">
          <input id="cc" className="field" value={v.reportCc} onChange={(e) => set("reportCc", e.target.value)} placeholder="trainer@atomcamp.com" />
        </Field>
      </fieldset>

      <fieldset>
        <legend className="h-section mb-4">Attendance</legend>
        <Field label="Suggest a warning email after" htmlFor="thr" hint="Students with this many absences show up as needing a warning.">
          <div className="flex items-center gap-3">
            <input
              id="thr"
              type="number"
              min={1}
              max={30}
              className="field w-24"
              value={v.warningThreshold}
              onChange={(e) => set("warningThreshold", Number(e.target.value) || 1)}
            />
            <span className="text-sm text-muted">absences</span>
          </div>
        </Field>
      </fieldset>

      {error && <p className="rounded-lg bg-absent-soft px-4 py-3 text-sm text-absent">{error}</p>}
      <Button type="submit" variant="primary" loading={pending}>
        {bootcampId ? "Save settings" : "Create bootcamp"}
      </Button>
    </form>
  );
}
