import { Navigate, Outlet, useLocation } from "react-router";

import { LogoMark } from "@/components/brand";
import { Spinner } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="grid justify-items-center gap-4">
        <LogoMark className="size-12 animate-pulse" />
        <Spinner />
      </div>
    </div>
  );
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  return <Outlet />;
}

export function RedirectIfSignedIn() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (user) {
    const next = new URLSearchParams(location.search).get("next");
    return <Navigate to={next?.startsWith("/") ? next : "/app"} replace />;
  }
  return <Outlet />;
}
