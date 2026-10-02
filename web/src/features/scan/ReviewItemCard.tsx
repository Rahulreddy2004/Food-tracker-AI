import { CircleAlert, Search, Trash2 } from "lucide-react";

import { FoodIcon, MacroInline } from "@/components/nutrition";
import { PortionEditor } from "@/components/PortionEditor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { kcal } from "@/lib/nutrition";

import { confidenceLabel, itemNutrition, resolveItem, type ReviewItem } from "./useScanFlow";

interface Props {
  item: ReviewItem;
  index: number;
  active: boolean;
  onActive: (key: string | null) => void;
  onChoose: (index: number) => void;
  onGrams: (grams: number) => void;
  onSearch: () => void;
  onConfirm: () => void;
  onRemove: () => void;
}

export function ReviewItemCard({
  item,
  index,
  active,
  onActive,
  onChoose,
  onGrams,
  onSearch,
  onConfirm,
  onRemove,
}: Props) {
  const resolved = resolveItem(item);
  const nutrition = itemNutrition(item);
  const top = item.predictions[0];
  const chosen = item.choice >= 0 ? item.predictions[item.choice] : undefined;
  const confidence = chosen ? confidenceLabel(chosen.confidence) : null;
  const unsure = item.needsConfirmation && !item.confirmed;
  const serving = chosen?.suggestedGrams ?? item.custom?.grams ?? 100;

  return (
    <article
      id={`item-${item.key}`}
      aria-labelledby={`item-title-${item.key}`}
      onMouseEnter={() => onActive(item.key)}
      onMouseLeave={() => onActive(null)}
      onFocus={() => onActive(item.key)}
      className={cn(
        "rounded-lg border bg-surface p-4 shadow-soft transition-shadow sm:p-5",
        unsure ? "border-accent ring-4 ring-accent-soft" : "border-line",
        active && "ring-4 ring-primary/20",
      )}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-fg"
        >
          {item.box ? index + 1 : "+"}
        </span>
        <FoodIcon group={resolved.group} className="size-10" />
        <div className="min-w-0 flex-1">
          <h3 id={`item-title-${item.key}`} className="truncate font-sans text-lg font-semibold">
            {resolved.display}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            {confidence && chosen ? (
              <Badge tone={confidence.tone}>
                {confidence.text} · {Math.round(chosen.confidence * 100)}%
              </Badge>
            ) : (
              <Badge tone="neutral">{item.box ? "Your pick" : "Added by you"}</Badge>
            )}
            {resolved.group && <span className="text-sm text-ink-muted">{resolved.group}</span>}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${resolved.display}`}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </header>

      {unsure && top && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2 rounded-md bg-accent-soft px-3 py-2.5 text-sm text-ink"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            I'm not sure about this one. Pick the right dish below, search for it, or{" "}
            <button
              type="button"
              onClick={onConfirm}
              className="font-semibold text-primary-ink underline underline-offset-2"
            >
              keep “{top.display}”
            </button>
            .
          </span>
        </div>
      )}

      {item.predictions.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-ink-muted">Is it…</p>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label={`What is item ${index + 1}?`}
          >
            {item.predictions.map((p, i) => (
              <button
                key={p.label}
                type="button"
                role="radio"
                aria-checked={item.choice === i}
                onClick={() => onChoose(i)}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-sm transition-colors",
                  item.choice === i
                    ? "border-primary bg-primary text-primary-fg"
                    : "border-line-strong bg-surface text-ink hover:border-ink-subtle",
                )}
              >
                {p.display}{" "}
                <span
                  className={cn(
                    "tabular",
                    item.choice === i ? "text-primary-fg" : "text-ink-subtle",
                  )}
                >
                  {Math.round(p.confidence * 100)}%
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={onSearch}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed px-3.5 text-sm transition-colors",
                item.choice === -1
                  ? "border-primary text-primary"
                  : "border-line-strong text-ink-muted hover:text-ink",
              )}
            >
              <Search className="size-4" /> {item.choice === -1 ? "Search again" : "Something else"}
            </button>
          </div>
        </div>
      )}

      <PortionEditor
        className="mt-5"
        grams={item.grams}
        onChange={onGrams}
        servingG={serving}
        servingLabel="est."
      />

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <MacroInline macros={nutrition} />
        <p className="font-display text-2xl font-semibold tabular">
          {kcal(nutrition.kcal)}{" "}
          <span className="font-sans text-sm font-medium text-ink-muted">kcal</span>
        </p>
      </footer>
    </article>
  );
}
