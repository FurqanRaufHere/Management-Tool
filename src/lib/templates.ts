import type { TemplateKind } from "@/db/schema";

export type TemplateVars = {
  studentName: string;
  firstName: string;
  date: string;
  bootcamp: string;
  taName: string;
  absences: string;
  venue: string;
};

export const PLACEHOLDERS: { key: keyof TemplateVars; label: string }[] = [
  { key: "firstName", label: "Student first name" },
  { key: "studentName", label: "Student full name" },
  { key: "date", label: "Class date" },
  { key: "bootcamp", label: "Bootcamp name" },
  { key: "absences", label: "Absences (e.g. 3 classes)" },
  { key: "taName", label: "Your name" },
  { key: "venue", label: "Venue" },
];

export function renderTemplate(src: string, vars: Partial<TemplateVars>): string {
  return src.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => {
    const v = (vars as Record<string, string | undefined>)[k];
    return v === undefined ? m : v;
  });
}

export const DEFAULT_TEMPLATES: { kind: TemplateKind; name: string; subject: string; body: string }[] = [
  {
    kind: "ABSENCE",
    name: "Missed class",
    subject: "We missed you in class on {{date}}",
    body: `Hi {{firstName}},

You were marked absent from today's {{bootcamp}} class ({{date}}), and we didn't have a leave request from you.

Is everything okay? If something came up, just reply to this email and let me know. If you need help catching up, I can share today's material and the lab task.

Regular attendance counts toward completing the bootcamp, so please try to make it to the next class.

Thanks,
{{taName}}
Teaching Assistant, {{bootcamp}}`,
  },
  {
    kind: "WARNING",
    name: "Attendance warning",
    subject: "Attendance warning: {{bootcamp}}",
    body: `Hi {{firstName}},

This is a formal note about your attendance. You have now missed {{absences}} of {{bootcamp}} without approved leave, most recently on {{date}}.

Missing more classes may affect your eligibility to complete the bootcamp and receive the certificate. If there is a reason you can't attend, please reply to this email so we can work something out.

I'd like to see you in the next session.

Regards,
{{taName}}
Teaching Assistant, {{bootcamp}}`,
  },
];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Converts a plain-text email body into simple, client-safe HTML. */
export function textToEmailHtml(text: string): string {
  const paras = text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1d2733;max-width:560px">${paras}</div>`;
}

export function firstNameOf(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}
