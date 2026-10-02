const env = import.meta.env;

export const API_URL: string = (env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export const firebaseEnv = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  authEmulator: env.VITE_FIREBASE_AUTH_EMULATOR as string | undefined,
  storageEmulator: env.VITE_FIREBASE_STORAGE_EMULATOR as string | undefined,
};
