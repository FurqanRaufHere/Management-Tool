"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FolderCheck } from "lucide-react";
import { addCoTa, cancelInvite, connectDriveFolder, disconnectDriveFolder, removeMember, setArchived } from "@/app/actions/bootcamp";
import { Button, Field, useToast } from "@/components/ui";

export function DriveSettings({ bootcampId, folderId, folderName }: { bootcampId: string; folderId: string | null; folderName: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section id="drive" className="scroll-mt-24">
      <h2 className="h-section">Google Drive folder</h2>
      <p className="mb-4 mt-1 text-sm text-muted">Class photos and videos are saved here, with a new folder for each class day.</p>
      {folderId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <FolderCheck className="h-5 w-5 shrink-0 text-board" />
            <div className="min-w-0">
              <a href={`https://drive.google.com/drive/folders/${folderId}`} target="_blank" rel="noreferrer" className="block truncate font-medium hover:text-board hover:underline">
                {folderName ?? "Drive folder"}
              </a>
              <p className="text-xs text-muted">Connected</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await disconnectDriveFolder(bootcampId);
                if (!r.ok) return toast({ tone: "error", text: r.error });
                router.refresh();
              })
            }
          >
            Change folder
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await connectDriveFolder(bootcampId, link);
              if (!r.ok) return setError(r.error);
              toast({ tone: "ok", text: `Connected to "${r.data.name}".` });
              setLink("");
              router.refresh();
            });
          }}
        >
          <Field label="Folder link" htmlFor="dl" hint="Open the folder in Google Drive and copy the address from your browser. You need Editor access.">
            <input id="dl" className="field" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
          </Field>
          {error && <p className="text-sm text-absent">{error}</p>}
          <Button type="submit" variant="primary" loading={pending} disabled={!link.trim()}>
            Connect folder
          </Button>
        </form>
      )}
    </section>
  );
}

export function TeamSettings({
  bootcampId,
  currentUserId,
  team,
  invites,
}: {
  bootcampId: string;
  currentUserId: string;
  team: { userId: string; role: "OWNER" | "TA"; name: string; email: string }[];
  invites: { id: string; email: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notAllowed, setNotAllowed] = useState<{ canAllow: boolean } | null>(null);
  const [pending, start] = useTransition();

  function add(allow: boolean) {
    setError(null);
    start(async () => {
      const r = await addCoTa(bootcampId, email, { allow });
      if (!r.ok) return setError(r.error);
      if (r.data.status === "not_allowed") return setNotAllowed({ canAllow: r.data.canAllow });
      toast({ tone: "ok", text: r.data.status === "pending" ? `${email} will join when they first sign in.` : `${email} added.` });
      setEmail("");
      setNotAllowed(null);
      router.refresh();
    });
  }

  return (
    <section>
      <h2 className="h-section">Teaching assistants</h2>
      <p className="mb-4 mt-1 text-sm text-muted">Anyone here can upload attendance, send emails and send reports for this bootcamp.</p>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {team.map((t) => (
          <li key={t.userId} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {t.name}
                {t.userId === currentUserId && <span className="font-normal text-muted"> (you)</span>}
              </p>
              <p className="truncate text-xs text-muted">
                {t.email}
                {t.role === "OWNER" ? ", owner" : ""}
              </p>
            </div>
            {t.userId !== currentUserId && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  start(async () => {
                    const r = await removeMember(bootcampId, t.userId);
                    if (!r.ok) return toast({ tone: "error", text: r.error });
                    router.refresh();
                  })
                }
              >
                Remove
              </Button>
            )}
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm">{i.email}</p>
              <p className="text-xs text-leave">Joins the first time they sign in</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                start(async () => {
                  const r = await cancelInvite(bootcampId, i.id);
                  if (!r.ok) return toast({ tone: "error", text: r.error });
                  router.refresh();
                })
              }
            >
              Cancel
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          add(false);
        }}
      >
        <input
          type="email"
          className="field"
          placeholder="Co-TA's Google email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setNotAllowed(null);
          }}
          aria-label="Co-TA email"
        />
        <Button type="submit" loading={pending} disabled={!email.trim()}>
          Add TA
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-absent">{error}</p>}
      {notAllowed && (
        <div className="mt-3 rounded-lg border border-leave/25 bg-leave-soft px-4 py-3 text-sm text-leave">
          <p>This person isn&apos;t on TA Desk yet. Ask an admin to add them first.</p>
          {notAllowed.canAllow && (
            <Button size="sm" className="mt-3" loading={pending} onClick={() => add(true)}>
              Add {email.trim()} to TA Desk and this bootcamp
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export function ArchiveSetting({ bootcampId, archived }: { bootcampId: string; archived: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <section className="border-t border-line pt-8">
      <h2 className="h-section">{archived ? "This bootcamp is finished" : "Finish this bootcamp"}</h2>
      <p className="mb-4 mt-1 text-sm text-muted">
        {archived ? "It's hidden from your list. Records are kept." : "Hides it from your list once the batch is over. All records are kept."}
      </p>
      <Button
        variant={archived ? "secondary" : "danger"}
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await setArchived(bootcampId, !archived);
            if (!r.ok) return toast({ tone: "error", text: r.error });
            toast({ tone: "ok", text: archived ? "Bootcamp restored." : "Bootcamp marked as finished." });
            router.refresh();
          })
        }
      >
        {archived ? "Restore bootcamp" : "Mark as finished"}
      </Button>
    </section>
  );
}
