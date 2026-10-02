import { cn } from "@/lib/cn";

/** Brand mark: a terracotta plate with a fresh leaf. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn("size-9", className)}>
      <circle cx="20" cy="20" r="19" fill="var(--primary)" />
      <circle
        cx="20"
        cy="21.5"
        r="11"
        fill="none"
        stroke="var(--primary-fg)"
        strokeWidth="2.4"
        opacity="0.92"
      />
      <path
        d="M20.4 6.2c4.9 2.2 6.6 7.6 3.6 12.6-.6 1-1.4 1.8-2.3 2.5-1.6-4.3-1.4-9.5-1.3-15.1Z"
        fill="#9cbf5a"
      />
      <path
        d="M21.6 21.2c-1.2-4.4-1.3-9.3-1.2-14.9"
        stroke="#4d7c0f"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact && (
        <span className="font-display text-[1.35rem] leading-none font-semibold tracking-tight">
          Food Tracker<span className="ml-0.5 text-primary">.</span>
        </span>
      )}
    </span>
  );
}

/** Hand-drawn underline used under accent words in headlines. */
export function Squiggle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 18"
      preserveAspectRatio="none"
      aria-hidden
      className={cn("h-3 w-full", className)}
    >
      <path
        d="M2 12.5C30 4 52 4.5 72 9.5s38 7 62 1.5 52-9 84 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
