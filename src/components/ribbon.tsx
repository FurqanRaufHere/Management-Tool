import { clsx } from "clsx";
import { formatHHmm12, hhmmToMinutes } from "@/lib/dates";

type Props = {
  classStart: string;
  classEnd: string;
  startedMin: number | null;
  endedMin: number | null;
  mediaMins: { min: number; kind: "PHOTO" | "VIDEO" | "END_SNAPSHOT" }[];
  nowMin: number | null;
};

const fmt = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return formatHHmm12(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
};

/**
 * The evening at a glance: the scheduled class window, when class actually ran,
 * when photos and videos were added, and where "now" is.
 */
export function EveningRibbon({ classStart, classEnd, startedMin, endedMin, mediaMins, nowMin }: Props) {
  const s = hhmmToMinutes(classStart);
  const e = hhmmToMinutes(classEnd);
  const points = [s, e, startedMin, endedMin, nowMin, ...mediaMins.map((m) => m.min)].filter((x): x is number => x !== null);
  const lo = Math.floor((Math.min(...points, s - 30) - 10) / 30) * 30;
  const hi = Math.ceil((Math.max(...points, e + 30) + 10) / 30) * 30;
  const pct = (m: number) => ((m - lo) / (hi - lo)) * 100;

  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 30) ticks.push(t);

  const runEnd = endedMin ?? (startedMin !== null && nowMin !== null ? Math.max(nowMin, startedMin) : null);

  return (
    <div className="select-none" role="img" aria-label={`Class scheduled ${formatHHmm12(classStart)} to ${formatHHmm12(classEnd)}`}>
      <div className="relative h-16">
        {/* scheduled window */}
        <div
          className="absolute top-5 h-7 rounded-md border border-dashed border-board/35 bg-board-mist"
          style={{ left: `${pct(s)}%`, width: `${pct(e) - pct(s)}%` }}
        />
        {/* actual run */}
        {startedMin !== null && runEnd !== null && (
          <div
            className={clsx("absolute top-5 h-7 rounded-md bg-board", endedMin === null && "bg-[linear-gradient(90deg,#2D6A4F_85%,#2D6A4F99)]")}
            style={{ left: `${pct(startedMin)}%`, width: `${Math.max(0.6, pct(runEnd) - pct(startedMin))}%` }}
          />
        )}
        {/* media moments */}
        {mediaMins.map((m, i) => (
          <span
            key={i}
            title={`${m.kind === "VIDEO" ? "Video" : m.kind === "END_SNAPSHOT" ? "End-of-class snapshot" : "Photo"} at ${fmt(m.min)}`}
            className={clsx(
              "absolute top-[30px] h-2 w-2 -translate-x-1/2 rounded-full ring-2 ring-board",
              m.kind === "VIDEO" ? "bg-chalk" : "bg-white",
            )}
            style={{ left: `${pct(m.min)}%` }}
          />
        ))}
        {/* labels for actual start/end */}
        {startedMin !== null && (
          <span className="num absolute top-0 -translate-x-1/2 whitespace-nowrap text-[12px] font-medium text-board-deep" style={{ left: `${pct(startedMin)}%` }}>
            {fmt(startedMin)}
          </span>
        )}
        {endedMin !== null && (startedMin === null || pct(endedMin) - pct(startedMin) > 9) && (
          <span className="num absolute top-0 -translate-x-1/2 whitespace-nowrap text-[12px] font-medium text-board-deep" style={{ left: `${pct(endedMin)}%` }}>
            {fmt(endedMin)}
          </span>
        )}
        {/* now */}
        {nowMin !== null && nowMin >= lo && nowMin <= hi && (
          <div className="absolute top-3 h-11 w-[3px] -translate-x-1/2 rounded-full bg-chalk shadow-[0_0_0_2px_#fff]" style={{ left: `${pct(nowMin)}%` }} title={`Now, ${fmt(nowMin)}`} />
        )}
      </div>
      <div className="relative mt-1 h-5 border-t border-line">
        {ticks.map((t) => (
          <span
            key={t}
            className={clsx("num absolute top-1.5 -translate-x-1/2 text-[11px] text-faint", t % 60 !== 0 && "hidden sm:inline")}
            style={{ left: `${pct(t)}%` }}
          >
            {fmt(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
