import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Today's date (YYYY-MM-DD) in the given IANA timezone. */
export function todayIn(tz: string, now: Date = new Date()): string {
  return formatInTimeZone(now, tz, "yyyy-MM-dd");
}

export function isValidDateKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

export function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

export function formatClock(d: Date | null | undefined, tz: string): string {
  if (!d) return "Not logged";
  return formatInTimeZone(d, tz, "h:mm a");
}

export function formatDayLong(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDayShort(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Converts a local date + HH:mm in a timezone to a UTC Date. */
export function zonedDateTime(dateKey: string, hhmm: string, tz: string): Date {
  return fromZonedTime(`${dateKey}T${hhmm}:00`, tz);
}

/** HH:mm of a Date in a timezone, for time inputs. */
export function toHHmm(d: Date | null | undefined, tz: string): string {
  return d ? formatInTimeZone(d, tz, "HH:mm") : "";
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

export function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Minutes after midnight for an "HH:mm" string. */
export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function minutesOfDay(d: Date, tz: string): number {
  return hhmmToMinutes(formatInTimeZone(d, tz, "HH:mm"));
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatHHmm12(s: string): string {
  const mins = hhmmToMinutes(s);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}
