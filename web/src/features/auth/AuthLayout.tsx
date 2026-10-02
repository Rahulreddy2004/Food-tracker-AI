import type { ReactNode } from "react";
import { Link } from "react-router";

import { Logo } from "@/components/brand";
import dishes from "@/data/dishes.json";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <main className="flex flex-col px-5 py-6 sm:px-10">
        <Link to="/" className="self-start" aria-label="Food Tracker home">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-[2.2rem] leading-tight font-semibold">{title}</h1>
          <p className="mt-2 text-ink-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-8 text-center text-sm text-ink-muted">{footer}</p>
        </div>
      </main>
      <aside aria-hidden className="relative hidden overflow-hidden p-6 lg:block">
        <div className="relative h-full overflow-hidden rounded-xl bg-surface-3">
          <img
            src="/images/palak-paneer-640.webp"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgb(28_23_20/0.75)] via-[rgb(28_23_20/0.1)] to-transparent" />
          <div className="absolute inset-x-8 bottom-8 text-[#fbf7f0]">
            <p className="font-display text-[1.9rem] leading-snug font-medium">
              A photo, a quick check, and dinner's logged.
            </p>
            <p className="mt-3 text-sm text-[#fbf7f0]/80">
              Recognises {dishes.length} dishes · estimates portions · you stay in control
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8h-4v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
      />
    </svg>
  );
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs font-medium tracking-wide text-ink-subtle uppercase">
      <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
    </div>
  );
}
