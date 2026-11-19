export type Sheet = { headers: string[]; rows: string[][] };

export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Picks the most likely column index for each field, by header name and by cell contents. */
export function guessColumn(sheet: Sheet, patterns: RegExp[], contentTest?: (v: string) => boolean): number | null {
  for (const p of patterns) {
    const idx = sheet.headers.findIndex((h) => p.test(h.trim()));
    if (idx >= 0) return idx;
  }
  if (contentTest) {
    const sample = sheet.rows.slice(0, 30);
    let bestIdx: number | null = null;
    let bestHits = 0;
    sheet.headers.forEach((_, i) => {
      const hits = sample.filter((r) => r[i] && contentTest(r[i])).length;
      if (hits > bestHits) {
        bestHits = hits;
        bestIdx = i;
      }
    });
    if (bestIdx !== null && bestHits >= Math.max(1, Math.floor(sample.length / 2))) return bestIdx;
  }
  return null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: string) => EMAIL_RE.test(v.trim());
