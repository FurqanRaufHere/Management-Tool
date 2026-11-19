import { plural, formatClock, formatDayLong, formatDuration, minutesBetween } from "./dates";

export type ReportInput = {
  bootcamp: { name: string; venue: string | null; timezone: string; classStart: string; classEnd: string };
  date: string;
  topic: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  counts: { present: number; late: number; absent: number; leave: number; unmarked: number; total: number };
  absentees: string[];
  onLeave: string[];
  media: { photos: number; videos: number; endSnapshots: number; folderUrl: string | null };
  absenceEmailsSent: number;
  taName: string;
  notes: string;
};

export function reportSubject(r: ReportInput) {
  return `Class report: ${r.bootcamp.name}, ${formatDayLong(r.date)}`;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Share of marked students who attended. Approved leave is left out, so it doesn't count against the class. */
export function attendanceRate(c: ReportInput["counts"]) {
  const counted = c.present + c.late + c.absent;
  return counted > 0 ? Math.round(((c.present + c.late) / counted) * 100) : 0;
}

export function mediaUploaded(m: ReportInput["media"]) {
  return m.photos + m.videos + m.endSnapshots > 0;
}

/** Plain text version, used as the email fallback and for the copy button. */
export function reportText(r: ReportInput): string {
  const tz = r.bootcamp.timezone;
  const dur = r.startedAt && r.endedAt ? ` (${formatDuration(minutesBetween(r.startedAt, r.endedAt))})` : "";
  const lines = [
    `${r.bootcamp.name}`,
    `${formatDayLong(r.date)}${r.topic ? `, ${r.topic}` : ""}`,
    "",
    `Class started: ${formatClock(r.startedAt, tz)}`,
    `Class ended: ${formatClock(r.endedAt, tz)}${dur}`,
    "",
    `Attendance: ${r.counts.present + r.counts.late} of ${r.counts.total} present (${attendanceRate(r.counts)}%)`,
    `Present: ${r.counts.present}${r.counts.late ? `, late: ${r.counts.late}` : ""}`,
    `On leave: ${r.counts.leave}`,
    `Absent: ${r.counts.absent}`,
    ...(r.counts.unmarked ? [`Not marked: ${r.counts.unmarked}`] : []),
    "",
    `Media uploaded: ${mediaUploaded(r.media) ? "Yes" : "No"} (${plural(r.media.photos, "photo")}, ${plural(r.media.videos, "video")}, ${plural(r.media.endSnapshots, "end-of-class snapshot")})`,
    ...(r.media.folderUrl ? [`Drive folder: ${r.media.folderUrl}`] : []),
    "",
    ...(r.absentees.length ? [`Absent: ${r.absentees.join(", ")}`] : []),
    ...(r.onLeave.length ? [`On leave: ${r.onLeave.join(", ")}`] : []),
    ...(r.absenceEmailsSent ? [`Follow-up emails sent to ${plural(r.absenceEmailsSent, "absent student")}.`] : []),
    ...(r.notes.trim() ? ["", "Notes:", r.notes.trim()] : []),
    "",
    `Sent by ${r.taName}`,
  ];
  return lines.join("\n");
}

/** Table-based HTML so it renders the same in Gmail, Outlook and phone mail apps. */
export function reportHtml(r: ReportInput): string {
  const tz = r.bootcamp.timezone;
  const c = r.counts;
  const rate = attendanceRate(c);
  const dur = r.startedAt && r.endedAt ? formatDuration(minutesBetween(r.startedAt, r.endedAt)) : null;
  const uploaded = mediaUploaded(r.media);

  const ink = "#1d2733";
  const muted = "#5d6b7a";
  const line = "#e3e7e4";
  const green = "#2d6a4f";

  const stat = (label: string, value: string | number, color = ink) => `
    <td style="padding:14px 12px;border:1px solid ${line};width:25%;vertical-align:top">
      <div style="font-size:24px;font-weight:700;color:${color};line-height:1.1">${value}</div>
      <div style="font-size:12px;color:${muted};margin-top:4px">${label}</div>
    </td>`;

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 0;color:${muted};font-size:14px;width:42%;border-bottom:1px solid ${line}">${label}</td>
      <td style="padding:8px 0;color:${ink};font-size:14px;border-bottom:1px solid ${line}">${value}</td>
    </tr>`;

  const names = (title: string, list: string[]) =>
    list.length
      ? `<p style="margin:18px 0 6px;font-size:13px;font-weight:700;color:${ink}">${title} (${list.length})</p>
         <p style="margin:0;font-size:14px;color:${ink};line-height:1.6">${list.map(esc).join(", ")}</p>`
      : "";

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f2f4f1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f1;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${line};border-radius:10px;font-family:Arial,Helvetica,sans-serif">
  <tr><td style="padding:24px 24px 8px">
    <div style="font-size:13px;color:${green};font-weight:700">Daily class report</div>
    <div style="font-size:20px;font-weight:700;color:${ink};margin-top:4px">${esc(r.bootcamp.name)}</div>
    <div style="font-size:14px;color:${muted};margin-top:4px">${esc(formatDayLong(r.date))}${r.topic ? ` &nbsp;|&nbsp; ${esc(r.topic)}` : ""}${r.bootcamp.venue ? ` &nbsp;|&nbsp; ${esc(r.bootcamp.venue)}` : ""}</div>
  </td></tr>
  <tr><td style="padding:16px 24px 4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr>
        ${stat("Present", `${c.present + c.late}<span style="font-size:14px;color:${muted};font-weight:400"> / ${c.total}</span>`, green)}
        ${stat("On leave", c.leave, "#9a6a12")}
        ${stat("Absent", c.absent, "#a3384e")}
        ${stat("Attendance", `${rate}%`)}
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:12px 24px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      ${row("Class started", formatClock(r.startedAt, tz))}
      ${row("Class ended", formatClock(r.endedAt, tz) + (dur ? ` <span style="color:${muted}">(${dur})</span>` : ""))}
      ${c.late ? row("Arrived late", String(c.late)) : ""}
      ${c.unmarked ? row("Not marked", String(c.unmarked)) : ""}
      ${row(
        "Media uploaded",
        `${uploaded ? `<b style="color:${green}">Yes</b>` : `<b style="color:#a3384e">No</b>`} &nbsp;<span style="color:${muted}">${plural(r.media.photos, "photo")}, ${plural(r.media.videos, "video")}, ${r.media.endSnapshots} end-of-class</span>`,
      )}
      ${r.media.folderUrl ? row("Drive folder", `<a href="${esc(r.media.folderUrl)}" style="color:${green}">Open folder</a>`) : ""}
      ${r.absenceEmailsSent ? row("Follow-up emails", `Sent to ${plural(r.absenceEmailsSent, "absent student")}`) : ""}
    </table>
    ${names("Absent", r.absentees)}
    ${names("On leave", r.onLeave)}
    ${
      r.notes.trim()
        ? `<p style="margin:18px 0 6px;font-size:13px;font-weight:700;color:${ink}">Notes from the TA</p>
           <p style="margin:0;font-size:14px;color:${ink};line-height:1.6">${esc(r.notes.trim()).replace(/\n/g, "<br>")}</p>`
        : ""
    }
  </td></tr>
  <tr><td style="padding:22px 24px 24px;font-size:13px;color:${muted}">Sent by ${esc(r.taName)}</td></tr>
</table>
</td></tr></table></body></html>`;
}
