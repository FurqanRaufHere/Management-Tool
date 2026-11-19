// Pure rules for who may sign in and who may change whom. No database access, so it's easy to test.

import { z } from "zod";
import type { AllowedRole } from "@/db/schema";

const emailSchema = z.string().email();

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Splits a comma or space separated list from the environment, e.g. ADMIN_EMAILS or ALLOWED_EMAIL_DOMAINS. */
export function parseEnvList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,\s]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}

/**
 * Reads emails pasted by an admin, separated by commas, semicolons, spaces or new lines.
 * Returns unique valid emails in the order given, and anything that isn't an email.
 */
export function parseEmailList(input: string): { emails: string[]; invalid: string[] } {
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/[,;\s]+/)) {
    const part = normalizeEmail(raw.replace(/^<|>$/g, ""));
    if (!part) continue;
    if (!emailSchema.safeParse(part).success) {
      if (!invalid.includes(part)) invalid.push(part);
    } else if (!emails.includes(part)) {
      emails.push(part);
    }
  }
  return { emails, invalid };
}

export function domainAllowed(email: string, domains: string[]): boolean {
  if (domains.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && domains.includes(domain);
}

export type AllowedRow = { role: AllowedRole; active: boolean } | null | undefined;
export type Access = { allowed: boolean; admin: boolean; fromEnv: boolean };

/**
 * The one place that decides access. Admins from ADMIN_EMAILS always get in.
 * Everyone else needs an active row in allowed_users and, if set, an allowed domain.
 */
export function decideAccess(
  email: string | null | undefined,
  opts: { adminEmails: string[]; allowedDomains: string[]; row: AllowedRow },
): Access {
  if (!email) return { allowed: false, admin: false, fromEnv: false };
  const e = normalizeEmail(email);
  if (opts.adminEmails.includes(e)) return { allowed: true, admin: true, fromEnv: true };
  if (!opts.row?.active || !domainAllowed(e, opts.allowedDomains)) return { allowed: false, admin: false, fromEnv: false };
  return { allowed: true, admin: opts.row.role === "ADMIN", fromEnv: false };
}

export type PersonChange = "role" | "deactivate" | "remove";

/** Returns why an admin can't make this change to this person, or null if they can. */
export function changeBlockedReason(actorEmail: string, targetEmail: string, change: PersonChange, adminEmails: string[]): string | null {
  const target = normalizeEmail(targetEmail);
  if (adminEmails.includes(target)) return "This admin is set in server settings and can't be changed here.";
  if (normalizeEmail(actorEmail) === target) {
    if (change === "remove") return "You can't remove yourself.";
    if (change === "deactivate") return "You can't deactivate yourself.";
    return "You can't change your own role.";
  }
  return null;
}
