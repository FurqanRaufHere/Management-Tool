import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Short, URL-safe, sortable-enough random IDs. */
export function createId(): string {
  const bytes = randomBytes(16);
  let out = Date.now().toString(36);
  for (let i = 0; i < 14; i++) out += ALPHABET[bytes[i] % 36];
  return out;
}
