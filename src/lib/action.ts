import { ZodError } from "zod";
import { AccessError } from "./access";
import { GoogleError } from "./google";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string; reconnect?: boolean };

/** Runs a server action body and turns known errors into messages the UI can show. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data } as ActionResult<T>;
  } catch (e) {
    if (e instanceof UserError || e instanceof AccessError) return { ok: false, error: e.message };
    if (e instanceof GoogleError) return { ok: false, error: e.message, reconnect: e.reconnect };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Some fields are not valid." };
    // Next.js uses thrown errors for redirects and notFound. Let those through.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error(e);
    return { ok: false, error: "Something went wrong on our side. Try again, and if it keeps happening, tell the admin." };
  }
}

/** An error whose message is safe and useful to show to the TA. */
export class UserError extends Error {}
