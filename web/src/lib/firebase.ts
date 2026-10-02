import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import type { Auth } from "firebase/auth";

import { firebaseEnv } from "@/lib/env";

/**
 * Firebase is used for sign-in and for meal-photo uploads only. All app data goes through the API.
 *
 * Config comes from VITE_FIREBASE_* in development. On Firebase Hosting it is read from the
 * reserved `/__/firebase/init.json` URL instead, so nothing project-specific is baked into the
 * production bundle.
 */
let appPromise: Promise<FirebaseApp> | null = null;

async function loadConfig(): Promise<FirebaseOptions> {
  if (firebaseEnv.apiKey || firebaseEnv.authEmulator) {
    return {
      apiKey: firebaseEnv.apiKey ?? "demo-api-key",
      authDomain: firebaseEnv.authDomain,
      projectId: firebaseEnv.projectId ?? "demo-foodtracker",
      storageBucket: firebaseEnv.storageBucket,
      appId: firebaseEnv.appId,
    };
  }
  const res = await fetch("/__/firebase/init.json");
  if (!res.ok) throw new Error("Firebase config not found. Set VITE_FIREBASE_* in web/.env.local.");
  return (await res.json()) as FirebaseOptions;
}

export function getFirebaseApp(): Promise<FirebaseApp> {
  appPromise ??= Promise.all([loadConfig(), import("firebase/app")]).then(
    ([config, { initializeApp }]) => initializeApp(config),
  );
  return appPromise;
}

let authPromise: Promise<Auth> | null = null;

export function getFirebaseAuth(): Promise<Auth> {
  authPromise ??= Promise.all([getFirebaseApp(), import("firebase/auth")]).then(([app, sdk]) => {
    const { getAuth, connectAuthEmulator } = sdk;
    const auth = getAuth(app);
    if (firebaseEnv.authEmulator) {
      connectAuthEmulator(auth, firebaseEnv.authEmulator, { disableWarnings: true });
    }
    return auth;
  });
  return authPromise;
}

export async function getFirebaseStorage() {
  const [{ getStorage, connectStorageEmulator }, app] = await Promise.all([
    import("firebase/storage"),
    getFirebaseApp(),
  ]);
  const storage = getStorage(app);
  if (firebaseEnv.storageEmulator) {
    const [host, port] = firebaseEnv.storageEmulator.split(":");
    connectStorageEmulator(storage, host ?? "127.0.0.1", Number(port ?? 9199));
  }
  return storage;
}

export const photosEnabled = Boolean(firebaseEnv.storageBucket || firebaseEnv.storageEmulator);
