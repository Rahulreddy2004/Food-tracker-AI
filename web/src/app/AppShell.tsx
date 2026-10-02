import {
  BookOpen,
  Camera,
  ChartColumn,
  House,
  LogOut,
  MessageCircleHeart,
  Moon,
  Package,
  ScanBarcode,
  Settings,
  Sun,
  SunMoon,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Suspense } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";

import { Logo } from "@/components/brand";
import { OfflineBanner } from "@/components/layout";
import { CalorieRing, MacroBars } from "@/components/nutrition";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useMeals, useProfile, useToday } from "@/lib/api/queries";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { sum } from "@/lib/nutrition";
import { type ThemeChoice, useTheme } from "@/lib/theme";

import { Splash } from "./guards";

const NAV = [
  { to: "/app", label: "Today", icon: House, end: true },
  { to: "/app/diary", label: "Diary", icon: BookOpen },
  { to: "/app/insights", label: "Insights", icon: ChartColumn },
  { to: "/app/coach", label: "Coach", icon: MessageCircleHeart },
  { to: "/app/pantry", label: "Pantry", icon: Package },
  { to: "/app/settings", label: "Settings", icon: Settings },
] as const;

const MOBILE_TABS = [NAV[0], NAV[1], NAV[2], NAV[3]] as const;

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  if (choice === "light") return <Sun />;
  if (choice === "dark") return <Moon />;
  return <SunMoon />;
}

function AccountMenu({ align = "end" }: { align?: "start" | "end" }) {
  const { user, signOut } = useAuth();
  const { choice, setChoice } = useTheme();
  const item =
    "flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm text-ink outline-none select-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-ink-muted";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Account menu"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary-soft text-sm font-semibold text-secondary transition hover:ring-4 hover:ring-secondary-soft/60"
      >
        {initials(user?.displayName, user?.email)}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={8}
          className="z-50 min-w-60 rounded-lg border border-line bg-surface p-1.5 shadow-lift"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{user?.displayName || "Your account"}</p>
            <p className="truncate text-xs text-ink-muted">{user?.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item asChild className={item}>
            <Link to="/app/pantry">
              <Package /> My pantry
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={item}>
            <Link to="/app/settings">
              <Settings /> Settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Label className="px-3 pt-1 pb-1 text-xs font-medium text-ink-subtle">
            Appearance
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={choice}
            onValueChange={(v) => setChoice(v as ThemeChoice)}
          >
            {(["system", "light", "dark"] as const).map((c) => (
              <DropdownMenu.RadioItem
                key={c}
                value={c}
                className={cn(item, "data-[state=checked]:font-semibold")}
              >
                <ThemeIcon choice={c} />
                {c === "system" ? "Match device" : c === "light" ? "Light" : "Dark"}
                <DropdownMenu.ItemIndicator className="ml-auto size-2 rounded-full bg-primary" />
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line px-4 py-6 lg:flex">
      <Link to="/app" className="px-2" aria-label="Food Tracker, today">
        <Logo />
      </Link>
      <div className="mt-8 grid gap-2 px-1">
        <Button asChild size="lg" className="w-full">
          <Link to="/app/scan">
            <Camera /> Scan a meal
          </Link>
        </Button>
        <Button asChild variant="secondary" className="w-full">
          <Link to="/app/barcode">
            <ScanBarcode /> Scan a barcode
          </Link>
        </Button>
      </div>
      <nav aria-label="Main" className="mt-8 grid gap-1">
        {NAV.map(({ to, label, icon: Icon, ...rest }) => (
          <NavLink
            key={to}
            to={to}
            end={"end" in rest}
            className={({ isActive }) =>
              cn(
                "flex h-11 items-center gap-3 rounded-full px-4 text-[0.95rem] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink",
                isActive && "bg-surface text-ink shadow-soft",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn("size-5", isActive && "text-primary")}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-3 px-2">
        <AccountMenu align="start" />
        <p className="text-xs leading-snug text-ink-subtle">
          Estimates from photos. Adjust portions anytime.
        </p>
      </div>
    </aside>
  );
}

function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line/70 bg-bg/85 px-4 backdrop-blur-md lg:hidden">
      <Link to="/app" aria-label="Food Tracker, today">
        <Logo />
      </Link>
      <div className="flex items-center gap-1">
        <Button asChild variant="ghost" size="icon" aria-label="Scan a barcode">
          <Link to="/app/barcode">
            <ScanBarcode />
          </Link>
        </Button>
        <AccountMenu />
      </div>
    </header>
  );
}

function MobileTabBar() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex flex-1 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium text-ink-muted",
      isActive && "text-primary",
    );
  const [today, diary, insights, coach] = MOBILE_TABS;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto flex h-16 max-w-md items-stretch">
        {[today, diary].map(({ to, label, icon: Icon, ...rest }) => (
          <NavLink key={to} to={to} end={"end" in rest} className={tab}>
            <Icon className="size-[1.4rem]" strokeWidth={1.9} />
            {label}
          </NavLink>
        ))}
        <div className="flex flex-1 items-start justify-center">
          <Link
            to="/app/scan"
            aria-label="Scan a meal"
            className="-mt-6 grid size-16 place-items-center rounded-full bg-primary text-primary-fg shadow-lift ring-6 ring-bg transition-transform active:scale-95"
          >
            <Camera className="size-7" />
          </Link>
        </div>
        {[insights, coach].map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={tab}>
            <Icon className="size-[1.4rem]" strokeWidth={1.9} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Today at a glance, beside every page except Today itself (wide screens only). */
function TodayRail() {
  const today = useToday();
  const profile = useProfile();
  const meals = useMeals(today, today);
  const totals = sum((meals.data ?? []).map((m) => m.totals));
  return (
    <aside
      aria-label="Today at a glance"
      className="sticky top-0 hidden h-dvh w-80 shrink-0 border-l border-line px-6 py-8 2xl:block"
    >
      <p className="text-sm font-medium text-ink-muted">Today</p>
      {profile.data && meals.data ? (
        <div className="mt-4 grid justify-items-center gap-6">
          <CalorieRing eaten={totals.kcal} target={profile.data.targets.kcal} size={180} />
          <MacroBars totals={totals} targets={profile.data.targets} className="w-full" />
        </div>
      ) : (
        <div className="mt-6 grid justify-items-center gap-6">
          <Skeleton className="size-44 rounded-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
    </aside>
  );
}

export function AppShell() {
  const profile = useProfile();
  const location = useLocation();
  if (profile.isPending) return <Splash />;
  if (profile.data && !profile.data.onboarded) return <Navigate to="/welcome" replace />;
  const isToday = location.pathname === "/app" || location.pathname === "/app/";
  const isCoach = location.pathname.startsWith("/app/coach");

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <MobileTopBar />
        <main
          id="main"
          className={cn("flex-1 pt-6 pb-28 lg:pt-10 lg:pb-12", isCoach && "pb-24 lg:pb-6")}
        >
          <Suspense
            fallback={
              <div className="container-app grid gap-4">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
      {!isToday && !isCoach && <TodayRail />}
      <MobileTabBar />
    </div>
  );
}
