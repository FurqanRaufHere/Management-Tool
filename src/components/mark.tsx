/** The app's mark: a register line with a tick, drawn to sit next to the wordmark. */
export function Mark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2D6A4F" />
      <path d="M8 11h9M8 16h7M8 21h11" stroke="#E3EEE7" strokeWidth="2" strokeLinecap="round" />
      <path d="M19.5 15.5l2.4 2.4 4.6-5.4" stroke="#F2D16B" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
