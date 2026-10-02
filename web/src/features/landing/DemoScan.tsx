import { CircleCheck, Sparkles } from "lucide-react";
import { motion } from "motion/react";

import { MacroSplit } from "@/components/nutrition";
import { useReducedMotion } from "@/lib/useMediaQuery";

/**
 * An illustration of a scan on the sample photo (not a live model call). The bowl shows the
 * confirm step: the user checked the top guess before logging it.
 */
const ITEMS = [
  {
    id: "bowl",
    label: "Palak paneer",
    detail: "~250 g · 290 kcal",
    confirmed: true,
    box: { x: 0.03, y: 0.15, w: 0.95, h: 0.64 },
    chip: { x: 0.06, y: 0.42 },
  },
  {
    id: "naan",
    label: "Naan",
    detail: "~90 g · 260 kcal",
    confirmed: false,
    box: { x: 0.53, y: 0.01, w: 0.46, h: 0.21 },
    chip: { x: 0.56, y: 0.04 },
  },
  {
    id: "rice",
    label: "Steamed rice",
    detail: "~150 g · 195 kcal",
    confirmed: false,
    box: { x: 0.8, y: 0.64, w: 0.19, h: 0.35 },
    chip: { x: 0.48, y: 0.88 },
  },
] as const;

export function DemoScan() {
  const reduced = useReducedMotion();
  const appear = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 8, scale: 0.98 },
          whileInView: { opacity: 1, y: 0, scale: 1 },
          viewport: { once: true, margin: "-80px" },
          transition: { delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <figure className="relative mx-auto w-full max-w-[34rem]">
      <div className="relative overflow-hidden rounded-xl border border-line bg-surface-3 shadow-lift">
        <img
          src="/images/palak-paneer-640.webp"
          srcSet="/images/palak-paneer-384.webp 384w, /images/palak-paneer-640.webp 640w"
          sizes="(min-width: 64rem) 34rem, 92vw"
          width={640}
          height={640}
          alt="A bowl of palak paneer with naan, rice and sliced onions"
          className="block aspect-square w-full object-cover"
          fetchPriority="high"
        />
        {ITEMS.map((item, i) => (
          <motion.div
            key={item.id}
            aria-hidden
            className="absolute rounded-[14px] border-2 border-dashed border-[#fbf7f0]/90 shadow-[0_0_0_1px_rgb(28_23_20/0.15)]"
            style={{
              left: `${item.box.x * 100}%`,
              top: `${item.box.y * 100}%`,
              width: `${item.box.w * 100}%`,
              height: `${item.box.h * 100}%`,
            }}
            initial={reduced ? false : { opacity: 0, scale: 1.06 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
        {ITEMS.map((item, i) => (
          <motion.div
            key={item.id}
            {...appear(0.9 + i * 0.35)}
            className="absolute flex max-w-[60%] items-center gap-2 rounded-full bg-[#fffdf9]/95 py-1.5 pr-3.5 pl-1.5 text-[#2a211c] shadow-lift backdrop-blur"
            style={{ left: `${item.chip.x * 100}%`, top: `${item.chip.y * 100}%` }}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#c2410c] text-white">
              {item.confirmed ? (
                <CircleCheck className="size-4" />
              ) : (
                <Sparkles className="size-4" />
              )}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[0.82rem] font-semibold">{item.label}</span>
              <span className="block truncate text-[0.72rem] text-[#6b5e55]">
                {item.confirmed ? "You confirmed · " : ""}
                {item.detail}
              </span>
            </span>
          </motion.div>
        ))}
      </div>

      <motion.div
        {...appear(2.1)}
        className="absolute -bottom-8 -left-2 w-60 rounded-lg border border-line bg-surface p-4 shadow-lift sm:-left-10"
      >
        <p className="text-xs font-medium text-ink-muted">Lunch · logged</p>
        <p className="mt-1 font-display text-3xl font-semibold tabular">
          745 <span className="text-base font-medium text-ink-muted">kcal</span>
        </p>
        <MacroSplit
          macros={{ kcal: 745, proteinG: 26, carbsG: 92, fatG: 30 }}
          className="mt-3 h-2"
        />
        <p className="mt-2 text-xs text-ink-muted tabular">P 26 g · C 92 g · F 30 g</p>
      </motion.div>
      <figcaption className="sr-only">
        Illustration: three foods are outlined on the photo with their estimated portions and
        calories.
      </figcaption>
    </figure>
  );
}
