import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { Drawer as VaulDrawer } from "vaul";

import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/useMediaQuery";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(28_23_20/0.45)] backdrop-blur-[2px] data-[state=open]:animate-[fade-up_200ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-lift focus:outline-none",
          className,
        )}
        {...props}
      >
        <div className="grid gap-1 pr-8">
          <DialogPrimitive.Title className="text-xl font-semibold">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-sm text-ink-muted">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
        </div>
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute top-4 right-4 grid size-9 place-items-center rounded-full text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: SheetProps) {
  const desktop = useMediaQuery("(min-width: 40rem)");
  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent title={title} description={description} className={className}>
          {children}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <VaulDrawer.Root open={open} onOpenChange={onOpenChange}>
      <VaulDrawer.Portal>
        <VaulDrawer.Overlay className="fixed inset-0 z-50 bg-[rgb(28_23_20/0.45)]" />
        <VaulDrawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-xl border border-line bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lift focus:outline-none",
            className,
          )}
        >
          <div aria-hidden className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-line-strong" />
          <div className="grid gap-1 px-5 pt-2 pb-3">
            <VaulDrawer.Title className="text-xl font-semibold">{title}</VaulDrawer.Title>
            <VaulDrawer.Description className={description ? "text-sm text-ink-muted" : "sr-only"}>
              {description ?? title}
            </VaulDrawer.Description>
          </div>
          <div className="overflow-y-auto px-5 pb-2">{children}</div>
        </VaulDrawer.Content>
      </VaulDrawer.Portal>
    </VaulDrawer.Root>
  );
}
