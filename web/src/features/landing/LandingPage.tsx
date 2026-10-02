import {
  ArrowRight,
  Camera,
  ChartColumn,
  CircleCheck,
  Download,
  Lock,
  MessageCircleHeart,
  Package,
  ScanBarcode,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { lazy, Suspense, useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router";

import { Logo, Squiggle } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import dishes from "@/data/dishes.json";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useTitle } from "@/lib/useTitle";

const DemoScan = lazy(() => import("./DemoScan").then((m) => ({ default: m.DemoScan })));

function DemoPlaceholder() {
  return (
    <div className="mx-auto aspect-square w-full max-w-[34rem] overflow-hidden rounded-xl border border-line bg-surface-3 shadow-lift">
      <img
        src="/images/palak-paneer-640.webp"
        alt=""
        width={640}
        height={640}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function Nav() {
  const { user } = useAuth();
  return (
    <header className="container-app flex h-20 items-center justify-between">
      <Link to="/" aria-label="Food Tracker home">
        <Logo />
      </Link>
      <nav
        aria-label="Sections"
        className="hidden items-center gap-8 text-sm font-medium text-ink-muted md:flex"
      >
        <a href="#how" className="hover:text-ink">
          How it works
        </a>
        <a href="#features" className="hover:text-ink">
          Features
        </a>
        <a href="#accuracy" className="hover:text-ink">
          Accuracy
        </a>
        <a href="#privacy" className="hover:text-ink">
          Privacy
        </a>
      </nav>
      <div className="flex items-center gap-2">
        {user ? (
          <Button asChild>
            <Link to="/app">
              Open the app <ArrowRight />
            </Link>
          </Button>
        ) : (
          <>
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/sign-in">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/sign-up">Get started</Link>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="container-app grid items-center gap-16 pt-6 pb-24 lg:grid-cols-[1.05fr_1fr] lg:pt-14">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm font-medium text-ink-muted shadow-soft">
          <span className="size-2 rounded-full bg-secondary" /> Food recognition + a friendly
          nutrition coach
        </p>
        <h1 className="mt-6 text-[3rem] leading-[1.02] font-semibold sm:text-[4.2rem]">
          Snap your plate.
          <br />
          <span className="relative inline-block">
            Know your food.
            <Squiggle className="absolute -bottom-2 left-0 text-primary" />
          </span>
        </h1>
        <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-muted">
          Take a photo of your meal. Food Tracker finds each dish, estimates the portion and logs
          calories and macros — then a coach that knows your goals helps you plan what's next.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/sign-up">
              <Camera /> Start with a photo
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <a href="#how">See how it works</a>
          </Button>
        </div>
        <ul className="mt-9 grid gap-2.5 text-sm text-ink-muted sm:grid-cols-3">
          {[
            `${dishes.length} dishes recognised`,
            "Portions you can adjust",
            "Your data, deletable anytime",
          ].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <CircleCheck className="size-4 shrink-0 text-secondary" /> {t}
            </li>
          ))}
        </ul>
      </div>
      <Suspense fallback={<DemoPlaceholder />}>
        <DemoScan />
      </Suspense>
    </section>
  );
}

const STEPS = [
  {
    icon: Camera,
    title: "Snap",
    text: "Point your camera or pick a photo. It's shrunk and straightened on your phone before upload, so it's quick even on slow data.",
  },
  {
    icon: SlidersHorizontal,
    title: "Check",
    text: "Each food is outlined with its top three guesses. Not quite right? Tap another guess, search, or slide the portion.",
  },
  {
    icon: ChartColumn,
    title: "Track",
    text: "Meals land in your diary by day. See calories against your goal, your macro balance and how your week is going.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-8 bg-surface-2/70 py-24">
      <div className="container-app">
        <p className="text-sm font-medium text-primary">How it works</p>
        <h2 className="mt-2 max-w-2xl text-[2.4rem] leading-tight font-semibold">
          Three taps from plate to diary
        </h2>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="relative rounded-xl border border-line bg-surface p-7 shadow-soft"
            >
              <span className="font-display text-6xl font-semibold text-primary-soft" aria-hidden>
                {i + 1}
              </span>
              <step.icon className="absolute top-7 right-7 size-6 text-primary" aria-hidden />
              <h3 className="mt-2 text-2xl font-semibold">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: ScanBarcode,
    title: "Barcode scanning",
    text: "Packaged food? Scan the barcode for label-accurate nutrition from Open Food Facts, with Nutri-Score.",
  },
  {
    icon: MessageCircleHeart,
    title: "A coach that knows your day",
    text: "Ask what to cook for dinner. Answers use your goal, today's meals and your week — not generic tips.",
  },
  {
    icon: ChartColumn,
    title: "Insights that stay calm",
    text: "Trends over 7, 30 or 90 days, your macro balance and the foods you eat most. No guilt-trip red.",
  },
  {
    icon: Package,
    title: "Your pantry",
    text: "Save family recipes and regular snacks once, then add them in a tap.",
  },
  {
    icon: Download,
    title: "Install it like an app",
    text: "Add it to your home screen. It opens full-screen and works with your phone's camera.",
  },
  {
    icon: Lock,
    title: "Private by design",
    text: "Only you can read your diary. Export everything or delete your account from Settings.",
  },
];

function Features() {
  return (
    <section id="features" className="container-app scroll-mt-8 py-24">
      <p className="text-sm font-medium text-primary">Features</p>
      <h2 className="mt-2 max-w-2xl text-[2.4rem] leading-tight font-semibold">
        Everything around the photo, too
      </h2>
      <div className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title}>
            <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
              <f.icon className="size-6" aria-hidden />
            </span>
            <h3 className="mt-4 text-xl font-semibold">{f.title}</h3>
            <p className="mt-2 leading-relaxed text-ink-muted">{f.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Accuracy() {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const shown = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    return q
      ? dishes.filter(
          (d) => d.display.toLowerCase().includes(q) || d.group.toLowerCase().includes(q),
        )
      : dishes;
  }, [deferred]);

  return (
    <section id="accuracy" className="scroll-mt-8 bg-ink py-24 text-bg">
      <div className="container-app grid gap-14 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="text-sm font-medium text-primary-soft">How accurate is it?</p>
          <h2 className="mt-2 text-[2.4rem] leading-tight font-semibold">Honest by default</h2>
          <div className="mt-6 grid gap-5 leading-relaxed text-bg/80">
            <p>
              Two models work together. A <strong className="text-bg">YOLOv8 detector</strong> finds
              each food on the plate, and <strong className="text-bg">SigLIP 2</strong>, an open
              image–text model from Google, names it by comparing the photo with descriptions of{" "}
              {dishes.length} dishes, from pizza to palak paneer.
            </p>
            <p>
              On test photos it had never seen, its first guess was right for 90.5% of 2,020
              Food-101 photos and 84.3% of 941 photos of Indian dishes.
            </p>
            <p>
              It shows its top three guesses, and when it isn't confident it says so and asks you —
              rather than quietly logging the wrong thing.
            </p>
            <p>
              Portions are estimated from how much of the photo a food covers. One photo can't
              measure depth, so treat grams as a starting point: the slider is always there.
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-bg/[0.06] p-6 ring-1 ring-bg/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold">The {dishes.length} dishes it knows</h3>
            <div className="relative w-full sm:w-56">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-bg/50"
                aria-hidden
              />
              <Input
                aria-label="Search the dishes"
                placeholder="Search dishes"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-10 border-bg/20 bg-transparent pl-9 text-bg placeholder:text-bg/50"
              />
            </div>
          </div>
          <ul
            className="mt-5 flex max-h-80 flex-wrap gap-2 overflow-y-auto pr-1"
            aria-live="polite"
            aria-label="Dishes"
            tabIndex={0}
          >
            {shown.map((d) => (
              <li key={d.name} className="rounded-full bg-bg/10 px-3 py-1 text-sm text-bg/90">
                {d.display}
              </li>
            ))}
            {shown.length === 0 && (
              <li className="text-sm text-bg/70">
                Not on the list — you can still search for it or add it to your pantry.
              </li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Privacy() {
  const points = [
    {
      icon: Lock,
      title: "Only you can see your diary",
      text: "Every request is checked against your account. Photos are stored in a folder only you can open.",
    },
    {
      icon: Download,
      title: "Take your data with you",
      text: "Download everything you've logged as a file whenever you like.",
    },
    {
      icon: Trash2,
      title: "Delete means delete",
      text: "Removing your account erases your meals, photos, pantry and coach chats.",
    },
  ];
  return (
    <section id="privacy" className="container-app scroll-mt-8 py-24">
      <p className="text-sm font-medium text-primary">Privacy</p>
      <h2 className="mt-2 max-w-2xl text-[2.4rem] leading-tight font-semibold">
        Your food diary is yours
      </h2>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {points.map((p) => (
          <div key={p.title} className="rounded-xl border border-line bg-surface p-7 shadow-soft">
            <p.icon className="size-6 text-secondary" aria-hidden />
            <h3 className="mt-4 text-xl font-semibold">{p.title}</h3>
            <p className="mt-2 leading-relaxed text-ink-muted">{p.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="container-app pb-24">
      <div className="relative overflow-hidden rounded-xl bg-primary px-8 py-14 text-primary-fg sm:px-14">
        <div aria-hidden className="absolute -top-24 -right-24 size-72 rounded-full bg-white/10" />
        <div
          aria-hidden
          className="absolute -right-6 -bottom-28 size-56 rounded-full bg-white/10"
        />
        <h2 className="relative max-w-xl text-[2.4rem] leading-tight font-semibold">
          Your next meal is the easiest one to log.
        </h2>
        <p className="relative mt-3 max-w-lg text-primary-fg">
          Free to use. Set up in a minute. Works on your phone and laptop.
        </p>
        <Button asChild size="lg" variant="secondary" className="relative mt-8 border-transparent">
          <Link to="/sign-up">
            Create your account <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="container-app flex flex-wrap items-center justify-between gap-4 py-8 text-sm text-ink-muted">
        <Logo />
        <p className="max-w-md">
          Calorie and portion numbers are estimates and aren't medical advice. Nutrition data for
          packaged food comes from{" "}
          <a
            className="underline hover:text-ink"
            href="https://world.openfoodfacts.org"
            target="_blank"
            rel="noreferrer"
          >
            Open Food Facts
          </a>
          .
        </p>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  useTitle("");
  return (
    <div className={cn("min-h-dvh")}>
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Accuracy />
        <Privacy />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
