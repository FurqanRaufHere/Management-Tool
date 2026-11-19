"use client";

import { Button } from "@/components/ui";

export default function BootcampError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-xl font-semibold">This page didn&apos;t load</h1>
      <p className="mt-2 text-sm text-muted">Check your internet connection and try again. Your saved work is safe.</p>
      <div className="mt-6">
        <Button variant="primary" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
