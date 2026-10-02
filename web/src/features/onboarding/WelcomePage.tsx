import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { Logo } from "@/components/brand";
import { CalorieRing, MacroSplit } from "@/components/nutrition";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Field, Input, Select } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/client";
import { useProfile, useSaveProfile } from "@/lib/api/queries";
import type { Goal, Targets } from "@/lib/api/types";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { browserTimeZone } from "@/lib/dates";
import {
  ACTIVITY,
  type Activity,
  type BodyInput,
  GOALS,
  type Sex,
  suggestTargets,
} from "@/lib/targets";
import { useReducedMotion } from "@/lib/useMediaQuery";
import { useTitle } from "@/lib/useTitle";

const THIS_YEAR = new Date().getFullYear();

interface BodyDraft {
  sex: Sex | "";
  birthYear: string;
  heightCm: string;
  weightKg: string;
  activity: Activity;
}

function toBody(d: BodyDraft): BodyInput | null {
  const year = Number(d.birthYear);
  const height = Number(d.heightCm);
  const weight = Number(d.weightKg);
  if (!d.sex || !year || !height || !weight) return null;
  if (
    year < 1900 ||
    year > THIS_YEAR - 13 ||
    height < 100 ||
    height > 250 ||
    weight < 30 ||
    weight > 300
  )
    return null;
  return {
    sex: d.sex,
    age: THIS_YEAR - year,
    heightCm: height,
    weightKg: weight,
    activity: d.activity,
  };
}

