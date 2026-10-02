import { Link, isRouteErrorResponse, useRouteError } from "react-router";

import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="grid max-w-md justify-items-center gap-5 text-center">
        <Logo />
        <h1 className="text-3xl font-semibold">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  const chunkFailed =
    error instanceof Error && /dynamically imported module|Loading chunk/i.test(error.message);
  return (
    <Frame title={chunkFailed ? "A new version is ready" : "Something went wrong"}>
      <p className="text-ink-muted">
        {chunkFailed
          ? "Reload to get the latest version of the app."
          : "Sorry about that. Reloading usually fixes it — your logged meals are safe."}
      </p>
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </Frame>
  );
}

export function NotFound() {
  return (
    <Frame title="This page isn't on the menu">
      <p className="text-ink-muted">The link may be old, or the page has moved.</p>
      <Button asChild>
        <Link to="/">Back to the start</Link>
      </Button>
    </Frame>
  );
}
