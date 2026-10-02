import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { createContext, type ReactNode, use, useEffect, useMemo, useState } from "react";

import { getFirebaseAuth } from "@/lib/firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    getFirebaseAuth()
      .then((auth) => {
        unsubscribe = onIdTokenChanged(auth, (next) => {
          setUser(next);
          setLoading(false);
        });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Sign-in is unavailable");
        setLoading(false);
      });
    return () => unsubscribe?.();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      error,
      async signIn(email, password) {
        await signInWithEmailAndPassword(await getFirebaseAuth(), email, password);
      },
      async signUp(name, email, password) {
        const cred = await createUserWithEmailAndPassword(await getFirebaseAuth(), email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
      },
      async signInWithGoogle() {
        await signInWithPopup(await getFirebaseAuth(), new GoogleAuthProvider());
      },
      async resetPassword(email) {
        await sendPasswordResetEmail(await getFirebaseAuth(), email);
      },
      async signOut() {
        await fbSignOut(await getFirebaseAuth());
      },
    }),
    [user, loading, error],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Current user's ID token (refreshed by Firebase when it is close to expiry). */
export async function currentIdToken(): Promise<string | null> {
  const auth = await getFirebaseAuth();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

const FRIENDLY: Record<string, string> = {
  "auth/invalid-credential":
    "That email and password don't match. Try again or reset your password.",
  "auth/wrong-password": "That email and password don't match.",
  "auth/user-not-found": "There's no account with that email yet.",
  "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
  "auth/weak-password": "Use at least 8 characters for your password.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/too-many-requests": "Too many attempts. Please wait a minute and try again.",
  "auth/network-request-failed": "You seem to be offline. Check your connection.",
  "auth/popup-closed-by-user": "The Google window was closed before signing in.",
};

export function authErrorMessage(err: unknown): string {
  const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
  return FRIENDLY[code] ?? "Something went wrong. Please try again.";
}
