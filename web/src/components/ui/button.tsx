import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-150 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg shadow-soft hover:bg-primary-hover",
        secondary: "border border-line-strong bg-surface text-ink shadow-soft hover:bg-surface-2",
        soft: "bg-primary-soft text-primary-ink hover:bg-primary-soft/70",
        ghost: "text-ink-muted hover:bg-surface-2 hover:text-ink",
        danger: "bg-danger text-white hover:opacity-90 dark:text-bg",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 rounded-full px-3.5 text-sm [&_svg]:size-4",
        md: "h-11 rounded-full px-5 text-[0.95rem] [&_svg]:size-[1.15rem]",
        lg: "h-13 rounded-full px-7 text-base [&_svg]:size-5",
        icon: "size-11 rounded-full [&_svg]:size-5",
        "icon-sm": "size-9 rounded-full [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
