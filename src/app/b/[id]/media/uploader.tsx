"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { clsx } from "clsx";
import { Camera, Check, Film, ImageIcon, RotateCcw, X } from "lucide-react";
import type { MediaKind } from "@/db/schema";
import { formatDayLong } from "@/lib/dates";
import { Button, Field, ProgressBar, useToast } from "@/components/ui";
import { FileDrop } from "@/components/file-drop";

type Item = { id: string; kind: MediaKind; fileName: string; size: number; link: string | null; mimeType: string; createdAt: string };
type Job = {
  key: string;
  file: File;
  kind: MediaKind;
  date: string;
  progress: number;
  state: "queued" | "uploading" | "done" | "error";
  error?: string;
};

const KINDS: { k: MediaKind; label: string; hint: string; icon: typeof Camera; accept: string }[] = [
  { k: "PHOTO", label: "Class photos", hint: "During the session", icon: ImageIcon, accept: "image/*" },
  { k: "VIDEO", label: "Class videos", hint: "Short clips of the class", icon: Film, accept: "video/*" },
  { k: "END_SNAPSHOT", label: "End-of-class snapshot", hint: "Taken as class ends", icon: Camera, accept: "image/*" },
];

const CHUNK = 8 * 1024 * 1024; // multiple of 256 KB, as Drive requires
const PARALLEL = 2;

function fmtSize(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Sends one chunk with progress. Resolves with the HTTP status and parsed body. */
function putChunk(url: string, blob: Blob, start: number, total: number, onProgress: (loaded: number) => void) {
  return new Promise<{ status: number; body: string; range: string | null }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Range", `bytes ${start}-${start + blob.size - 1}/${total}`);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText, range: xhr.getResponseHeader("Range") });
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(blob);
  });
}

/** Asks Drive how much of an interrupted upload it already has. */
function queryOffset(url: string, total: number) {
  return new Promise<{ status: number; body: string; range: string | null }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Range", `bytes */${total}`);
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText, range: xhr.getResponseHeader("Range") });
    xhr.onerror = () => reject(new Error("network"));
    xhr.send();
  });
}

