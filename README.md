# TA Desk

A web app for bootcamp teaching assistants. Each TA signs in with Google and gets one page for the evening's class:

- **Attendance.** Upload the LMS export (.xlsx or .csv). The app finds the right columns, matches rows to students by email, then roll number, then name, and shows you the result before anything is saved. Mark approved leave with one click.
- **Follow-up emails.** Every student marked absent (not on leave) gets an email drafted from your template. You check them, edit any of them, and send them all at once from your own Gmail. Warning emails work the same way, from the Students page.
- **Photos and videos.** Uploads go straight from the phone or laptop to the connected Google Drive folder, with a subfolder per class day. Big videos are fine, and an upload picks up where it left off if the Wi-Fi drops.
- **Class times.** Start class and End class log the exact times. If you forget, you can enter them by hand.
- **Supervisor report.** A formatted email with present, leave and absent counts, the attendance rate, start and end times, whether media was uploaded, and the names of absent students. You preview it, add a note and send it.

Several TAs can share a bootcamp, and each TA can run several bootcamps.

## Stack

Next.js 15 (App Router, server actions), TypeScript, Tailwind, PostgreSQL with Drizzle ORM, NextAuth with Google sign-in, and the Gmail and Drive REST APIs called with each TA's own token.

## Run it on your laptop

You need Node 20 or newer and a Postgres database (a free [Neon](https://neon.tech) database works).

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL, NEXTAUTH_SECRET and ADMIN_EMAILS
npm run db:migrate
npm run dev
```

Then set up Google (below) and put your own Gmail in `ADMIN_EMAILS` so you can sign in.

## Who can sign in

TA Desk is invite-only. Google is the only way to sign in, and only these people get in:

- **Admins in `ADMIN_EMAILS`.** A comma-separated list in `.env` (or your host's environment). They can always sign in, can open every bootcamp, and can't be removed from inside the app. Change the list and restart the app to add or remove one.
- **People an admin has added at `/admin`.** Paste one or many emails, pick TA or Admin, and optionally send each person a short invite from your own Gmail. You can change someone's role, deactivate them or remove them at any time. They're locked out on their next click, not when their session expires.

TAs can add a co-TA to their bootcamp on the Settings page only if that person is already on the list. `/admin` also shows every bootcamp with its TAs, student count, last class, last report and recent attendance rate.

While the Google OAuth consent screen is in **Testing** mode, Google itself only lets in the Gmail addresses listed as **Test users**. So every admin and TA must be added in two places: on `/admin`, and as a Test user in Google Cloud Console.

`ALLOWED_EMAIL_DOMAINS` still works as an extra filter for everyone except the admins in `ADMIN_EMAILS`.

## Set up Google (one time, about 15 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com), create a project, and enable the **Gmail API** and the **Google Drive API**.
2. Under **OAuth consent screen**:
   - If atomcamp uses Google Workspace and all TAs sign in with atomcamp addresses, choose **Internal**. There's no user limit and no Google review.
   - Otherwise choose **External** and leave it in **Testing**. Add every admin's and TA's Gmail as a test user (up to 100). To go beyond that, Google has to verify the app, because Drive access is a restricted scope.
   - Add the scopes `gmail.send` and `drive`.
3. Under **Credentials**, create an **OAuth client ID** of type *Web application*. Add these redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://YOUR-DOMAIN/api/auth/callback/google`
4. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## Deploy

Vercel and Neon is the simplest setup:

1. Push this folder to a GitHub repo and import it in Vercel.
2. Add the variables from `.env.example` in Vercel's project settings. Use Neon's **pooled** connection string for `DATABASE_URL`, and set `NEXTAUTH_URL` to your live URL.
3. Run `npm run db:migrate` once against the production database (from your laptop, with `DATABASE_URL` pointing at it).
4. Add the live callback URL to the Google OAuth client.

Any Node host works too (Railway, Render, a VPS): `npm run build && npm start`.

## How it holds up with 100+ TAs

- Each TA sends from their own Gmail and uploads with their own Drive token, so there is no shared sending limit to hit and no service account to manage.
- Video bytes go from the browser straight to Google. The server only starts and confirms the upload, so large files don't hit server size or time limits.
- Before sending, an email is moved from Draft to Sending in one database update. A double click, or two TAs pressing Send together, can't email a student twice. Re-uploading a day's sheet never creates duplicate absence emails.
- If a TA's Google access expires, sending stops after the first failure with a "sign in again" message, instead of failing 30 emails one by one.
- Every page, action and upload checks that the signed-in person is still on the allowed list (cached for 30 seconds per server) and belongs to that bootcamp, or is an admin.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app locally |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts` |
| `npm run db:seed` | Add demo data (local only, never in production) |
| `npm test` | Run the unit tests |
| `npm run typecheck` | Type-check the project |

## Where things are

```
src/app/admin/           who can sign in, and an overview of every bootcamp
src/app/b/[id]/          pages for one bootcamp: Today, Attendance, Students, Emails, Media, Reports, Settings
src/app/actions/         server actions (all writes go through here)
src/app/api/media/       starts and confirms Drive uploads
src/lib/allowlist.ts     the allowed-list check and its short cache
src/lib/mapping.ts       column detection and matching for uploaded sheets
src/lib/google.ts        Gmail and Drive calls, token refresh, retries
src/lib/report.ts        the supervisor report email
src/db/schema.ts         database tables
```
