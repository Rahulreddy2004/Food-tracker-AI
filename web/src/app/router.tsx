import type { ComponentType } from "react";
import { createBrowserRouter } from "react-router";

import LandingPage from "@/features/landing/LandingPage";

import { NotFound, RouteError } from "./RouteError";
import { RedirectIfSignedIn, RequireAuth, Splash } from "./guards";

type Lazy = () => Promise<{ default: ComponentType }>;
const page = (load: Lazy) => async () => ({ Component: (await load()).default });

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    // Shown while a page opened directly (or reloaded) loads its code, instead of a blank screen.
    HydrateFallback: Splash,
    children: [
      // Eager: the public landing page should paint without waiting for another chunk.
      { path: "/", element: <LandingPage /> },
      {
        element: <RedirectIfSignedIn />,
        children: [
          { path: "/sign-in", lazy: page(() => import("@/features/auth/SignInPage")) },
          { path: "/sign-up", lazy: page(() => import("@/features/auth/SignUpPage")) },
          { path: "/reset", lazy: page(() => import("@/features/auth/ResetPage")) },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          { path: "/welcome", lazy: page(() => import("@/features/onboarding/WelcomePage")) },
          {
            path: "/app",
            lazy: async () => ({ Component: (await import("./AppShell")).AppShell }),
            children: [
              { index: true, lazy: page(() => import("@/features/today/TodayPage")) },
              { path: "scan", lazy: page(() => import("@/features/scan/ScanPage")) },
              { path: "barcode", lazy: page(() => import("@/features/barcode/BarcodePage")) },
              { path: "diary", lazy: page(() => import("@/features/diary/DiaryPage")) },
              { path: "insights", lazy: page(() => import("@/features/insights/InsightsPage")) },
              { path: "pantry", lazy: page(() => import("@/features/pantry/PantryPage")) },
              { path: "coach", lazy: page(() => import("@/features/coach/CoachPage")) },
              { path: "settings", lazy: page(() => import("@/features/settings/SettingsPage")) },
            ],
          },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
