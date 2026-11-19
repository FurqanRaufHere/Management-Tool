"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { editClassTimes, endClass, startClass } from "@/app/actions/session";
import { Button, Dialog, Field, useToast } from "./ui";

export function StartClassButton({ bootcampId }: { bootcampId: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="primary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await startClass(bootcampId);
          if (!r.ok) return toast({ tone: "error", text: r.error });
          toast({ tone: "ok", text: "Class started. Start time logged." });
          router.refresh();
        })
      }
    >
      Start class now
    </Button>
  );
}

export function EndClassButton({ bootcampId }: { bootcampId: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setConfirm(true)}>
        End class
      </Button>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="End class now?" description="This logs the current time as the end of today's class.">
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirm(false)}>Not yet</Button>
          <Button
            variant="primary"
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await endClass(bootcampId);
                setConfirm(false);
                if (!r.ok) return toast({ tone: "error", text: r.error });
                toast({ tone: "ok", text: "Class ended. End time logged." });
                router.refresh();
              })
            }
          >
            End class
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export function EditTimesButton({
  bootcampId,
  date,
  start: initialStart,
  end: initialEnd,
  topic: initialTopic,
  label = "Edit times",
}: {
  bootcampId: string;
  date: string;
  start: string;
  end: string;
  topic: string;
  label?: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(initialStart);
  const [e, setE] = useState(initialEnd);
  const [topic, setTopic] = useState(initialTopic);
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setS(initialStart);
          setE(initialEnd);
          setTopic(initialTopic);
          setError(null);
          setOpen(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" /> {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Class times" description="Use this if you forgot to press Start or End, or pressed it late.">
        <form
          className="space-y-5"
          onSubmit={(ev) => {
            ev.preventDefault();
            setError(null);
            run(async () => {
              const r = await editClassTimes(bootcampId, date, s, e, topic);
              if (!r.ok) return setError(r.error);
              setOpen(false);
              toast({ tone: "ok", text: "Class times saved." });
              router.refresh();
            });
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Started at" htmlFor="ts">
              <input id="ts" type="time" className="field" value={s} onChange={(x) => setS(x.target.value)} />
            </Field>
            <Field label="Ended at" htmlFor="te">
              <input id="te" type="time" className="field" value={e} onChange={(x) => setE(x.target.value)} />
            </Field>
          </div>
          <Field label="Topic covered" htmlFor="topic" hint="Optional. Appears in the supervisor report.">
            <input id="topic" className="field" value={topic} onChange={(x) => setTopic(x.target.value)} placeholder="Lists, loops and the weekly lab" />
          </Field>
          {error && <p className="text-sm text-absent">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Save times
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
