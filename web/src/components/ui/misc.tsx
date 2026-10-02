import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-ink-muted",
        primary: "bg-primary-soft text-primary",
        secondary: "bg-secondary-soft text-secondary",
        accent: "bg-accent-soft text-warning",
        danger: "bg-danger-soft text-danger",
        outline: "border border-line-strong text-ink-muted",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("h-4 skeleton", className)} {...props} />;
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex">
      <LoaderCircle aria-hidden className={cn("size-5 animate-spin text-primary", className)} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-sans text-[0.7rem] text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}
