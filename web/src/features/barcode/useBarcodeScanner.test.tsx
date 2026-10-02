import { act, render, screen, waitFor } from "@testing-library/react";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { StrictMode, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBarcodeScanner } from "./useBarcodeScanner";

const zxing = vi.hoisted(() => ({
  hints: [] as unknown[],
  live: 0,
  maxLive: 0,
}));

// Each decodeFromConstraints call is one camera session on the <video>, live until stopped.
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatOneDReader: class {
    constructor(hints: unknown) {
      zxing.hints.push(hints);
    }
    async decodeFromConstraints() {
      zxing.live += 1;
      zxing.maxLive = Math.max(zxing.maxLive, zxing.live);
      await new Promise((r) => setTimeout(r, 5));
      let stopped = false;
      return {
        stop: () => {
          if (!stopped) zxing.live -= 1;
          stopped = true;
        },
      };
    }
  },
}));

function fakeStream() {
  const track = { stop: vi.fn() };
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
}

function Harness({ enabled, onCode }: { enabled: boolean; onCode: (code: string) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const status = useBarcodeScanner(ref, enabled, onCode);
  return (
    <>
      <video ref={ref} />
      <p data-testid="status">{status}</p>
    </>
  );
}

const getUserMedia = vi.fn<(c: MediaStreamConstraints) => Promise<MediaStream>>();

beforeEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
  zxing.hints = [];
  zxing.live = 0;
  zxing.maxLive = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  getUserMedia.mockReset();
  delete (window as { BarcodeDetector?: unknown }).BarcodeDetector;
});

describe("useBarcodeScanner with ZXing", () => {
  it("looks for product barcodes only", async () => {
    render(<Harness enabled onCode={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("scanning"));

    const hints = zxing.hints[0] as Map<DecodeHintType, BarcodeFormat[]>;
    expect([...hints.keys()]).toEqual([DecodeHintType.POSSIBLE_FORMATS]);
    expect(hints.get(DecodeHintType.POSSIBLE_FORMATS)).toEqual([
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ]);
  });

  it("never runs two camera sessions at once, even when React mounts twice", async () => {
    const { unmount } = render(
      <StrictMode>
        <Harness enabled onCode={vi.fn()} />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("scanning"));

    expect(zxing.maxLive).toBe(1);
    expect(zxing.live).toBe(1);
    unmount();
    expect(zxing.live).toBe(0);
  });
});

describe("useBarcodeScanner with the browser's BarcodeDetector", () => {
  const detect = vi.fn<() => Promise<{ rawValue: string }[]>>();
  beforeEach(() => {
    detect.mockReset().mockResolvedValue([]);
    Object.defineProperty(window, "BarcodeDetector", {
      configurable: true,
      value: class {
        detect = detect;
      },
    });
  });

  it("reads a code once and turns the camera off", async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    detect.mockResolvedValue([{ rawValue: "3017620422003" }]);
    const onCode = vi.fn();

    render(<Harness enabled onCode={onCode} />);

    await waitFor(() => expect(onCode).toHaveBeenCalledWith("3017620422003"));
    expect(onCode).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalled();
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
  });

  it("turns the camera off when stopped while the video is starting", async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    let played!: () => void;
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockReturnValue(
      new Promise<void>((resolve) => {
        played = resolve;
      }),
    );

    const { rerender } = render(<Harness enabled onCode={vi.fn()} />);
    await waitFor(() => expect(play).toHaveBeenCalled());
    rerender(<Harness enabled={false} onCode={vi.fn()} />);
    await act(async () => {
      played();
      await new Promise((r) => setTimeout(r, 300));
    });

    expect(track.stop).toHaveBeenCalled();
    expect(detect).not.toHaveBeenCalled();
  });
});