export default function WelcomePage() {
  useTitle("Welcome");
  const navigate = useNavigate();
  const { user } = useAuth();
  const profile = useProfile();
  const save = useSaveProfile();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal>("health");
  const [body, setBody] = useState<BodyDraft>({
    sex: "",
    birthYear: "",
    heightCm: "",
    weightKg: "",
    activity: "light",
  });
  const [targets, setTargets] = useState<Targets | null>(null);

  const parsedBody = useMemo(() => toBody(body), [body]);
  const suggested = useMemo(() => suggestTargets(goal, parsedBody), [goal, parsedBody]);
  const current = targets ?? suggested;

  const finish = async (final: Targets) => {
    try {
      await save.mutateAsync({
        displayName: profile.data?.displayName ?? user?.displayName ?? null,
        goal,
        targets: final,
        body: parsedBody
          ? {
              sex: parsedBody.sex,
              birthYear: Number(body.birthYear),
              heightCm: parsedBody.heightCm,
              weightKg: parsedBody.weightKg,
              activity: parsedBody.activity,
            }
          : null,
        units: "metric",
        timezone: browserTimeZone(),
        onboarded: true,
      });
      void navigate("/app", { replace: true });
    } catch (err) {
      toast.error("Couldn't save your goals", { description: errorMessage(err) });
    }
  };

  const steps = ["Your goal", "About you", "Your targets"];
  const slide = reduced
    ? {}
    : {
        initial: { opacity: 0, x: 24 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -24 },
        transition: { duration: 0.25 },
      };

  return (
    <div className="container-app flex min-h-dvh max-w-2xl flex-col py-6">
      <header className="flex items-center justify-between">
        <Logo />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void finish(suggestTargets("health"))}
          disabled={save.isPending}
        >
          Skip for now
        </Button>
      </header>

      <ol className="mt-10 flex gap-2" aria-label="Progress">
        {steps.map((label, i) => (
          <li key={label} className="flex-1">
            <span
              className={cn(
                "block h-1.5 rounded-full bg-surface-3 transition-colors",
                i <= step && "bg-primary",
              )}
            />
            <span
              className={cn(
                "mt-2 block text-xs font-medium",
                i === step ? "text-ink" : "text-ink-subtle",
              )}
            >
              <span className="sr-only">Step {i + 1}: </span>
              {label}
            </span>
          </li>
        ))}
      </ol>

      <main className="mt-10 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {step === 0 && (
            <motion.section key="goal" {...slide} aria-labelledby="goal-title">
              <h1 id="goal-title" className="text-[2.2rem] leading-tight font-semibold">
                Hi{user?.displayName ? ` ${user.displayName.split(" ")[0] ?? ""}` : ""}! What brings
                you here?
              </h1>
              <p className="mt-2 text-ink-muted">
                This sets your starting targets. You can change it anytime.
              </p>
              <div
                role="radiogroup"
                aria-labelledby="goal-title"
                className="mt-8 grid gap-3 sm:grid-cols-2"
              >
                {GOALS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    role="radio"
                    aria-checked={goal === g.value}
                    onClick={() => setGoal(g.value)}
                    className={cn(
                      "relative grid gap-1 rounded-lg border bg-surface p-5 text-left shadow-soft transition-all hover:border-line-strong",
                      goal === g.value ? "border-primary ring-4 ring-primary/15" : "border-line",
                    )}
                  >
                    <span className="font-display text-xl font-semibold">{g.label}</span>
                    <span className="text-sm text-ink-muted">{g.hint}</span>
                    {goal === g.value && (
                      <span className="absolute top-4 right-4 grid size-6 place-items-center rounded-full bg-primary text-primary-fg">
                        <Check className="size-4" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </motion.section>
          )}

          {step === 1 && (
            <motion.section key="body" {...slide} aria-labelledby="body-title">
              <h1 id="body-title" className="text-[2.2rem] leading-tight font-semibold">
                A little about you
              </h1>
              <p className="mt-2 text-ink-muted">
                Optional, but it makes your calorie target personal. We only use it to calculate
                your needs.
              </p>
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                <div className="grid gap-1.5 sm:col-span-2">
                  <span className="text-sm font-medium" id="sex-label">
                    Body type for the calculation
                  </span>
                  <Segmented
                    aria-label="Body type"
                    value={body.sex || "none"}
                    onValueChange={(v) => setBody({ ...body, sex: v === "none" ? "" : v })}
                    options={[
                      { value: "female", label: "Female" },
                      { value: "male", label: "Male" },
                      { value: "none", label: "Skip" },
                    ]}
                    className="justify-self-start"
                  />
                </div>
                <Field label="Year of birth">
                  {(p) => (
                    <Input
                      inputMode="numeric"
                      placeholder="e.g. 2004"
                      value={body.birthYear}
                      onChange={(e) => setBody({ ...body, birthYear: e.target.value })}
                      {...p}
                    />
                  )}
                </Field>
                <Field label="Height (cm)">
                  {(p) => (
                    <Input
                      inputMode="decimal"
                      placeholder="e.g. 172"
                      value={body.heightCm}
                      onChange={(e) => setBody({ ...body, heightCm: e.target.value })}
                      {...p}
                    />
                  )}
                </Field>
                <Field label="Weight (kg)">
                  {(p) => (
                    <Input
                      inputMode="decimal"
                      placeholder="e.g. 68"
                      value={body.weightKg}
                      onChange={(e) => setBody({ ...body, weightKg: e.target.value })}
                      {...p}
                    />
                  )}
                </Field>
                <Field label="How active are you?">
                  {(p) => (
                    <Select
                      value={body.activity}
                      onChange={(e) => setBody({ ...body, activity: e.target.value as Activity })}
                      {...p}
                    >
                      {ACTIVITY.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label} — {a.hint}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              {!parsedBody && (body.birthYear || body.heightCm || body.weightKg) && (
                <p className="mt-4 text-sm text-ink-muted">
                  Fill in all fields (or skip) to personalise your target.
                </p>
              )}
            </motion.section>
          )}

          {step === 2 && (
            <motion.section key="targets" {...slide} aria-labelledby="targets-title">
              <h1 id="targets-title" className="text-[2.2rem] leading-tight font-semibold">
                Your daily targets
              </h1>
              <p className="mt-2 text-ink-muted">
                {parsedBody
                  ? "Calculated from your details with the Mifflin–St Jeor formula. Adjust if you like."
                  : "A balanced starting point. Add your details later in Settings for a personal target."}
              </p>
              <div className="mt-8 grid items-center gap-8 sm:grid-cols-[auto_1fr]">
                <CalorieRing
                  mode="goal"
                  eaten={current.kcal}
                  target={current.kcal}
                  size={184}
                  className="justify-self-center"
                />
                <div className="grid gap-4">
                  <Field label="Calories per day" hint="We never suggest less than 1,200 kcal.">
                    {(p) => (
                      <Input
                        type="number"
                        min={1200}
                        max={6000}
                        step={10}
                        value={current.kcal}
                        onChange={(e) => {
                          const kcal = Math.max(0, Number(e.target.value));
                          const ratio = current.kcal ? kcal / current.kcal : 1;
                          setTargets({
                            kcal,
                            proteinG: Math.round(current.proteinG * ratio),
                            fatG: Math.round(current.fatG * ratio),
                            carbsG: Math.round(current.carbsG * ratio),
                          });
                        }}
                        {...p}
                      />
                    )}
                  </Field>
                  <div className="grid grid-cols-3 gap-3">
                    {(["proteinG", "carbsG", "fatG"] as const).map((key) => (
                      <Field
                        key={key}
                        label={
                          key === "proteinG" ? "Protein g" : key === "carbsG" ? "Carbs g" : "Fat g"
                        }
                      >
                        {(p) => (
                          <Input
                            type="number"
                            min={0}
                            value={current[key]}
                            onChange={(e) =>
                              setTargets({ ...current, [key]: Math.max(0, Number(e.target.value)) })
                            }
                            {...p}
                          />
                        )}
                      </Field>
                    ))}
                  </div>
                  <MacroSplit
                    macros={{
                      kcal: current.kcal,
                      proteinG: current.proteinG,
                      carbsG: current.carbsG,
                      fatG: current.fatG,
                    }}
                    className="h-2.5"
                  />
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <footer className="sticky bottom-0 mt-10 flex items-center justify-between gap-3 border-t border-line bg-bg py-4">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ArrowLeft /> Back
        </Button>
        {step < 2 ? (
          <Button
            size="lg"
            onClick={() => {
              setTargets(null);
              setStep((s) => s + 1);
            }}
          >
            Continue <ArrowRight />
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={() => void finish(current)}
            disabled={save.isPending || current.kcal < 800}
          >
            {save.isPending ? "Saving…" : "Start tracking"} <ArrowRight />
          </Button>
        )}
      </footer>
    </div>
  );
}
