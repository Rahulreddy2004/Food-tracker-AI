import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { safeStorage } from "@/lib/storage";

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "ft-theme";

interface ThemeState {
  choice: ThemeChoice;
  resolved: "light" | "dark";
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readChoice(): ThemeChoice {
  const stored = safeStorage.get(KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (choice === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);
    const resolvedDark = choice === "dark" || (choice === "system" && systemDark);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", resolvedDark ? "#1c1714" : "#fbf7f0");
  }, [choice, systemDark]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    if (next === "system") safeStorage.remove(KEY);
    else safeStorage.set(KEY, next);
  }, []);

  const value = useMemo<ThemeState>(
    () => ({
      choice,
      resolved: choice === "system" ? (systemDark ? "dark" : "light") : choice,
      setChoice,
    }),
    [choice, systemDark, setChoice],
  );
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeState {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
