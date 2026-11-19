import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readSheet } from "@/lib/sheets";
import { extractStudents, guessAttendanceMapping, guessStudentMapping, matchAttendance, normalizeStatus } from "@/lib/mapping";
import { renderTemplate, DEFAULT_TEMPLATES, textToEmailHtml } from "@/lib/templates";
import { buildMime, parseDriveFolderId } from "@/lib/google";
import { reportHtml, reportText, attendanceRate } from "@/lib/report";
import { zonedDateTime, todayIn, minutesOfDay } from "@/lib/dates";

async function xlsx(rows: (string | number | null)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Attendance");
  rows.forEach((r) => ws.addRow(r));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("status normalisation", () => {
  it.each([
    ["Present", "PRESENT"],
    ["P", "PRESENT"],
    ["absent", "ABSENT"],
    ["A", "ABSENT"],
    ["On Leave", "LEAVE"],
    ["Excused", "LEAVE"],
    ["Late", "LATE"],
    ["Present (late)", "LATE"],
    ["", null],
    ["???", null],
  ])("%s -> %s", (input, out) => {
    expect(normalizeStatus(input)).toBe(out);
  });
});

describe("reading LMS sheets", () => {
  it("skips a title row above the header and finds the right columns", async () => {
    const buf = await xlsx([
      ["PSEB Bootcamp attendance export", null, null, null],
      ["Generated 25/10/2026", null, null, null],
      ["Sr", "Student Name", "Email Address", "Attendance Status"],
      [1, "Ayesha Khan", "ayesha@example.com", "Present"],
      [2, "Bilal Ahmed", "BILAL@example.com", "Absent"],
      [3, "Sana Riaz", "sana@example.com", "Leave"],
      [4, "Unknown Person", "nobody@example.com", "P"],
    ]);
    const sheet = await readSheet(buf, "export.xlsx");
    expect(sheet.headers).toEqual(["Sr", "Student Name", "Email Address", "Attendance Status"]);
    expect(sheet.rows).toHaveLength(4);
    const map = guessAttendanceMapping(sheet);
    expect(map).toMatchObject({ email: 2, name: 1, status: 3 });

    const roster = [
      { id: "s1", name: "Ayesha Khan", email: "ayesha@example.com", rollNo: null },
      { id: "s2", name: "Bilal Ahmed", email: "bilal@example.com", rollNo: null },
      { id: "s3", name: "Sana Riaz", email: null, rollNo: null },
    ];
    const matched = matchAttendance(sheet, map, roster);
    expect(matched.map((m) => [m.studentId, m.status, m.matchedBy])).toEqual([
      ["s1", "PRESENT", "email"],
      ["s2", "ABSENT", "email"], // email match is case-insensitive
      ["s3", "LEAVE", "name"], // falls back to name when the roster has no email
      [null, "PRESENT", null],
    ]);
  });

  it("reads CSV with a BOM", async () => {
    const csv = "﻿Name,Email,Phone,Roll No\nAyesha Khan,ayesha@example.com,0300 1234567,PSEB-01\n,,,\nBilal Ahmed,not-an-email,,PSEB-02\n";
    const sheet = await readSheet(new TextEncoder().encode(csv).buffer as ArrayBuffer, "students.csv");
    const map = guessStudentMapping(sheet);
    expect(map).toMatchObject({ name: 0, email: 1, phone: 2, rollNo: 3 });
    const { students } = extractStudents(sheet, map);
    expect(students).toHaveLength(2);
    expect(students[1]).toMatchObject({ name: "Bilal Ahmed", email: null, rollNo: "PSEB-02" });
  });

  it("builds names from first and last name columns", async () => {
    const buf = await xlsx([
      ["First Name", "Last Name", "E-mail", "Mobile"],
      ["Sana", "Riaz", "sana@example.com", "+92 300 1112223"],
    ]);
    const sheet = await readSheet(buf, "s.xlsx");
    const map = guessStudentMapping(sheet);
    const { students } = extractStudents(sheet, map);
    expect(students[0]).toMatchObject({ name: "Sana Riaz", email: "sana@example.com", phone: "+92 300 1112223" });
  });

  it("rejects old .xls files with a clear message", async () => {
    await expect(readSheet(new ArrayBuffer(10), "old.xls")).rejects.toThrow(/save as \.xlsx/i);
  });

  it("does not match by name when two students share it", async () => {
    const buf = await xlsx([["Name", "Status"], ["Ali Raza", "Present"]]);
    const sheet = await readSheet(buf, "a.xlsx");
    const map = guessAttendanceMapping(sheet);
    const roster = [
      { id: "a", name: "Ali Raza", email: null, rollNo: null },
      { id: "b", name: "Ali  Raza", email: null, rollNo: null },
    ];
    expect(matchAttendance(sheet, map, roster)[0].studentId).toBeNull();
  });
});

describe("templates", () => {
  it("fills placeholders and leaves unknown ones visible", () => {
    expect(renderTemplate("Hi {{firstName}}, {{ date }} {{nope}}", { firstName: "Ayesha", date: "Monday" })).toBe("Hi Ayesha, Monday {{nope}}");
  });
  it("ships both default templates", () => {
    expect(DEFAULT_TEMPLATES.map((t) => t.kind).sort()).toEqual(["ABSENCE", "WARNING"]);
  });
  it("escapes HTML in email bodies", () => {
    expect(textToEmailHtml("<script>x</script>\n\nok")).not.toContain("<script>");
  });
});

describe("gmail mime", () => {
  it("encodes non-ASCII subjects and strips header injection", () => {
    const mime = buildMime({ to: "a@b.com\r\nBcc: evil@x.com", subject: "Report: کلاس", html: "<p>x</p>", text: "x" });
    const headers = mime.split("\r\n\r\n")[0];
    expect(headers).not.toMatch(/\r\nBcc:/);
    expect(headers).toMatch(/Subject: =\?UTF-8\?B\?/);
  });
});

describe("drive links", () => {
  it.each([
    ["https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing", "1AbCdEfGhIjKlMnOp"],
    ["https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjKlMnOp", "1AbCdEfGhIjKlMnOp"],
    ["https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp", "1AbCdEfGhIjKlMnOp"],
    ["1AbCdEfGhIjKlMnOp", "1AbCdEfGhIjKlMnOp"],
    ["not a link", null],
  ])("%s", (input, out) => expect(parseDriveFolderId(input)).toBe(out));
});

describe("dates and report", () => {
  it("converts Karachi local times correctly", () => {
    const d = zonedDateTime("2026-10-26", "17:30", "Asia/Karachi");
    expect(d.toISOString()).toBe("2026-10-26T12:30:00.000Z");
    expect(minutesOfDay(d, "Asia/Karachi")).toBe(17 * 60 + 30);
    // 23:30 UTC on the 25th is already the 26th in Pakistan
    expect(todayIn("Asia/Karachi", new Date("2026-10-25T20:30:00Z"))).toBe("2026-10-26");
  });

  it("renders a report with the key facts", () => {
    const input = {
      bootcamp: { name: "Python for the AI Era", venue: "Iqra University", timezone: "Asia/Karachi", classStart: "17:30", classEnd: "21:00" },
      date: "2026-10-26",
      topic: "Loops",
      startedAt: zonedDateTime("2026-10-26", "17:34", "Asia/Karachi"),
      endedAt: zonedDateTime("2026-10-26", "21:02", "Asia/Karachi"),
      counts: { present: 30, late: 2, absent: 4, leave: 2, unmarked: 0, total: 38 },
      absentees: ["Bilal <Ahmed>"],
      onLeave: ["Sana Riaz"],
      media: { photos: 3, videos: 1, endSnapshots: 1, folderUrl: "https://drive.google.com/drive/folders/x" },
      absenceEmailsSent: 4,
      taName: "Sara",
      notes: "Wi-Fi was down",
    };
    expect(attendanceRate(input.counts)).toBe(89);
    const text = reportText(input);
    expect(text).toContain("Class started: 5:34 PM");
    expect(text).toContain("3 h 28 min");
    expect(text).toContain("Media uploaded: Yes");
    const html = reportHtml(input);
    expect(html).toContain("Bilal &lt;Ahmed&gt;");
    expect(html).toContain("89%");
  });
});
