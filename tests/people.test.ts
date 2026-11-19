import { describe, expect, it } from "vitest";
import { changeBlockedReason, decideAccess, parseEmailList, parseEnvList } from "@/lib/people";

describe("email list parsing", () => {
  it("splits on commas, spaces, semicolons and new lines", () => {
    const r = parseEmailList("a@gmail.com, b@gmail.com\nc@gmail.com d@gmail.com;e@gmail.com\r\n\tf@gmail.com");
    expect(r.emails).toEqual(["a@gmail.com", "b@gmail.com", "c@gmail.com", "d@gmail.com", "e@gmail.com", "f@gmail.com"]);
    expect(r.invalid).toEqual([]);
  });

  it("lowercases and drops duplicates, keeping the first order", () => {
    const r = parseEmailList("Ayesha@Gmail.com\nayesha@gmail.com, bilal@gmail.com AYESHA@GMAIL.COM");
    expect(r.emails).toEqual(["ayesha@gmail.com", "bilal@gmail.com"]);
  });

  it("reports anything that isn't an email, once", () => {
    const r = parseEmailList("good@gmail.com, nope, also@bad, nope");
    expect(r.emails).toEqual(["good@gmail.com"]);
    expect(r.invalid).toEqual(["nope", "also@bad"]);
  });

  it("accepts addresses pasted with angle brackets and ignores empty input", () => {
    expect(parseEmailList("<x@gmail.com>").emails).toEqual(["x@gmail.com"]);
    expect(parseEmailList("  ,, \n ")).toEqual({ emails: [], invalid: [] });
  });

  it("reads ADMIN_EMAILS style lists", () => {
    expect(parseEnvList(" Boss@Gmail.com , other@x.com")).toEqual(["boss@gmail.com", "other@x.com"]);
    expect(parseEnvList(undefined)).toEqual([]);
  });
});

describe("access decision", () => {
  const base = { adminEmails: ["furqanrauf6@gmail.com"], allowedDomains: [] as string[] };

  it("lets ADMIN_EMAILS in as admins without a row, ignoring case", () => {
    expect(decideAccess("FurqanRauf6@gmail.com", { ...base, row: null })).toEqual({ allowed: true, admin: true, fromEnv: true });
  });

  it("lets active people in with their role", () => {
    expect(decideAccess("ta@gmail.com", { ...base, row: { role: "TA", active: true } })).toEqual({ allowed: true, admin: false, fromEnv: false });
    expect(decideAccess("lead@gmail.com", { ...base, row: { role: "ADMIN", active: true } }).admin).toBe(true);
  });

  it("keeps out deactivated people, even admins", () => {
    expect(decideAccess("ta@gmail.com", { ...base, row: { role: "TA", active: false } }).allowed).toBe(false);
    expect(decideAccess("lead@gmail.com", { ...base, row: { role: "ADMIN", active: false } })).toEqual({ allowed: false, admin: false, fromEnv: false });
  });

  it("keeps out people who were never added, or have no email", () => {
    expect(decideAccess("stranger@gmail.com", { ...base, row: null }).allowed).toBe(false);
    expect(decideAccess(undefined, { ...base, row: null }).allowed).toBe(false);
  });

  it("applies the domain filter to listed people but not to ADMIN_EMAILS", () => {
    const opts = { ...base, allowedDomains: ["atomcamp.com"] };
    expect(decideAccess("ta@atomcamp.com", { ...opts, row: { role: "TA", active: true } }).allowed).toBe(true);
    expect(decideAccess("ta@gmail.com", { ...opts, row: { role: "TA", active: true } }).allowed).toBe(false);
    expect(decideAccess("furqanrauf6@gmail.com", { ...opts, row: null }).allowed).toBe(true);
  });
});

describe("who an admin can change", () => {
  const env = ["furqanrauf6@gmail.com"];

  it("stops admins removing, deactivating or demoting themselves", () => {
    expect(changeBlockedReason("Lead@gmail.com", "lead@gmail.com", "remove", env)).toBe("You can't remove yourself.");
    expect(changeBlockedReason("lead@gmail.com", "lead@gmail.com", "deactivate", env)).toBe("You can't deactivate yourself.");
    expect(changeBlockedReason("lead@gmail.com", "lead@gmail.com", "role", env)).toBe("You can't change your own role.");
  });

  it("never lets anyone change admins set in ADMIN_EMAILS", () => {
    expect(changeBlockedReason("lead@gmail.com", "furqanrauf6@gmail.com", "remove", env)).toMatch(/server settings/);
  });

  it("allows changes to other people", () => {
    expect(changeBlockedReason("furqanrauf6@gmail.com", "ta@gmail.com", "remove", env)).toBeNull();
  });
});
