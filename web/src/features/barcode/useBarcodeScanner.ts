import { type RefObject, useEffect, useRef, useState } from "react";

export type ScannerStatus = "idle" | "starting" | "scanning" | "denied" | "unavailable" | "error";

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

/** Product barcodes only: the codes Open Food Facts knows. */
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
const CAMERA: MediaStreamConstraints = {
  video: { facingMode: { ideal: "environment" } },
  audio: false,
};

/**
 * Live barcode scanning. Uses the browser's BarcodeDetector where available (Chrome on Android
 * and macOS) and falls back to ZXing (loaded only when needed). Stops after the first read;
 * `enabled` restarts it.
 */
export function useBarcodeScanner(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onCode: (code: string) => void,
): ScannerStatus {
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const onCodeRef = useRef(onCode);
  // Settles once the previous camera session has fully stopped.
  const previous = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let release: () => void = () => undefined;
    // Keeps what was just started so cleanup can stop it, or stops it at once if this session
    // ended while it was starting. Returns whether to carry on.
    const hold = (stop: () => void) => {
      release = stop;
      if (stopped) stop();
      return !stopped;
    };
    const found = (code: string) => {
      if (stopped) return;
      stopped = true;
      release();
      setStatus("idle");
      onCodeRef.current(code);
    };

    const start = async () => {
      setStatus("starting");
      const media = (navigator as Partial<Navigator>).mediaDevices;
      if (!media || typeof media.getUserMedia !== "function") {
        setStatus("unavailable");
        return;
      }
      const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector;
      try {
        if (Native) {
          const stream = await media.getUserMedia(CAMERA);
          const stopTracks = () => stream.getTracks().forEach((t) => t.stop());
          if (!hold(stopTracks)) return;
          video.srcObject = stream;
          await video.play().catch(() => undefined);
          if (stopped) return;
          const detector = new Native({ formats: FORMATS });
          const timer = window.setInterval(() => {
            if (video.readyState < 2) return;
            detector
              .detect(video)
              .then((codes) => {
                const value = codes[0]?.rawValue;
                if (value && /^\d{8,14}$/.test(value)) found(value);
              })
              .catch(() => undefined);
          }, 250);
          hold(() => {
            window.clearInterval(timer);
            stopTracks();
          });
        } else {
          const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] =
            await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
          if (stopped) return;
          const hints = new Map([
            [
              DecodeHintType.POSSIBLE_FORMATS,
              [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E],
            ],
          ]);
          const reader = new BrowserMultiFormatOneDReader(hints);
          const controls = await reader.decodeFromConstraints(CAMERA, video, (result) => {
            const value = result?.getText();
            if (value && /^\d{8,14}$/.test(value)) found(value);
          });
          if (!hold(() => controls.stop())) return;
        }
        setStatus("scanning");
      } catch (err) {
        if (stopped) return;
        const name = err instanceof DOMException ? err.name : "";
        setStatus(
          name === "NotAllowedError"
            ? "denied"
            : name === "NotFoundError"
              ? "unavailable"
              : "error",
        );
      }
    };

    // One camera session at a time. React's development double-mount, or a quick restart, would
    // otherwise start a second stream on the same <video> while the first is still starting, and
    // stopping the first would then blank the second.
    const run = previous.current.then(() => (stopped ? undefined : start()));
    previous.current = run.catch(() => undefined);
    return () => {
      stopped = true;
      release();
    };
  }, [enabled, videoRef]);

  return enabled ? status : "idle";
}