async function uploadToDrive(url: string, file: File, onProgress: (pct: number) => void): Promise<string> {
  if (url.startsWith("mock://")) {
    for (let p = 0; p <= 100; p += 20) {
      onProgress(p);
      await new Promise((r) => setTimeout(r, 120));
    }
    return `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
  let offset = 0;
  let retries = 0;
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK, file.size);
    try {
      const res = await putChunk(url, file.slice(offset, end), offset, file.size, (loaded) => onProgress(((offset + loaded) / file.size) * 100));
      if (res.status === 200 || res.status === 201) return (JSON.parse(res.body) as { id: string }).id;
      if (res.status === 308) {
        offset = res.range ? Number(res.range.split("-")[1]) + 1 : 0;
        retries = 0;
        continue;
      }
      if (res.status === 404 || res.status === 410) throw new Error("The upload expired. Try this file again.");
      throw new Error(`Drive refused the file (${res.status}).`);
    } catch (e) {
      if (e instanceof Error && e.message !== "network") throw e;
      // Network dropped (common on campus Wi-Fi). Wait, ask Drive where we got to, and carry on.
      if (++retries > 6) throw new Error("Lost connection while uploading. Check your internet and retry.");
      await new Promise((r) => setTimeout(r, 1000 * 2 ** Math.min(retries, 4)));
      try {
        const q = await queryOffset(url, file.size);
        if (q.status === 200 || q.status === 201) return (JSON.parse(q.body) as { id: string }).id;
        if (q.status === 308) offset = q.range ? Number(q.range.split("-")[1]) + 1 : 0;
      } catch {
        /* still offline; loop and retry */
      }
    }
  }
  throw new Error("Upload did not finish.");
}

export function MediaUploader({
  bootcampId,
  today,
  history,
  initialKind,
}: {
  bootcampId: string;
  today: string;
  history: { date: string; folderUrl: string | null; items: Item[] }[];
  initialKind: MediaKind;
}) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<MediaKind>(initialKind);
  const [jobs, setJobs] = useState<Job[]>([]);
  const running = useRef(0);
  const queue = useRef<Job[]>([]);

  const patch = (key: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...p } : j)));

  async function runJob(job: Job) {
    patch(job.key, { state: "uploading", progress: 0, error: undefined });
    try {
      const startRes = await fetch("/api/media/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootcampId, date: job.date, kind: job.kind, name: job.file.name, mimeType: job.file.type || "application/octet-stream", size: job.file.size }),
      });
      const s = (await startRes.json()) as { uploadUrl?: string; fileName?: string; error?: string };
      if (!startRes.ok || !s.uploadUrl) throw new Error(s.error ?? "Could not start the upload.");
      const driveFileId = await uploadToDrive(s.uploadUrl, job.file, (p) => patch(job.key, { progress: p }));
      const done = await fetch("/api/media/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootcampId, date: job.date, kind: job.kind, driveFileId, fileName: s.fileName ?? job.file.name, mimeType: job.file.type, size: job.file.size }),
      });
      if (!done.ok) throw new Error(((await done.json().catch(() => ({}))) as { error?: string }).error ?? "Uploaded, but not recorded.");
      patch(job.key, { state: "done", progress: 100 });
    } catch (e) {
      patch(job.key, { state: "error", error: e instanceof Error ? e.message : "Upload failed." });
    }
  }

  function pump() {
    while (running.current < PARALLEL && queue.current.length) {
      const job = queue.current.shift()!;
      running.current++;
      runJob(job).finally(() => {
        running.current--;
        if (queue.current.length) pump();
        else if (running.current === 0) router.refresh();
      });
    }
  }

  function add(files: File[]) {
    const accepted = files.filter((f) => /^(image|video)\//.test(f.type));
    if (accepted.length < files.length) toast({ tone: "error", text: "Some files were skipped because they aren't photos or videos." });
    const newJobs: Job[] = accepted.map((file) => ({
      key: `${file.name}-${file.size}-${Math.random()}`,
      file,
      kind: kind === "VIDEO" && file.type.startsWith("image/") ? "PHOTO" : kind !== "VIDEO" && file.type.startsWith("video/") ? "VIDEO" : kind,
      date,
      progress: 0,
      state: "queued",
    }));
    setJobs((js) => [...newJobs, ...js]);
    queue.current.push(...newJobs);
    pump();
  }

  function retry(job: Job) {
    const j = { ...job, state: "queued" as const, progress: 0 };
    patch(job.key, j);
    queue.current.push(j);
    pump();
  }

  const active = KINDS.find((k) => k.k === kind)!;
  const uploading = jobs.filter((j) => j.state === "uploading" || j.state === "queued").length;

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="space-y-5">
          <Field label="Class day" htmlFor="md" hint={formatDayLong(date)}>
            <input id="md" type="date" className="field" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <div>
            <span className="label">What are you adding?</span>
            <div className="space-y-1.5" role="radiogroup">
              {KINDS.map((k) => (
                <button
                  key={k.k}
                  role="radio"
                  aria-checked={kind === k.k}
                  onClick={() => setKind(k.k)}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    kind === k.k ? "border-board bg-board-mist" : "border-line bg-surface hover:border-line-strong",
                  )}
                >
                  <k.icon className={clsx("h-[18px] w-[18px]", kind === k.k ? "text-board" : "text-faint")} />
                  <span>
                    <span className="block text-sm font-medium">{k.label}</span>
                    <span className="block text-xs text-muted">{k.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <FileDrop
            accept={kind === "VIDEO" ? "video/*" : kind === "PHOTO" ? "image/*,video/*" : "image/*"}
            multiple
            onFiles={add}
            title={`Drop ${active.label.toLowerCase()} here, or click to choose`}
            hint="On a phone you can take the photo straight from the camera. Large videos are fine; the upload resumes if Wi-Fi drops."
          />
          {jobs.length > 0 && (
            <div className="rounded-xl border border-line bg-surface">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
                <span className="font-medium">{uploading ? `Uploading ${uploading} ${uploading === 1 ? "file" : "files"}` : "Uploads"}</span>
                {!uploading && (
                  <button className="text-[13px] text-muted hover:text-ink" onClick={() => setJobs([])}>
                    Clear list
                  </button>
                )}
              </div>
              <ul className="divide-y divide-line">
                {jobs.map((j) => (
                  <li key={j.key} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={clsx(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        j.state === "done" ? "bg-board-soft text-board" : j.state === "error" ? "bg-absent-soft text-absent" : "bg-paper text-faint",
                      )}
                    >
                      {j.state === "done" ? <Check className="h-4 w-4" /> : j.state === "error" ? <X className="h-4 w-4" /> : j.kind === "VIDEO" ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="truncate">{j.file.name}</span>
                        <span className="num shrink-0 text-xs text-muted">{j.state === "uploading" ? `${Math.round(j.progress)}%` : fmtSize(j.file.size)}</span>
                      </div>
                      {j.state === "uploading" || j.state === "queued" ? (
                        <div className="mt-1.5">
                          <ProgressBar value={j.progress} />
                        </div>
                      ) : j.state === "error" ? (
                        <p className="mt-0.5 text-xs text-absent">{j.error}</p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted">Saved to Drive</p>
                      )}
                    </div>
                    {j.state === "error" && (
                      <Button size="sm" variant="ghost" onClick={() => retry(j)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Retry
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="h-section mb-4">Uploaded so far</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Nothing uploaded yet.</p>
        ) : (
          <div className="space-y-6">
            {history.map((h) => {
              const c = (k: MediaKind) => h.items.filter((i) => i.kind === k).length;
              return (
                <div key={h.date} className="rounded-xl border border-line bg-surface">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
                    <p className="font-medium">{formatDayLong(h.date)}</p>
                    <p className="text-[13px] text-muted">
                      {c("PHOTO")} photos, {c("VIDEO")} videos, {c("END_SNAPSHOT") ? "snapshot added" : <span className="text-absent">no end snapshot</span>}
                      {h.folderUrl && (
                        <>
                          {" "}
                          <a href={h.folderUrl} target="_blank" rel="noreferrer" className="ml-2 text-board hover:underline">
                            Open folder
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
                    {h.items.map((i) => (
                      <li key={i.id} className="flex items-center gap-3 bg-surface px-4 py-2.5">
                        {i.kind === "VIDEO" ? <Film className="h-4 w-4 shrink-0 text-faint" /> : i.kind === "END_SNAPSHOT" ? <Camera className="h-4 w-4 shrink-0 text-board" /> : <ImageIcon className="h-4 w-4 shrink-0 text-faint" />}
                        <div className="min-w-0">
                          {i.link ? (
                            <a href={i.link} target="_blank" rel="noreferrer" className="block truncate text-sm hover:text-board hover:underline">
                              {i.fileName}
                            </a>
                          ) : (
                            <p className="truncate text-sm">{i.fileName}</p>
                          )}
                          <p className="num text-xs text-muted">
                            {new Date(i.createdAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })}, {fmtSize(i.size)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
