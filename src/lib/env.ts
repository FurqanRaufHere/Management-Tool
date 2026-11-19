// Central place for feature flags read from the environment.

import { domainAllowed, parseEnvList } from "./people";

export const isProd = process.env.NODE_ENV === "production";

/** Fakes Gmail and Drive calls for automated tests. Ignored in production. */
export const googleMock = !isProd && process.env.GOOGLE_MOCK === "true";

/** People who can always sign in and manage who else can. Compared lowercase. */
export const adminEmails = parseEnvList(process.env.ADMIN_EMAILS);

export const allowedDomains = parseEnvList(process.env.ALLOWED_EMAIL_DOMAINS);

export function emailAllowed(email: string | null | undefined): boolean {
  return !!email && domainAllowed(email, allowedDomains);
}
