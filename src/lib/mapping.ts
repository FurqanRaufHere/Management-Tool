// Column detection and status normalisation for the two kinds of uploads.
// Kept free of server-only imports so it can be unit tested and reused on the client.

import type { Sheet } from "./sheet-utils";
import { guessColumn, isEmail, norm } from "./sheet-utils";

export type Status = "PRESENT" | "LATE" | "ABSENT" | "LEAVE";

export type AttendanceMapping = {
  email: number | null;
  rollNo: number | null;
  name: number | null;
  status: number | null;
};

export type StudentMapping = {
  name: number | null;
  firstName: number | null;
  lastName: number | null;
  email: number | null;
  phone: number | null;
  rollNo: number | null;
};

const STATUS_VALUES: Record<string, Status> = {
  present: "PRESENT",
  p: "PRESENT",
  attended: "PRESENT",
  yes: "PRESENT",
  y: "PRESENT",
  "1": "PRESENT",
  true: "PRESENT",
  joined: "PRESENT",
  onsite: "PRESENT",
  late: "LATE",
  lt: "LATE",
  latecomer: "LATE",
  absent: "ABSENT",
  a: "ABSENT",
  ab: "ABSENT",
  no: "ABSENT",
  n: "ABSENT",
  "0": "ABSENT",
  false: "ABSENT",
  missed: "ABSENT",
  notattended: "ABSENT",
  leave: "LEAVE",
  l: "LEAVE",
  onleave: "LEAVE",
  excused: "LEAVE",
  ex: "LEAVE",
  le: "LEAVE",
  approvedleave: "LEAVE",
};

export function normalizeStatus(raw: string): Status | null {
  const k = norm(raw);
  if (!k) return null;
  if (STATUS_VALUES[k]) return STATUS_VALUES[k];
  if (k.includes("leave") || k.includes("excus")) return "LEAVE";
  if (k.includes("late")) return "LATE";
  if (k.includes("absent")) return "ABSENT";
  if (k.includes("present")) return "PRESENT";
  return null;
}

const looksLikeStatus = (v: string) => normalizeStatus(v) !== null;
const looksLikePhone = (v: string) => /^\+?[\d\s()-]{9,16}$/.test(v.trim());
const looksLikeName = (v: string) => /^[A-Za-z][A-Za-z .'-]{2,60}$/.test(v.trim()) && v.trim().includes(" ");

export function guessAttendanceMapping(sheet: Sheet): AttendanceMapping {
  return {
    email: guessColumn(sheet, [/e-?mail/i], isEmail),
    rollNo: guessColumn(sheet, [/^roll/i, /reg(istration)?\s*(no|#|number)?/i, /student\s*id/i, /^id$/i, /cnic/i]),
    name: guessColumn(sheet, [/^(student\s*)?(full\s*)?name$/i, /name/i], looksLikeName),
    status: guessColumn(sheet, [/status/i, /attendance/i, /present/i, /mark/i], looksLikeStatus),
  };
}

export function guessStudentMapping(sheet: Sheet): StudentMapping {
  const firstName = guessColumn(sheet, [/first\s*name/i, /^given/i]);
  const lastName = guessColumn(sheet, [/last\s*name/i, /surname/i, /family/i]);
  const fullName = guessColumn(sheet, [/^(student\s*)?(full\s*)?name$/i, /full\s*name/i]);
  return {
    name: fullName ?? (firstName === null ? guessColumn(sheet, [/name/i], looksLikeName) : null),
    firstName,
    lastName,
    email: guessColumn(sheet, [/e-?mail/i], isEmail),
    phone: guessColumn(sheet, [/phone/i, /mobile/i, /contact/i, /whats\s*app/i, /cell/i], looksLikePhone),
    rollNo: guessColumn(sheet, [/^roll/i, /reg(istration)?\s*(no|#|number)?/i, /student\s*id/i, /^id$/i]),
  };
}

export type StudentRef = { id: string; name: string; email: string | null; rollNo: string | null };

export type MatchedRow = {
  rowIndex: number;
  raw: { name: string; email: string; rollNo: string; status: string };
  status: Status | null;
  studentId: string | null;
  matchedBy: "email" | "rollNo" | "name" | null;
};

/** Matches upload rows to the roster: email first, then roll number, then exact normalised name. */
export function matchAttendance(sheet: Sheet, map: AttendanceMapping, roster: StudentRef[]): MatchedRow[] {
  const byEmail = new Map<string, string>();
  const byRoll = new Map<string, string>();
  const byName = new Map<string, string | null>(); // null when two students share a name
  for (const s of roster) {
    if (s.email) byEmail.set(s.email.toLowerCase().trim(), s.id);
    if (s.rollNo) byRoll.set(norm(s.rollNo), s.id);
    const n = norm(s.name);
    byName.set(n, byName.has(n) ? null : s.id);
  }
  const get = (r: string[], i: number | null) => (i === null ? "" : (r[i] ?? "").trim());

  return sheet.rows.map((r, rowIndex) => {
    const raw = {
      name: get(r, map.name),
      email: get(r, map.email),
      rollNo: get(r, map.rollNo),
      status: get(r, map.status),
    };
    let studentId: string | null = null;
    let matchedBy: MatchedRow["matchedBy"] = null;
    if (raw.email && byEmail.has(raw.email.toLowerCase())) {
      studentId = byEmail.get(raw.email.toLowerCase())!;
      matchedBy = "email";
    } else if (raw.rollNo && byRoll.has(norm(raw.rollNo))) {
      studentId = byRoll.get(norm(raw.rollNo))!;
      matchedBy = "rollNo";
    } else if (raw.name && byName.get(norm(raw.name))) {
      studentId = byName.get(norm(raw.name))!;
      matchedBy = "name";
    }
    return { rowIndex, raw, status: normalizeStatus(raw.status), studentId, matchedBy };
  });
}

export type ParsedStudent = { name: string; email: string | null; phone: string | null; rollNo: string | null; extra: Record<string, string> };

export function extractStudents(sheet: Sheet, map: StudentMapping): { students: ParsedStudent[]; skipped: number } {
  const used = new Set(Object.values(map).filter((v): v is number => v !== null));
  const students: ParsedStudent[] = [];
  let skipped = 0;
  for (const r of sheet.rows) {
    const g = (i: number | null) => (i === null ? "" : (r[i] ?? "").trim());
    const name = g(map.name) || [g(map.firstName), g(map.lastName)].filter(Boolean).join(" ");
    const emailRaw = g(map.email).toLowerCase();
    const email = isEmail(emailRaw) ? emailRaw : null;
    if (!name && !email) {
      skipped++;
      continue;
    }
    const extra: Record<string, string> = {};
    sheet.headers.forEach((h, i) => {
      if (!used.has(i) && r[i]) extra[h] = r[i];
    });
    students.push({
      name: name || email!.split("@")[0],
      email,
      phone: g(map.phone) || null,
      rollNo: g(map.rollNo) || null,
      extra,
    });
  }
  return { students, skipped };
}
