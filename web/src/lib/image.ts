/**
 * Prepare photos in the browser before upload: apply EXIF orientation, shrink to the size the
 * models use (long side ≤ 1280 px) and re-encode. Uploads get ~10× smaller and the server sees a
 * consistent resolution. HEIC files the browser can't decode are sent as-is (the API reads HEIC).
 */
export interface PreparedImage {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

async function decode(source: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
}

function encode(
  bitmap: ImageBitmap,
  maxSide: number,
  type: string,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, width, height }) : reject(new Error("Encoding failed"))),
      type,
      quality,
    ),
  );
}

export async function prepareForScan(source: Blob, maxSide = 1280): Promise<PreparedImage> {
  const bitmap = await decode(source);
  if (!bitmap) return { blob: source, url: URL.createObjectURL(source), width: 0, height: 0 };
  try {
    const { blob, width, height } = await encode(bitmap, maxSide, "image/jpeg", 0.88);
    return { blob, url: URL.createObjectURL(blob), width, height };
  } finally {
    bitmap.close();
  }
}

/** Small WebP for the diary (≤ 512 px). */
export async function makeThumbnail(source: Blob): Promise<Blob | null> {
  const bitmap = await decode(source);
  if (!bitmap) return null;
  try {
    return (await encode(bitmap, 512, "image/webp", 0.8)).blob;
  } finally {
    bitmap.close();
  }
}
