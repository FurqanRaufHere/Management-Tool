import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { getAccess, recordSignIn } from "./allowlist";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive",
].join(" ");

const providers: NextAuthOptions["providers"] = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    authorization: {
      params: {
        scope: GOOGLE_SCOPES,
        access_type: "offline",
        // select_account lets people pick a different Google account after being turned away.
        prompt: "consent select_account",
        include_granted_scopes: "true",
      },
    },
  }),
];

async function upsertUser(email: string, name: string | null, image: string | null) {
  const [user] = await db
    .insert(schema.users)
    .values({ email, name, image })
    .onConflictDoUpdate({
      target: schema.users.email,
      set: { ...(name ? { name } : {}), ...(image ? { image } : {}) },
    })
    .returning();
  await acceptInvites(user.id, email);
  return user;
}

/** Turns pending co-TA invites for this email into memberships. */
async function acceptInvites(userId: string, email: string) {
  const pending = await db.select().from(schema.invites).where(eq(schema.invites.email, email));
  for (const inv of pending) {
    await db
      .insert(schema.members)
      .values({ bootcampId: inv.bootcampId, userId, role: "TA" })
      .onConflictDoNothing();
    await db.delete(schema.invites).where(and(eq(schema.invites.id, inv.id)));
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login", error: "/login" },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      const email = user.email?.toLowerCase();
      if (account?.provider !== "google" || !email) return "/login?error=not_invited";
      // Fresh check: someone an admin just added should get in without waiting for the cache.
      const access = await getAccess(email, { fresh: true });
      if (!access.allowed) return `/login?error=not_invited&email=${encodeURIComponent(email)}`;
      await recordSignIn(email, user.name ?? null);
      return true;
    },
    async jwt({ token, user, account }) {
      if (account?.provider === "google" && user?.email) {
        // First sign-in or re-consent: store the user and their Google tokens.
        const dbUser = await upsertUser(user.email.toLowerCase(), user.name ?? null, user.image ?? null);
        await db
          .insert(schema.googleAccounts)
          .values({
            userId: dbUser.id,
            googleId: account.providerAccountId,
            accessToken: account.access_token ?? null,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at ?? null,
            scope: account.scope ?? null,
          })
          .onConflictDoUpdate({
            target: schema.googleAccounts.userId,
            set: {
              googleId: account.providerAccountId,
              accessToken: account.access_token ?? null,
              expiresAt: account.expires_at ?? null,
              scope: account.scope ?? null,
              // Google only sends a refresh token on consent; keep the old one otherwise.
              ...(account.refresh_token ? { refreshToken: account.refresh_token } : {}),
            },
          });
        token.sub = dbUser.id;
        token.email = dbUser.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};

export function getSession() {
  return getServerSession(authOptions);
}
