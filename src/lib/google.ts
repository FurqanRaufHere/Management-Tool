import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { googleMock } from "./env";

/**
 * Thin wrappers over the Gmail and Drive REST APIs, using the signed-in TA's own Google token.
 * Plain fetch keeps the bundle small and makes errors easy to surface to the user.
 */

export class GoogleError extends Error {
  constructor(
    message: string,
    public status: number,
    public reconnect = false,
  ) {
    super(message);
  }
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Avoid refreshing the same token many times in parallel (bulk sends, batch uploads).
const inflight = new Map<string, Promise<string>>();

export async function getAccessToken(userId: string): Promise<string> {
  if (googleMock) return "mock-token";
  const existing = inflight.get(userId);
  if (existing) return existing;
  const p = fetchToken(userId).finally(() => inflight.delete(userId));
  inflight.set(userId, p);
  return p;
}

async function fetchToken(userId: string): Promise<string> {
  const [account] = await db
    .select()
    .from(schema.googleAccounts)
    .where(eq(schema.googleAccounts.userId, userId))
    .limit(1);
  if (!account) {
    throw new GoogleError("Your Google account is not connected. Sign out and sign in with Google.", 401, true);
  }
  const now = Math.floor(Date.now() / 1000);
  if (account.accessToken && account.expiresAt && account.expiresAt - 60 > now) {
    return account.accessToken;
  }
  if (!account.refreshToken) {
    throw new GoogleError("Google access expired. Sign out and sign in again to reconnect.", 401, true);
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    const revoked = data.error === "invalid_grant";
    throw new GoogleError(
      revoked
        ? "Google access was revoked. Sign out and sign in again to reconnect."
        : "Could not refresh Google access. Try again in a minute.",
      401,
      revoked,
    );
  }
  await db
    .update(schema.googleAccounts)
    .set({
      accessToken: data.access_token,
      expiresAt: now + (data.expires_in ?? 3600),
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
    })
    .where(eq(schema.googleAccounts.userId, userId));
  return data.access_token;
}

async function googleFetch(userId: string, url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  const token = await getAccessToken(userId);
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  // Retry rate limits and transient server errors with backoff.
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 250));
    return googleFetch(userId, url, init, attempt + 1);
  }
  if (res.status === 401 && attempt === 0) {
    // Token may have been revoked between our expiry check and the call. Force a refresh once.
    await db.update(schema.googleAccounts).set({ expiresAt: 0 }).where(eq(schema.googleAccounts.userId, userId));
    return googleFetch(userId, url, init, attempt + 1);
  }
  return res;
}

async function errorFrom(res: Response, fallback: string): Promise<GoogleError> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  const msg = body?.error?.message;
  if (res.status === 403 && msg?.toLowerCase().includes("insufficient")) {
    return new GoogleError(
      "Google did not grant Gmail or Drive permission. Sign out, sign in again and tick every permission box.",
      403,
      true,
    );
  }
  return new GoogleError(msg ? `${fallback}: ${msg}` : fallback, res.status);
}

// ---------------- Gmail ----------------

