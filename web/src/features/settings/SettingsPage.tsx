import { Download, LogOut, Moon, Sparkles, Sun, SunMoon, TriangleAlert } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { Field, Input, Select } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Skeleton } from "@/components/ui/misc";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/overlays";
import { api, authHeaders, call, errorMessage } from "@/lib/api/client";
import { useProfile, useSaveProfile } from "@/lib/api/queries";
import type { Goal, Profile, Targets } from "@/lib/api/types";
import { useAuth } from "@/lib/auth";
import { browserTimeZone } from "@/lib/dates";
import { API_URL } from "@/lib/env";
import { ACTIVITY, type Activity, GOALS, type Sex, suggestTargets } from "@/lib/targets";
import { type ThemeChoice, useTheme } from "@/lib/theme";
import { useTitle } from "@/lib/useTitle";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="grid gap-5 p-5 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

function allTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [browserTimeZone()];
  }
}

function ProfileForm({ profile }: { profile: Profile }) {
  const save = useSaveProfile();
  const [draft, setDraft] = useState<Profile>(profile);
  // Browsers list some zones under older aliases (Chrome: Asia/Calcutta), so always include the saved one.
  const zones = useMemo(
    () => [...new Set([profile.timezone, ...allTimeZones()])].sort(),
    [profile.timezone],
  );
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setTarget = (key: keyof Targets, value: number) =>
    setDraft((d) => ({ ...d, targets: { ...d.targets, [key]: value } }));
  const body = draft.body ?? {};
  const setBody = (patch: Partial<NonNullable<Profile["body"]>>) =>
    setDraft((d) => ({ ...d, body: { ...(d.body ?? {}), ...patch } }));
  const thisYear = new Date().getFullYear();
  const canRecalc = Boolean(body.sex && body.birthYear && body.heightCm && body.weightKg);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);

  const recalc = () => {
    const { sex, birthYear, heightCm, weightKg } = body;
    if (!sex || !birthYear || !heightCm || !weightKg) return;
    setDraft((d) => ({
      ...d,
      targets: suggestTargets(d.goal, {
        sex,
        age: thisYear - birthYear,
        heightCm,
        weightKg,
        activity: body.activity ?? "light",
      }),
    }));
  };

  const submit = async () => {
    try {
      const { createdAt: _c, updatedAt: _u, ...rest } = draft;
      await save.mutateAsync(rest);
      toast.success("Settings saved");
    } catch (err) {
      toast.error("Couldn't save", { description: errorMessage(err) });
    }
  };

  return (
    <>
      <Section title="You" description="Used by the coach and to personalise your targets.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            {(p) => (
              <Input
                value={draft.displayName ?? ""}
                onChange={(e) => set("displayName", e.target.value || null)}
                {...p}
              />
            )}
          </Field>
          <Field label="Goal">
            {(p) => (
              <Select
                value={draft.goal}
                onChange={(e) => set("goal", e.target.value as Goal)}
                {...p}
              >
                {GOALS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Body type for calculations">
            {(p) => (
              <Select
                value={body.sex ?? ""}
                onChange={(e) => setBody({ sex: (e.target.value || null) as Sex | null })}
                {...p}
              >
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </Select>
            )}
          </Field>
          <Field label="Year of birth">
            {(p) => (
              <Input
                type="number"
                value={body.birthYear ?? ""}
                onChange={(e) =>
                  setBody({ birthYear: e.target.value ? Number(e.target.value) : null })
                }
                {...p}
              />
            )}
          </Field>
          <Field label="Height (cm)">
            {(p) => (
              <Input
                type="number"
                value={body.heightCm ?? ""}
                onChange={(e) =>
                  setBody({ heightCm: e.target.value ? Number(e.target.value) : null })
                }
                {...p}
              />
            )}
          </Field>
          <Field label="Weight (kg)">
            {(p) => (
              <Input
                type="number"
                value={body.weightKg ?? ""}
                onChange={(e) =>
                  setBody({ weightKg: e.target.value ? Number(e.target.value) : null })
                }
                {...p}
              />
            )}
          </Field>
          <Field label="Activity" className="sm:col-span-2">
            {(p) => (
              <Select
                value={body.activity ?? "light"}
                onChange={(e) => setBody({ activity: e.target.value as Activity })}
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
      </Section>

      <Section title="Daily targets" description="What your ring and macro bars measure against.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              ["kcal", "Calories"],
              ["proteinG", "Protein g"],
              ["carbsG", "Carbs g"],
              ["fatG", "Fat g"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              {(p) => (
                <NumberInput
                  min={0}
                  max={key === "kcal" ? 10000 : 1500}
                  value={draft.targets[key]}
                  onValueChange={(v) => setTarget(key, v)}
                  {...p}
                />
              )}
            </Field>
          ))}
        </div>
        <Button
          variant="secondary"
          className="justify-self-start"
          onClick={recalc}
          disabled={!canRecalc}
        >
          <Sparkles /> Recalculate from my details
        </Button>
      </Section>

      <Section title="Region">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Time zone" hint="Decides which day a meal belongs to.">
            {(p) => (
              <Select
                value={draft.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                {...p}
              >
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Units</span>
            <Segmented
              aria-label="Units"
              value={draft.units}
              onValueChange={(u) => set("units", u)}
              options={[
                { value: "metric", label: "Metric (g, kg)" },
                { value: "imperial", label: "Imperial (oz, lb)" },
              ]}
              className="justify-self-start"
            />
          </div>
        </div>
      </Section>

      <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-6">
        <Button
          size="lg"
          className="shadow-lift"
          onClick={() => void submit()}
          disabled={!dirty || save.isPending || draft.targets.kcal < 800}
        >
          {save.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </Button>
      </div>
    </>
  );
}

export default function SettingsPage() {
  useTitle("Settings");
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const profile = useProfile();
  const { choice, setChoice } = useTheme();
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/v1/me/export`, { headers: await authHeaders() });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `food-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Couldn't export", { description: errorMessage(err) });
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await call(api.DELETE("/v1/me"));
      await signOut().catch(() => undefined);
      toast.success("Your account and data were deleted");
      void navigate("/", { replace: true });
    } catch (err) {
      toast.error("Couldn't delete your account", { description: errorMessage(err) });
      setDeleting(false);
    }
  };

  return (
    <div className="container-app grid max-w-3xl gap-6">
      <PageHeader title="Settings" description={user?.email ?? undefined} className="pb-0" />
      {profile.data ? (
        <ProfileForm key={profile.data.updatedAt ?? "new"} profile={profile.data} />
      ) : (
        <Skeleton className="h-96" />
      )}

      <Section title="Appearance">
        <Segmented<ThemeChoice>
          aria-label="Theme"
          value={choice}
          onValueChange={setChoice}
          options={[
            {
              value: "system",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <SunMoon className="size-4" /> Device
                </span>
              ),
            },
            {
              value: "light",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Sun className="size-4" /> Light
                </span>
              ),
            },
            {
              value: "dark",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Moon className="size-4" /> Dark
                </span>
              ),
            },
          ]}
          className="justify-self-start"
        />
      </Section>

      <Section title="Your data" description="Everything you've logged belongs to you.">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => void exportData()} disabled={exporting}>
            <Download /> {exporting ? "Preparing…" : "Download my data"}
          </Button>
          <Button variant="secondary" onClick={() => void signOut()}>
            <LogOut /> Sign out
          </Button>
        </div>
        <div className="rounded-lg border border-danger/30 bg-danger-soft/40 p-4">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <TriangleAlert className="size-4" /> Delete account
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Permanently removes your meals, photos, pantry, coach chats and sign-in. This can't be
            undone.
          </p>
          <Dialog onOpenChange={() => setConfirm("")}>
            <DialogContent
              title="Delete your account?"
              description="Type DELETE to confirm. Your data is removed right away."
            >
              <Input
                aria-label="Type DELETE to confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
              />
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="secondary">Keep my account</Button>
                </DialogClose>
                <Button
                  variant="danger"
                  disabled={confirm !== "DELETE" || deleting}
                  onClick={() => void deleteAccount()}
                >
                  {deleting ? "Deleting…" : "Delete everything"}
                </Button>
              </div>
            </DialogContent>
            <DialogTrigger asChild>
              <Button variant="danger" size="sm" className="mt-3">
                Delete my account
              </Button>
            </DialogTrigger>
          </Dialog>
        </div>
      </Section>

      <p className="pb-4 text-center text-xs text-ink-subtle">
        Food Tracker v2 · YOLOv8 + SigLIP 2 · nutrition estimates aren't medical advice
      </p>
    </div>
  );
}
