"use client";
import { useRef } from "react";
export default function OtpInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        value={value}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, 6))
        }
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        aria-label="6 位验证码"
        className="absolute inset-0 z-10 h-full w-full opacity-0"
      />
      <div className="grid grid-cols-6 gap-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className="flex h-12 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] text-lg font-semibold"
          >
            {value[i] || ""}
          </span>
        ))}
      </div>
    </div>
  );
}
