import { CloudOff, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useOnline } from "@/lib/useMediaQuery";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4 pb-6", className)}>
      <div className="grid gap-1.5">
        {eyebrow && <p className="text-sm font-medium text-primary">{eyebrow}</p>}
        <h1 className="text-[2rem] leading-[1.1] font-semibold sm:text-[2.4rem]">{title}</h1>
        {description && <p className="max-w-prose text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A small plate illustration for empty states. */
function PlateIllustration() {
  return (
    <svg viewBox="0 0 120 90" aria-hidden className="h-24 w-32">
      <ellipse cx="60" cy="74" rx="44" ry="7" fill="var(--surface-3)" />
      <circle
        cx="60"
        cy="44"
        r="34"
        fill="var(--surface)"
        stroke="var(--line-strong)"
        strokeWidth="2"
      />
      <circle
        cx="60"
        cy="44"
        r="23"
        fill="none"
        stroke="var(--line)"
        strokeWidth="2"
        strokeDasharray="3 5"
      />
      <path d="M60 22c7 4 9 12 4 19-1.5 2-3 3-4 4-2-6-2-14 0-23Z" fill="#9cbf5a" />
      <path
        d="M93 18v26m-4-26v10a4 4 0 0 0 8 0V18"
        fill="none"
        stroke="var(--ink-subtle)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M26 18c-3 0-4 6-4 11s2 6 4 6v15"
        fill="none"
        stroke="var(--ink-subtle)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid justify-items-center gap-3 rounded-lg border border-dashed border-line-strong px-6 py-10 text-center",
        className,
      )}
    >
      <PlateIllustration />
      <h2 className="text-xl font-semibold">{title}</h2>
      {children && <p className="max-w-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="grid justify-items-center gap-3 rounded-lg border border-line bg-danger-soft/50 px-6 py-8 text-center"
    >
      <p className="font-medium text-ink">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw /> Try again
        </Button>
      )}
    </div>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-ink px-4 py-2 text-sm text-bg"
    >
      <CloudOff className="size-4" /> You're offline. Changes will need a connection.
    </div>
  );
}
