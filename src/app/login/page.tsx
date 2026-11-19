import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAccess } from "@/lib/allowlist";
import { isProd } from "@/lib/env";
import { Mark } from "@/components/mark";
import { LoginButtons } from "./buttons";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  removed: "Your access to TA Desk was removed. Contact your admin if this is a mistake.",
  domain: "That Google account isn't allowed here. Sign in with your work email.",
  OAuthCallback: "Google sign-in didn't finish. Try again.",
  AccessDenied: "Google sign-in was cancelled.",
  Default: "Sign-in didn't work. Try again.",
};

const CONFIG_ERRORS = ["OAuthSignin", "Configuration"];

function errorMessage(error: string, email: string | undefined) {
  if (error === "not_invited") {
    const who = email ? `Your Google account (${email})` : "Your Google account";
    return `${who} hasn't been added to TA Desk yet. Ask your admin to add you, then try again.`;
  }
  return ERRORS[error] ?? ERRORS.Default;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string }> }) {
  const session = await getSession();
  // Someone who was removed still has a session cookie, so only send allowed people onward.
  const signedIn = !!session?.user?.id;
  if (signedIn && (await getAccess(session.user.email)).allowed) redirect("/");
  const { error, email } = await searchParams;
  const configHint = !isProd && !!error && CONFIG_ERRORS.includes(error);
  // NextAuth can't start the Google handshake without a secret, and reports it as OAuthSignin.
  const missingSecret = !process.env.NEXTAUTH_SECRET;
  const switchAccount = signedIn || error === "not_invited" || error === "removed";

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="flex flex-col justify-between px-6 py-8 sm:px-12 lg:py-12">
        <div className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[17px] font-semibold tracking-tight">TA Desk</span>
        </div>

        <div className="my-16 max-w-md">
          <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[40px]">
            Run tonight&apos;s class from one page.
          </h1>
          <p className="mt-4 text-[17px] leading-relaxed text-muted">
            Upload the LMS attendance sheet, follow up with students who missed class, send photos to Drive and email your
            supervisor the day&apos;s report.
          </p>

          {error && !configHint && (
            <p className="mt-6 rounded-lg border border-absent/25 bg-absent-soft px-4 py-3 text-sm text-absent">
              {errorMessage(error, email)}
            </p>
          )}
          {configHint && (
            <div className="mt-6 space-y-2 rounded-lg border border-absent/25 bg-absent-soft px-4 py-3 text-sm text-absent">
              {missingSecret ? (
                <p>Google sign-in isn&apos;t set up yet. NEXTAUTH_SECRET in .env is empty. Set it to any long random text and restart the app.</p>
              ) : (
                <>
                  <p>Google sign-in isn&apos;t set up yet. GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env is missing or wrong.</p>
                  <p>
                    In Google Cloud Console, add this redirect URI to your OAuth client:{" "}
                    <code className="break-all font-medium">http://localhost:3000/api/auth/callback/google</code>
                  </p>
                </>
              )}
              <p className="text-[13px]">You only see this hint while running the app locally.</p>
            </div>
          )}

          <div className="mt-8">
            <LoginButtons switchAccount={switchAccount} signedIn={signedIn} />
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Google will ask to let TA Desk send email as you and add files to Drive. Emails to students and your supervisor go
            out from your own Gmail, and photos go into the folder you connect.
          </p>
        </div>

        <p className="text-[13px] text-faint">For bootcamp teaching assistants</p>
      </section>

      <aside className="relative hidden overflow-hidden bg-board lg:block" aria-hidden>
        <RegisterIllustration />
      </aside>
    </main>
  );
}

/** A quiet picture of an attendance register, made of the same marks the app uses. */
function RegisterIllustration() {
  const rows = 11;
  const cols = 12;
  const pattern = "PPPAPPLPPPPPPPPPPAPPPPLPPPPPPPAAPPPPPPPPPPPPPPPPLPPPPPPAPPPPPPPPPPPPPPPPPPPAPPPPPPPPLPPPPPPPPPPPPPPPPAPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP";
  const color = (c: string) => (c === "A" ? "#C76B7E" : c === "L" ? "#D9B25C" : "rgba(227,238,231,0.85)");
  return (
    <div className="absolute inset-0 flex items-center justify-center p-16">
      <svg viewBox="0 0 520 420" className="w-full max-w-[560px]">
        {Array.from({ length: rows }).map((_, r) => (
          <g key={r} transform={`translate(0 ${r * 36})`}>
            <rect x="0" y="8" width={r % 3 === 0 ? 92 : r % 3 === 1 ? 74 : 104} height="8" rx="4" fill="rgba(227,238,231,0.35)" />
            {Array.from({ length: cols }).map((_, c) => {
              const ch = pattern[(r * cols + c) % pattern.length];
              return <rect key={c} x={140 + c * 31} y="2" width="22" height="22" rx="6" fill={color(ch)} opacity={c > 9 ? 0.35 : 1} />;
            })}
          </g>
        ))}
        <rect x={140 + 10 * 31 - 5} y="-8" width="2" height={rows * 36 + 4} rx="1" fill="#F2D16B" />
      </svg>
    </div>
  );
}
