import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = "primary",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: "primary" | "primaryDark" | "danger" | "muted";
}) {
  const accentColor =
    accent === "danger"
      ? "text-danger"
      : accent === "primaryDark"
        ? "text-primaryDark"
        : accent === "muted"
          ? "text-muted"
          : "text-primary";
  return (
    <Card>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accentColor}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "ok" | "off" | "warn" | "neutral";
}) {
  const tones: Record<string, string> = {
    ok: "bg-primary/15 text-primaryDark",
    off: "bg-danger/15 text-danger",
    warn: "bg-amber-100 text-amber-700",
    neutral: "bg-canvas text-muted",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-20 text-muted">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" />
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}
