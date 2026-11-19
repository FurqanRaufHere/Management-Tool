import Link from "next/link";
import { clsx } from "clsx";
import { Check } from "lucide-react";
import { requireBootcamp } from "@/lib/access";
import { sessionSummary, studentStats } from "@/lib/queries";
import { plural, formatClock, formatDayLong, formatDuration, formatHHmm12, minutesBetween, minutesOfDay, todayIn, toHHmm, weekdayOf } from "@/lib/dates";
import { attendanceRate } from "@/lib/report";
import { EveningRibbon } from "@/components/ribbon";
import { EditTimesButton, EndClassButton, StartClassButton } from "@/components/class-clock";
import { Button } from "@/components/ui";

export const metadata = { title: "Today" };

export default async function TodayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bootcamp, user } = await requireBootcamp(id);
  const tz = bootcamp.timezone;
  const today = todayIn(tz);
  const [sum, stats] = await Promise.all([sessionSummary(bootcamp, today), studentStats(id)]);
  const s = sum.session;
  const c = sum.counts;
  const base = `/b/${id}`;
  const isClassDay = bootcamp.classDays.includes(weekdayOf(today));
  const hasStudents = c.total > 0;
  const mediaTotal = sum.media.photos + sum.media.videos + sum.media.endSnapshots;

  const watch = stats
    .filter((x) => x.active && (x.streak >= 2 || x.absent >= bootcamp.warningThreshold))
    .sort((a, b) => b.absent - a.absent || b.streak - a.streak)
    .slice(0, 6);

  type Step = { title: string; done: boolean; detail: React.ReactNode; action?: React.ReactNode };
  const steps: Step[] = [
    {
      title: "Start class",
      done: !!s?.startedAt,
      detail: s?.startedAt ? `Started at ${formatClock(s.startedAt, tz)}` : `Scheduled for ${formatHHmm12(bootcamp.classStart)}`,
      action: s?.startedAt ? null : <StartClassButton bootcampId={id} />,
    },
    {
      title: "Upload the attendance sheet",
      done: !!s?.attendanceUploadedAt,
      detail: s?.attendanceUploadedAt ? (
        <span>
          <b className="font-medium text-board-deep">{c.present + c.late}</b> present, <b className="font-medium text-leave">{c.leave}</b> on leave,{" "}
          <b className="font-medium text-absent">{c.absent}</b> absent
          {c.unmarked > 0 && <span className="text-muted">, {c.unmarked} not in the sheet</span>}
        </span>
      ) : hasStudents ? (
        "Download it from the LMS after re-marking, then upload it here."
      ) : (
        "Add your students first so the sheet can be matched to them."
      ),
      action: !hasStudents ? (
        <Button href={`${base}/students`}>Add students</Button>
      ) : (
        <Button href={`${base}/attendance/upload`} variant={s?.attendanceUploadedAt ? "ghost" : "primary"} size={s?.attendanceUploadedAt ? "sm" : "md"}>
          {s?.attendanceUploadedAt ? "Upload again" : "Upload sheet"}
        </Button>
      ),
    },
    {
      title: "Follow up with absent students",
      done: !!s?.attendanceUploadedAt && sum.emails.drafts === 0 && sum.emails.failed === 0,
      detail: !s?.attendanceUploadedAt
        ? "Emails are prepared for you after the sheet is uploaded."
        : sum.emails.drafts + sum.emails.failed > 0
          ? `${plural(sum.emails.drafts + sum.emails.failed, "email")} ready for you to check and send`
          : sum.emails.sent > 0
            ? `Sent to ${plural(sum.emails.sent, "student")}`
            : "Nobody to follow up with today",
      action:
        sum.emails.drafts + sum.emails.failed > 0 ? (
          <Button href={`${base}/emails`} variant="primary">
            Review emails
          </Button>
        ) : null,
    },
    {
      title: "Add class photos and videos",
      done: sum.media.photos + sum.media.videos > 0,
      detail: !bootcamp.driveFolderId
        ? "Connect the Drive folder in Settings first."
        : sum.media.photos + sum.media.videos > 0
          ? `${plural(sum.media.photos, "photo")} and ${plural(sum.media.videos, "video")} in Drive`
          : "Take a couple of photos during class and a short video.",
      action: !bootcamp.driveFolderId ? (
        <Button href={`${base}/settings#drive`}>Connect Drive</Button>
      ) : (
        <Button href={`${base}/media`} variant={sum.media.photos + sum.media.videos > 0 ? "ghost" : "secondary"} size={sum.media.photos + sum.media.videos > 0 ? "sm" : "md"}>
          {sum.media.photos + sum.media.videos > 0 ? "Add more" : "Upload"}
        </Button>
      ),
    },
    {
      title: "End class and take the closing snapshot",
      done: !!s?.endedAt && sum.media.endSnapshots > 0,
      detail: s?.endedAt
        ? `Ended at ${formatClock(s.endedAt, tz)}${s.startedAt ? `, ran ${formatDuration(minutesBetween(s.startedAt, s.endedAt))}` : ""}. ${
            sum.media.endSnapshots > 0 ? "Snapshot uploaded." : "Snapshot not uploaded yet."
          }`
        : `Scheduled for ${formatHHmm12(bootcamp.classEnd)}`,
      action: !s?.endedAt ? (
        s?.startedAt ? <EndClassButton bootcampId={id} /> : null
      ) : sum.media.endSnapshots === 0 && bootcamp.driveFolderId ? (
        <Button href={`${base}/media?kind=END_SNAPSHOT`}>Upload snapshot</Button>
      ) : null,
    },
    {
      title: "Send the report to your supervisor",
      done: !!sum.lastReport,
      detail: sum.lastReport
        ? `Sent to ${sum.lastReport.to} at ${formatClock(sum.lastReport.createdAt, tz)}`
        : bootcamp.supervisorEmail
          ? `Goes to ${bootcamp.supervisorName || bootcamp.supervisorEmail}`
          : "Add your supervisor's email in Settings.",
      action: (
        <Button href={`${base}/reports?date=${today}`} variant={sum.lastReport ? "ghost" : "secondary"} size={sum.lastReport ? "sm" : "md"}>
          {sum.lastReport ? "Send again" : "Preview and send"}
        </Button>
      ),
    },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  const nextIdx = steps.findIndex((x) => !x.done);
  const now = new Date();
  const first = user.name?.split(" ")[0];
  const hour = Math.floor(minutesOfDay(now, tz) / 60);
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{first ? `${greeting}, ${first}` : greeting}</p>
          <h1 className="h-page mt-1">{formatDayLong(today)}</h1>
          {!isClassDay && <p className="mt-2 text-sm text-leave">No class is scheduled today. You can still record one if it happened.</p>}
        </div>
        <EditTimesButton bootcampId={id} date={today} start={toHHmm(s?.startedAt, tz)} end={toHHmm(s?.endedAt, tz)} topic={s?.topic ?? ""} label="Edit times or topic" />
      </header>

      <section className="panel px-5 pb-4 pt-5 sm:px-7">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="h-section">{s?.topic || "Tonight's class"}</h2>
          <p className="num text-sm text-muted">
            {s?.startedAt && s?.endedAt
              ? `${formatClock(s.startedAt, tz)} to ${formatClock(s.endedAt, tz)}`
              : s?.startedAt
                ? `In progress since ${formatClock(s.startedAt, tz)}`
                : `${formatHHmm12(bootcamp.classStart)} to ${formatHHmm12(bootcamp.classEnd)}, not started`}
          </p>
        </div>
        <EveningRibbon
          classStart={bootcamp.classStart}
          classEnd={bootcamp.classEnd}
          startedMin={s?.startedAt ? minutesOfDay(s.startedAt, tz) : null}
          endedMin={s?.endedAt ? minutesOfDay(s.endedAt, tz) : null}
          mediaMins={sum.mediaItems.map((m) => ({ min: minutesOfDay(m.createdAt, tz), kind: m.kind }))}
          nowMin={minutesOfDay(now, tz)}
        />
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
          <Legend swatch="border border-dashed border-board/40 bg-board-mist" label="Scheduled" />
          <Legend swatch="bg-board" label="Class ran" />
          <Legend swatch="rounded-full bg-white ring-2 ring-board h-2 w-2" label="Photo" />
          <Legend swatch="rounded-full bg-chalk ring-2 ring-board h-2 w-2" label="Video" />
          <Legend swatch="bg-chalk w-[3px]" label="Now" />
        </div>
      </section>

      <div className="grid gap-10 xl:grid-cols-[1fr_300px]">
        <section aria-labelledby="checklist">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="checklist" className="h-section">
              Tonight&apos;s checklist
            </h2>
            <span className="num text-sm text-muted">
              {doneCount} of {steps.length} done
            </span>
          </div>
          <ol className="relative">
            {steps.map((step, i) => (
              <li key={step.title} className="relative flex gap-4 pb-1">
                {i < steps.length - 1 && <span className={clsx("absolute left-[15px] top-9 h-[calc(100%-28px)] w-px", step.done ? "bg-board/40" : "bg-line-strong")} aria-hidden />}
                <span
                  className={clsx(
                    "num relative z-[1] mt-3 flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
                    step.done ? "bg-board text-white" : i === nextIdx ? "bg-surface text-board ring-2 ring-board" : "bg-surface text-faint ring-1 ring-line-strong",
                  )}
                >
                  {step.done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                </span>
                <div
                  className={clsx(
                    "flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl px-4 py-3.5",
                    i === nextIdx && "bg-surface shadow-[0_0_0_1px_#E3E7E4]",
                  )}
                >
                  <div className="min-w-0">
                    <p className={clsx("font-medium", step.done ? "text-ink-soft" : "text-ink")}>{step.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{step.detail}</p>
                  </div>
                  {step.action && <div className="shrink-0">{step.action}</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="space-y-8">
          <section>
            <h2 className="h-section mb-3">Today in numbers</h2>
            {s?.attendanceUploadedAt ? (
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
                <Stat label="Attendance" value={`${attendanceRate(c)}%`} />
                <Stat label="Present" value={`${c.present + c.late}/${c.total}`} tone="text-board-deep" />
                <Stat label="On leave" value={c.leave} tone="text-leave" />
                <Stat label="Absent" value={c.absent} tone="text-absent" />
              </dl>
            ) : (
              <p className="text-sm text-muted">Numbers appear once today&apos;s sheet is uploaded.</p>
            )}
            {mediaTotal > 0 && sum.media.folderUrl && (
              <a href={sum.media.folderUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-board underline-offset-2 hover:underline">
                Open today&apos;s Drive folder
              </a>
            )}
          </section>

          <section>
            <h2 className="h-section mb-1">Students to check on</h2>
            <p className="mb-3 text-[13px] text-muted">Missed 2 classes in a row, or {bootcamp.warningThreshold}+ in total.</p>
            {watch.length === 0 ? (
              <p className="text-sm text-muted">Nobody right now.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {watch.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{w.name}</p>
                      <p className="text-xs text-muted">
                        {w.absent} absences{w.streak >= 2 ? `, ${w.streak} in a row` : ""}
                      </p>
                    </div>
                    <Link href={`${base}/students?warn=${w.id}`} className="shrink-0 text-[13px] font-medium text-absent hover:underline">
                      Warn
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "text-ink" }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <dd className={clsx("num text-[22px] font-semibold leading-none tracking-tight", tone)}>{value}</dd>
      <dt className="mt-1.5 text-xs text-muted">{label}</dt>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("inline-block h-2.5 w-4 rounded-sm", swatch)} />
      {label}
    </span>
  );
}
