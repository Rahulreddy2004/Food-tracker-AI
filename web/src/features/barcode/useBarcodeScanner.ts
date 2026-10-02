import { type RefObject, useEffect, useRef, useState } from "react";

export type ScannerStatus = "idle" | "starting" | "scanning" | "denied" | "unavailable" | "error";

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

/**
 * Live barcode scanning. Uses the browser's BarcodeDetector where available (Chrome/Android) and
 * falls back to ZXing (loaded only when needed). Stops after the first read; `enabled` restarts it.
 */
export function useBarcodeScanner(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onCode: (code: string) => void,
): ScannerStatus {
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let cleanup: () => void = () => undefined;
    const found = (code: string) => {
      if (stopped) return;
      stopped = true;
      cleanup();
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
          const stream = await media.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          });
          if (stopped) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          video.srcObject = stream;
          await video.play().catch(() => undefined);
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
          cleanup = () => {
            window.clearInterval(timer);
            stream.getTracks().forEach((t) => t.stop());
          };
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: "environment" } }, audio: false },
            video,
            (result) => {
              const value = result?.getText();
              if (value && /^\d{8,14}$/.test(value)) found(value);
            },
          );
          cleanup = () => controls.stop();
          if (stopped) cleanup();
        }
        if (!stopped) setStatus("scanning");
      } catch (err) {
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
    void start();
    return () => {
      stopped = true;
      cleanup();
    };
  }, [enabled, videoRef]);

  return enabled ? status : "idle";
}
