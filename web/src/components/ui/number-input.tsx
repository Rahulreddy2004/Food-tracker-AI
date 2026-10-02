import { type ComponentProps, useState } from "react";

import { Input } from "@/components/ui/input";

interface NumberInputProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Round committed values to this many decimals (default: whole numbers). */
  decimals?: number;
}

/**
 * A number field people can clear and retype. While editing, the text is kept as typed; valid
 * numbers are committed (clamped) as you type, and the field snaps back to the value on blur.
 */
export function NumberInput({
  value,
  onValueChange,
  min = 0,
  max = 100000,
  decimals = 0,
  onBlur,
  ...props
}: NumberInputProps) {
  const [text, setText] = useState<string | null>(null);
  const factor = 10 ** decimals;
  const shown = text ?? String(Math.round(value * factor) / factor);
  return (
    <Input
      type="number"
      inputMode={decimals ? "decimal" : "numeric"}
      min={min}
      max={max}
      value={shown}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n)) {
          onValueChange(Math.min(Math.max(Math.round(n * factor) / factor, min), max));
        }
      }}
      onBlur={(e) => {
        setText(null);
        onBlur?.(e);
      }}
      {...props}
    />
  );
}
