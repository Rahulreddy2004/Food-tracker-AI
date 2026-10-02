import { Slider as SliderPrimitive, Switch as SwitchPrimitive, ToggleGroup } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Slider({ className, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn("relative flex h-7 w-full touch-none items-center select-none", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 grow overflow-hidden rounded-full bg-surface-3">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={props["aria-label"]}
        className="block size-6 rounded-full border-2 border-primary bg-surface shadow-soft transition-transform hover:scale-110 focus-visible:ring-4 focus-visible:ring-primary/25 focus-visible:outline-none"
      />
    </SliderPrimitive.Root>
  );
}

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-transparent bg-surface-3 p-0.5 transition-colors data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="size-6 rounded-full bg-surface shadow-soft transition-transform data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  "aria-label": string;
  className?: string;
  size?: "sm" | "md";
}

/** Single-choice pill group (arrow keys move between options). */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  className,
  size = "md",
  ...aria
}: SegmentedProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => next && onValueChange(next as T)}
      className={cn("inline-flex gap-1 rounded-full bg-surface-2 p-1", className)}
      {...aria}
    >
      {options.map((opt) => (
        <ToggleGroup.Item
          key={opt.value}
          value={opt.value}
          className={cn(
            "rounded-full font-medium text-ink-muted transition-all hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-soft",
            size === "sm" ? "h-8 px-3 text-sm" : "h-9 px-4 text-sm",
          )}
        >
          {opt.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
