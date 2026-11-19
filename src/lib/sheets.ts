import ExcelJS from "exceljs";
import Papa from "papaparse";

import type { Sheet } from "./sheet-utils";
export type { Sheet };

const MAX_ROWS = 5000;

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text.trim(); // hyperlink
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("").trim();
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue); // formula
    if ("error" in v) return "";
  }
  return String(v).trim();
}

/** Reads the first non-empty worksheet of an .xlsx or .csv file into plain text rows. */
export async function readSheet(buf: ArrayBuffer, fileName: string): Promise<Sheet> {
  const lower = fileName.toLowerCase();
  let grid: string[][];
  if (lower.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    grid = parsed.data.map((r) => r.map((c) => String(c ?? "").trim()));
  } else if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf);
    } catch {
      throw new Error("This file could not be read as an Excel workbook. Save it as .xlsx or .csv and try again.");
    }
    const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
    if (!ws) throw new Error("The workbook is empty.");
    grid = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as ExcelJS.CellValue[]; // 1-indexed
      const out: string[] = [];
      for (let i = 1; i < values.length; i++) out.push(cellText(values[i]));
      grid.push(out);
    });
  } else if (lower.endsWith(".xls")) {
    throw new Error("Old .xls files are not supported. Open it in Excel and save as .xlsx, or export as .csv.");
  } else {
    throw new Error("Upload an .xlsx or .csv file.");
  }

  grid = grid.filter((r) => r.some((c) => c !== ""));
  if (grid.length === 0) throw new Error("No rows found in the file.");

  // LMS exports often have a title or date line above the real header. Pick the first row
  // within the top 10 that looks like a header (several non-empty text cells).
  let headerIdx = 0;
  let best = -1;
  for (let i = 0; i < Math.min(10, grid.length); i++) {
    const score = grid[i].filter((c) => c && Number.isNaN(Number(c))).length + headerKeywordScore(grid[i]) * 3;
    if (score > best) {
      best = score;
      headerIdx = i;
    }
  }
  const width = Math.max(...grid.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => grid[headerIdx][i] || `Column ${i + 1}`);
  const rows = grid
    .slice(headerIdx + 1, headerIdx + 1 + MAX_ROWS)
    .map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  return { headers, rows };
}

const KEYWORDS = /(name|email|e-mail|status|attendance|roll|reg|id|phone|mobile|contact)/i;
function headerKeywordScore(row: string[]): number {
  return row.filter((c) => KEYWORDS.test(c)).length;
}

