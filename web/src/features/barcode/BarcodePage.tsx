import { CameraOff, Minus, PackageSearch, Plus, ScanBarcode } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout";
import { MacroInline, MacroSplit } from "@/components/nutrition";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Skeleton, Spinner } from "@/components/ui/misc";
import { ApiError, errorMessage } from "@/lib/api/client";
import { useBarcode, useCreateMeal, useTimeZone, useToday } from "@/lib/api/queries";
import type { MealType, Product } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { guessMealType, localHour, MEAL_TYPES } from "@/lib/dates";
import { forGrams, kcal } from "@/lib/nutrition";
import { useTitle } from "@/lib/useTitle";

import { useBarcodeScanner } from "./useBarcodeScanner";

const NUTRI_COLORS: Record<string, string> = {
  a: "#038141",
  b: "#85bb2f",
  c: "#fecb02",
  d: "#ee8100",
  e: "#e63e11",
};

function NutriScore({ grade }: { grade: string }) {
  return (
    <div
      className="inline-flex items-center gap-2"
      aria-label={`Nutri-Score ${grade.toUpperCase()}`}
    >
      <span className="text-xs font-medium text-ink-muted">Nutri-Score</span>
      <span className="flex overflow-hidden rounded-md" aria-hidden>
        {["a", "b", "c", "d", "e"].map((g) => (
          <span
            key={g}
            className={cn(
              "grid w-6 place-items-center text-xs font-bold text-white uppercase transition-all",
              g === grade ? "h-8 w-8 text-sm" : "h-6 opacity-40",
            )}
            style={{ backgroundColor: NUTRI_COLORS[g], color: g === "c" ? "#2a211c" : "#fff" }}
          >
            {g}
          </span>
        ))}
      </span>
    </div>
  );
}

