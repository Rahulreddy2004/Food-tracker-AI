import { Camera, CameraOff, RefreshCcw, Zap, ZapOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

type CameraError = "denied" | "missing" | "unsupported" | "failed";

const MESSAGES: Record<CameraError, string> = {
  denied: "Camera access is blocked. Allow it in your browser's site settings, or upload a photo.",
  missing: "We couldn't find a camera on this device.",
  unsupported: "This browser can't open the camera here. Upload a photo instead.",
  failed: "The camera didn't start. Try again or upload a photo.",
};

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

export function CameraCapture({
  onCapture,
  onUseUpload,
}: {
  onCapture: (blob: Blob) => void;
  onUseUpload: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<CameraError | null>(null);
  const [torch, setTorch] = useState<{ available: boolean; on: boolean }>({
    available: false,
    on: false,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Undefined on insecure origins and some in-app browsers, despite what the DOM types say.
    const media = (navigator as Partial<Navigator>).mediaDevices;
    if (!media || typeof media.getUserMedia !== "function") {
      queueMicrotask(() => setError("unsupported"));
      return;
    }
    media
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        const track = stream.getVideoTracks()[0];
        const getCaps = (track as Partial<MediaStreamTrack> | undefined)?.getCapabilities;
        const caps = (getCaps ? getCaps.call(track) : {}) as TorchCapabilities;
        setTorch({ available: Boolean(caps.torch), on: false });
        setError(null);
        setReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "missing"
              : "failed",
        );
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setReady(false);
    };
  }, [facing, attempt]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => blob && onCapture(blob), "image/jpeg", 0.92);
  }, [onCapture]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch({ available: true, on: next });
    } catch {
      setTorch({ available: false, on: false });
    }
  };

  if (error) {
    return (
      <div className="grid aspect-[4/3] w-full place-content-center justify-items-center gap-4 rounded-xl border border-line bg-surface-2 p-8 text-center">
        <CameraOff className="size-10 text-ink-subtle" aria-hidden />
        <p className="max-w-sm text-ink-muted">{MESSAGES[error]}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {error !== "unsupported" && error !== "missing" && (
            <Button variant="secondary" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </Button>
          )}
          <Button onClick={onUseUpload}>Upload a photo</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#1c1714] shadow-lift">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Camera preview"
          className={cn("h-full w-full object-cover", facing === "user" && "-scale-x-100")}
        />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center">
            <Spinner className="text-[#fbf7f0]" label="Starting camera" />
          </div>
        )}
        {/* Framing guides */}
        <div aria-hidden className="pointer-events-none absolute inset-6 sm:inset-10">
          {[
            "top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
            "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
            "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
            "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl",
          ].map((c) => (
            <span key={c} className={cn("absolute size-10 border-[#fbf7f0]/85", c)} />
          ))}
        </div>
        <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-[#fbf7f0]/90 drop-shadow">
          Fit the whole plate in the frame
        </p>
      </div>
      <div className="flex items-center justify-center gap-6">
        <Button
          variant="secondary"
          size="icon"
          aria-label="Switch camera"
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
        >
          <RefreshCcw />
        </Button>
        <button
          type="button"
          onClick={capture}
          disabled={!ready}
          aria-label="Take photo"
          className="grid size-20 place-items-center rounded-full bg-primary text-primary-fg shadow-lift ring-4 ring-primary-soft transition-transform active:scale-95 disabled:opacity-50"
        >
          <Camera className="size-8" />
        </button>
        <Button
          variant="secondary"
          size="icon"
          aria-label={torch.on ? "Turn flash off" : "Turn flash on"}
          aria-pressed={torch.on}
          disabled={!torch.available}
          onClick={() => void toggleTorch()}
        >
          {torch.on ? <ZapOff /> : <Zap />}
        </Button>
      </div>
    </div>
  );
}
