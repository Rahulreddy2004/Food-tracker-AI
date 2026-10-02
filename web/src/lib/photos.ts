import { useQuery } from "@tanstack/react-query";

import { getFirebaseStorage, photosEnabled } from "@/lib/firebase";
import { makeThumbnail } from "@/lib/image";

/** Upload a meal thumbnail to users/{uid}/meals/{id}.webp. Returns the storage path, or null. */
export async function uploadMealPhoto(uid: string, source: Blob): Promise<string | null> {
  if (!photosEnabled) return null;
  try {
    const thumb = await makeThumbnail(source);
    if (!thumb) return null;
    const { ref, uploadBytes } = await import("firebase/storage");
    const storage = await getFirebaseStorage();
    const path = `users/${uid}/meals/${crypto.randomUUID()}.webp`;
    await uploadBytes(ref(storage, path), thumb, {
      contentType: "image/webp",
      cacheControl: "private, max-age=31536000",
    });
    return path;
  } catch {
    return null; // A missing photo should never block logging the meal.
  }
}

export function usePhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["photo", path],
    queryFn: async () => {
      const { ref, getDownloadURL } = await import("firebase/storage");
      return getDownloadURL(ref(await getFirebaseStorage(), path ?? ""));
    },
    enabled: Boolean(path) && photosEnabled,
    staleTime: Infinity,
    retry: false,
  });
}
