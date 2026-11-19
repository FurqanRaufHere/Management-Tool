export default function Loading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="h-9 w-72 animate-pulse rounded-lg bg-line/70" />
      <div className="h-32 animate-pulse rounded-xl bg-line/50" />
      <div className="h-64 animate-pulse rounded-xl bg-line/40" />
    </div>
  );
}