function ProductCard({ product, onLogged }: { product: Product; onLogged: () => void }) {
  const today = useToday();
  const timeZone = useTimeZone();
  const create = useCreateMeal();
  const hasServing = Boolean(product.servingG);
  const [unit, setUnit] = useState<"serving" | "grams">(hasServing ? "serving" : "grams");
  const [servings, setServings] = useState(1);
  const [grams, setGrams] = useState(Math.round(product.servingG ?? 100));
  const [mealType, setMealType] = useState<MealType>(
    guessMealType(localHour(new Date(), timeZone)),
  );

  const totalGrams = unit === "serving" && product.servingG ? product.servingG * servings : grams;
  const nutrition = forGrams(product.per100g, totalGrams);

  const add = async () => {
    try {
      await create.mutateAsync({
        localDate: today,
        mealType,
        source: "barcode",
        items: [
          {
            name: product.code,
            display: product.brand ? `${product.name} (${product.brand})` : product.name,
            group: product.group,
            grams: Math.max(1, Math.round(totalGrams)),
            per100g: product.per100g,
          },
        ],
      });
      toast.success(`${product.name} logged`);
      onLogged();
    } catch (err) {
      toast.error("Couldn't log it", { description: errorMessage(err) });
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-4 p-5">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            className="size-24 shrink-0 rounded-md bg-white object-contain p-1"
          />
        ) : (
          <span className="grid size-24 shrink-0 place-items-center rounded-md bg-surface-2">
            <PackageSearch className="size-8 text-ink-subtle" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm text-ink-muted">{product.brand ?? product.group}</p>
          <h2 className="mt-0.5 text-2xl leading-tight font-semibold">{product.name}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {product.nutriScore && <NutriScore grade={product.nutriScore} />}
            {product.novaGroup && (
              <span className="text-xs font-medium text-ink-muted">
                NOVA {product.novaGroup}
                <span className="sr-only">
                  {" "}
                  (food processing level, 1 = unprocessed, 4 = ultra-processed)
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="grid gap-5 border-t border-line p-5">
        {hasServing && (
          <Segmented
            aria-label="Amount as"
            value={unit}
            onValueChange={setUnit}
            options={[
              {
                value: "serving",
                label: `Servings (${product.servingLabel ?? `${product.servingG} g`})`,
              },
              { value: "grams", label: "Grams" },
            ]}
            size="sm"
            className="justify-self-start"
          />
        )}
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Less"
            onClick={() =>
              unit === "serving"
                ? setServings((s) => Math.max(0.5, s - 0.5))
                : setGrams((g) => Math.max(5, g - 10))
            }
          >
            <Minus />
          </Button>
          <NumberInput
            key={unit}
            aria-label={unit === "serving" ? "Servings" : "Grams"}
            min={unit === "serving" ? 0.5 : 1}
            max={unit === "serving" ? 50 : 5000}
            step={unit === "serving" ? 0.5 : 5}
            decimals={unit === "serving" ? 1 : 0}
            value={unit === "serving" ? servings : grams}
            onValueChange={unit === "serving" ? setServings : setGrams}
            className="w-28 text-center text-lg font-semibold tabular"
          />
          <Button
            variant="secondary"
            size="icon"
            aria-label="More"
            onClick={() =>
              unit === "serving" ? setServings((s) => s + 0.5) : setGrams((g) => g + 10)
            }
          >
            <Plus />
          </Button>
          <span className="text-ink-muted">
            {unit === "serving" ? `= ${Math.round(totalGrams)} g` : "g"}
          </span>
        </div>
        <div className="grid gap-2 rounded-lg bg-surface-2 p-4">
          <div className="flex items-baseline justify-between">
            <MacroInline macros={nutrition} />
            <p className="font-display text-3xl font-semibold tabular">
              {kcal(nutrition.kcal)} <span className="font-sans text-sm text-ink-muted">kcal</span>
            </p>
          </div>
          <MacroSplit macros={nutrition} />
          <p className="text-xs text-ink-muted">
            Per 100 g: {kcal(product.per100g.kcal)} kcal · values from the product label via Open
            Food Facts
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            aria-label="Meal"
            value={mealType}
            onValueChange={setMealType}
            options={MEAL_TYPES}
            size="sm"
            className="flex-wrap"
          />
          <Button size="lg" onClick={() => void add()} disabled={create.isPending}>
            {create.isPending ? "Logging…" : "Log to diary"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function BarcodePage() {
  useTitle("Scan a barcode");
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [code, setCode] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const product = useBarcode(code);
  const onCode = useCallback((value: string) => {
    (navigator as Partial<Navigator>).vibrate?.(40);
    setCode(value);
  }, []);
  const status = useBarcodeScanner(videoRef, code === null, onCode);

  const notFound = product.error instanceof ApiError && product.error.code === "product_not_found";

  return (
    <div className="container-app max-w-3xl">
      <PageHeader
        eyebrow="Barcode"
        title="Scan packaged food"
        description="Hold the barcode inside the frame. It reads automatically."
      />
      {code === null ? (
        <div className="grid gap-6">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#1c1714] shadow-lift">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              aria-label="Camera preview"
              className="h-full w-full object-cover"
            />
            {status === "scanning" && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 grid place-items-center"
              >
                <div className="relative h-32 w-[70%] rounded-xl border-[3px] border-[#fbf7f0]/90 shadow-[0_0_0_100vmax_rgb(28_23_20/0.45)]">
                  <span className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-[#ea7a4f]" />
                </div>
              </div>
            )}
            {(status === "starting" || status === "idle") && (
              <div className="absolute inset-0 grid place-items-center">
                <Spinner className="text-[#fbf7f0]" label="Starting camera" />
              </div>
            )}
            {(status === "denied" || status === "unavailable" || status === "error") && (
              <div className="absolute inset-0 grid place-content-center justify-items-center gap-3 p-6 text-center text-[#fbf7f0]">
                <CameraOff className="size-9 opacity-80" />
                <p className="max-w-xs text-sm opacity-90">
                  {status === "denied"
                    ? "Camera access is blocked. Type the number under the barcode instead."
                    : "The camera isn't available here. Type the number under the barcode instead."}
                </p>
              </div>
            )}
          </div>
          <form
            className="flex gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const digits = typed.replace(/\D/g, "");
              if (digits.length >= 8) setCode(digits);
            }}
          >
            <Input
              aria-label="Barcode number"
              inputMode="numeric"
              placeholder="Or type the barcode number"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <Button type="submit" disabled={typed.replace(/\D/g, "").length < 8}>
              Look up
            </Button>
          </form>
        </div>
      ) : (
        <div className="grid gap-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-muted">
              Barcode <span className="font-medium text-ink tabular">{code}</span>
            </p>
            <Button variant="ghost" onClick={() => setCode(null)}>
              <ScanBarcode /> Scan another
            </Button>
          </div>
          {product.isPending ? (
            <Card className="grid gap-3 p-5">
              <Skeleton className="h-24" />
              <Skeleton className="h-40" />
            </Card>
          ) : product.data ? (
            <ProductCard product={product.data} onLogged={() => void navigate("/app")} />
          ) : (
            <Card className="grid justify-items-center gap-3 p-8 text-center">
              <PackageSearch className="size-9 text-ink-subtle" />
              <h2 className="text-xl font-semibold">
                {notFound ? "Not in the database yet" : "Lookup failed"}
              </h2>
              <p className="max-w-sm text-ink-muted">
                {notFound
                  ? "Open Food Facts doesn't know this product. Save it to your pantry with the label values once, and it's a tap next time."
                  : errorMessage(product.error)}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={() => setCode(null)}>
                  Try again
                </Button>
                <Button asChild>
                  <Link to="/app/pantry?new=1">Add to pantry</Link>
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
