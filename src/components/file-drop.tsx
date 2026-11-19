"use client";

import { clsx } from "clsx";
import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

export function FileDrop({
  accept,
  multiple,
  onFiles,
  title,
  hint,
  disabled,
  capture,
  compact,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  title: string;
  hint?: string;
  disabled?: boolean;
  capture?: boolean;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={clsx(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors",
        compact ? "px-4 py-6" : "px-6 py-12",
        over ? "border-board bg-board-mist" : "border-line-strong bg-surface hover:border-board/50 hover:bg-board-mist/60",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <UploadCloud className="h-7 w-7 text-board" strokeWidth={1.6} />
      <p className="mt-3 font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <input
        ref={input}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        {...(capture ? { capture: "environment" as const } : {})}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}

export function ColumnSelect({
  label,
  value,
  headers,
  onChange,
  required,
  hint,
}: {
  label: string;
  value: number | null;
  headers: string[];
  onChange: (v: number | null) => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-absent"> *</span>}
      </label>
      <select className="field" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}>
        <option value="">Not in this file</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
