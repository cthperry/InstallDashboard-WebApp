"use client";

import { C } from "@/app/dashboard/utils";

// ── 共用樣式常量 ──────────────────────────────────────────────────
const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: C.text3,
  marginBottom: 3,
};

const SECTION_HEADER_STYLE: React.CSSProperties = {
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 700,
  color: C.accent,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
};

// ── FormLabel ─────────────────────────────────────────────────────
export function FormLabel({
  children,
  required,
  hint,
}: {
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label style={LABEL_STYLE}>
      {children}
      {required && <span style={{ color: C.danger }}> *</span>}
      {hint && <span style={{ color: C.text3 }}> {hint}</span>}
    </label>
  );
}

// ── FormSection ───────────────────────────────────────────────────
export function FormSection({ title }: { title: string }) {
  return <div style={SECTION_HEADER_STYLE}>{title}</div>;
}

// ── FormInput ─────────────────────────────────────────────────────
export function FormInput({
  label,
  required,
  hint,
  value,
  onChange,
  type = "text",
  placeholder,
  style,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  value: string;
  onChange: (val: string) => void;
  type?: "text" | "date" | "number";
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <FormLabel required={required} hint={hint}>{label}</FormLabel>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input"
      />
    </div>
  );
}

// ── FormSelect ────────────────────────────────────────────────────
export function FormSelect({
  label,
  required,
  value,
  onChange,
  options,
  placeholder,
  style,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (val: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <FormLabel required={required}>{label}</FormLabel>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── FormGrid ──────────────────────────────────────────────────────
export function FormGrid({
  cols = 2,
  gap = 10,
  children,
  style,
}: {
  cols?: number;
  gap?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap,
        marginBottom: 14,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
