import { ImagePlus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Drag & drop, file picker, or paste (⌘/Ctrl+V) an image. */
export function PhotoDrop({ onFile }: { onFile: (file: Blob) => void }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (file) onFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFile]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = Array.from(e.dataTransfer.files).find(
          (f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name),
        );
        if (file) onFile(file);
      }}
      className={cn(
        "grid aspect-[4/3] w-full place-content-center justify-items-center gap-4 rounded-xl border-2 border-dashed bg-surface p-8 text-center transition-colors",
        dragging ? "border-primary bg-primary-soft/50" : "border-line-strong",
      )}
    >
      <span className="grid size-16 place-items-center rounded-full bg-primary-soft text-primary">
        <ImagePlus className="size-8" aria-hidden />
      </span>
      <div>
        <p className="font-display text-2xl font-semibold">Drop a meal photo here</p>
        <p className="mt-1 text-sm text-ink-muted">JPEG, PNG, WebP or HEIC · or paste an image</p>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*,.heic,.heif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <Button onClick={() => inputRef.current?.click()}>Choose a photo</Button>
    </div>
  );
}
