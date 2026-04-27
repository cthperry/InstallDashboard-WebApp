"use client";

import { normalizeDateYmd } from "@/lib/utils";

type Props = {
  value?: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
};

export function DateInput({ value = "", onChange, min, max, disabled }: Props) {
  return (
    <input
      type="date"
      value={normalizeDateYmd(value)}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(event) => onChange(normalizeDateYmd(event.target.value))}
      placeholder="YYYY-MM-DD"
      inputMode="numeric"
      pattern="\d{4}-\d{2}-\d{2}"
    />
  );
}