function encodeHeader(value: string): string {
  // RFC 2047 so names and subjects with non-ASCII characters survive.
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function buildMime(opts: {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): string {
  const boundary = `b_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `To: ${sanitizeHeader(opts.to)}`,
    ...(opts.cc && opts.cc.length ? [`Cc: ${sanitizeHeader(opts.cc.join(", "))}`] : []),
    ...(opts.replyTo ? [`Reply-To: ${sanitizeHeader(opts.replyTo)}`] : []),
    `Subject: ${encodeHeader(sanitizeHeader(opts.subject))}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const b64 = (s: string) =>
    Buffer.from(s, "utf8")
      .toString("base64")
      .replace(/(.{76})/g, "$1\r\n");
  return [
    headers.join("\r\n"),
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(opts.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(opts.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export async function sendGmail(
  userId: string,
  opts: { to: string; cc?: string[]; subject: string; html: string; text: string },
): Promise<{ id: string }> {
  if (googleMock) {
    console.info(`[mock gmail] to=${opts.to} cc=${opts.cc?.join(",") ?? ""} subject="${opts.subject}"`);
    return { id: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
  }
  const raw = Buffer.from(buildMime(opts), "utf8").toString("base64url");
  const res = await googleFetch(userId, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw await errorFrom(res, "Gmail could not send the email");
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

// ---------------- Drive ----------------

const DRIVE = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Accepts a folder URL or a raw ID and returns the ID. */
export function parseDriveFolderId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]{10,})/) ?? s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

export async function getDriveFolder(userId: string, folderId: string): Promise<{ id: string; name: string }> {
  if (googleMock) return { id: folderId, name: "Class media (test folder)" };
  const res = await googleFetch(
    userId,
    `${DRIVE}/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,capabilities(canAddChildren)&supportsAllDrives=true`,
  );
  if (res.status === 404) {
    throw new GoogleError("Drive folder not found. Check the link and that it is shared with your Google account.", 404);
  }
  if (!res.ok) throw await errorFrom(res, "Could not open the Drive folder");
  const f = (await res.json()) as {
    id: string;
    name: string;
    mimeType: string;
    capabilities?: { canAddChildren?: boolean };
  };
  if (f.mimeType !== FOLDER_MIME) throw new GoogleError("That link points to a file, not a folder.", 400);
  if (f.capabilities && f.capabilities.canAddChildren === false) {
    throw new GoogleError("You can view this folder but not add files to it. Ask for Editor access.", 403);
  }
  return { id: f.id, name: f.name };
}

/** Finds or creates a child folder by name, e.g. one folder per class day. */
export async function ensureChildFolder(userId: string, parentId: string, name: string): Promise<string> {
  if (googleMock) return `mock_folder_${name}`;
  const q = `name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const list = await googleFetch(
    userId,
    `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
  );
  if (!list.ok) throw await errorFrom(list, "Could not read the Drive folder");
  const found = (await list.json()) as { files: { id: string }[] };
  if (found.files[0]) return found.files[0].id;
  const res = await googleFetch(userId, `${DRIVE}/files?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  if (!res.ok) throw await errorFrom(res, "Could not create the day folder in Drive");
  return ((await res.json()) as { id: string }).id;
}

/**
 * Starts a resumable upload. The browser then sends the file bytes straight to Google,
 * so large class videos never pass through (or time out on) our server.
 */
export async function startResumableUpload(
  userId: string,
  opts: { name: string; mimeType: string; size: number; parentId: string; origin: string },
): Promise<string> {
  if (googleMock) return `mock://upload/${encodeURIComponent(opts.name)}`;
  const res = await googleFetch(
    userId,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": opts.mimeType,
        "X-Upload-Content-Length": String(opts.size),
        // Google only allows the browser to PUT to the session URL if it was created with a matching Origin.
        Origin: opts.origin,
      },
      body: JSON.stringify({ name: opts.name, parents: [opts.parentId] }),
    },
  );
  if (!res.ok) throw await errorFrom(res, "Could not start the Drive upload");
  const location = res.headers.get("location");
  if (!location) throw new GoogleError("Drive did not return an upload address.", 502);
  return location;
}

export async function getDriveFile(
  userId: string,
  fileId: string,
): Promise<{ id: string; name: string; mimeType: string; size: number; webViewLink?: string; parents?: string[] }> {
  if (googleMock) return { id: fileId, name: "mock", mimeType: "image/jpeg", size: 0, parents: [] };
  const res = await googleFetch(
    userId,
    `${DRIVE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink,parents&supportsAllDrives=true`,
  );
  if (!res.ok) throw await errorFrom(res, "Could not confirm the uploaded file");
  const f = (await res.json()) as { id: string; name: string; mimeType: string; size?: string; webViewLink?: string; parents?: string[] };
  return { ...f, size: Number(f.size ?? 0) };
}

export function driveFolderUrl(id: string) {
  return `https://drive.google.com/drive/folders/${id}`;
}
