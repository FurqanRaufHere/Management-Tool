import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-sm text-muted">Page not found</p>
      <h1 className="mt-2 text-2xl font-semibold">This page doesn&apos;t exist, or you don&apos;t have access to it.</h1>
      <div className="mt-6">
        <Button href="/?all=1" variant="primary">Back to your bootcamps</Button>
      </div>
    </main>
  );
}
