import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";

export function Card({ children, className = "", testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div data-testid={testId} className={`rounded-2xl border border-line/70 bg-white p-5 shadow-card ${className}`}>
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

/** Ancho fijo de los comentarios de las tarjetas del inicio: los cuatro miden lo mismo. */
export const PILL_WIDTH = 144;

const TILE_TONES = {
  teal: { color: "#2CC4B4", pillBg: "#2db7a352", pillText: "#14554b" },
  blue: { color: "#1B3A8F", pillBg: "#1B3A8F", pillText: "#ffffff" },
  yellow: { color: "#f59e0b", pillBg: "#fbbc059d", pillText: "#564209" },
  red: { color: "#e5484d", pillBg: "#e5484d", pillText: "#ffffff" },
} as const;

export type TileTone = keyof typeof TILE_TONES;

/**
 * Tarjeta del inicio, como la de la app: un ícono en un círculo del color de acento, el número grande, el título y un
 * comentario en una pastilla. Si se puede tocar, lleva una flecha.
 */
export function StatTile({
  testId,
  icon: Icon,
  tone,
  accent,
  title,
  value,
  comment,
  solidComment = false,
  onClick,
}: {
  testId?: string;
  icon: LucideIcon;
  tone: TileTone;
  /** Color del ícono y del número, si no es el del tono. */
  accent?: string;
  title: string;
  value: string;
  comment: string;
  /** El comentario va con el fondo del color de acento y la letra blanca. */
  solidComment?: boolean;
  onClick?: () => void;
}) {
  const palette = TILE_TONES[tone];
  const color = accent ?? palette.color;
  const content = (
    <>
      <div className="flex min-h-[40px] items-center justify-between">
        <span
          data-testid={testId ? `${testId}-icon` : undefined}
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}22`, color }}
        >
          <Icon size={20} />
        </span>
        {onClick && <ChevronRight size={18} className="text-muted/60" />}
      </div>
      <p data-testid={testId ? `${testId}-value` : undefined} className="mt-2 text-3xl font-bold leading-none" style={{ color }}>
        {value}
      </p>
      <p className="mt-1.5 text-sm font-semibold text-ink">{title}</p>
      <p
        data-testid={testId ? `${testId}-comment` : undefined}
        className="mx-auto mt-1.5 truncate rounded-full py-0.5 text-center text-[11px] font-medium"
        style={{
          width: PILL_WIDTH,
          maxWidth: "100%",
          backgroundColor: solidComment ? color : palette.pillBg,
          color: solidComment ? "#ffffff" : palette.pillText,
        }}
      >
        {comment}
      </p>
    </>
  );
  const base = "block rounded-2xl border border-line/60 bg-white p-4 text-left shadow-card";
  if (!onClick) {
    return <div data-testid={testId} className={base}>{content}</div>;
  }
  return (
    <button type="button" data-testid={testId} onClick={onClick} className={`${base} w-full transition hover:-translate-y-0.5 hover:shadow-lift`}>
      {content}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "ok" | "off" | "warn" | "neutral" | "info";
}) {
  const tones: Record<string, string> = {
    ok: "bg-primary/15 text-primaryDark",
    off: "bg-critical/15 text-criticalInk",
    warn: "bg-warn/25 text-warnInk",
    info: "bg-primaryDark/10 text-primaryDark",
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
    <div role="status" aria-label="Cargando" className="flex items-center justify-center py-20 text-muted">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted">{children}</p>;
}

type ButtonTone = "primary" | "outline" | "danger" | "ghost" | "dark";

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary: "bg-primary text-white hover:opacity-90",
  dark: "bg-primaryDark text-white hover:opacity-90",
  outline: "border border-line bg-white text-ink hover:bg-canvas",
  danger: "bg-critical text-white hover:opacity-90",
  ghost: "text-primaryDark hover:bg-primary/10",
};

/** Botón de la app: redondeado, con el verde azulado como principal y el rojo para lo que borra. */
export function Button({
  tone = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  return (
    <button
      type={type}
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_TONES[tone]} ${className}`}
    />
  );
}

/** Campo de texto con su rótulo y, si hace falta, un aviso de error o una ayuda debajo. */
export function Field({
  label,
  error,
  help,
  className = "",
  inputClassName = "",
  right,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string | null;
  help?: ReactNode;
  inputClassName?: string;
  /** Algo a la derecha del campo (el ojo de la contraseña, por ejemplo). */
  right?: ReactNode;
}) {
  const id = props.id ?? (label ? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          {...props}
          className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-[#AEAEAE] focus:border-primary disabled:bg-canvas disabled:text-muted ${
            error ? "border-danger" : "border-[#D9D9D9]"
          } ${right ? "pr-11" : ""} ${inputClassName}`}
        />
        {right && <div className="absolute inset-y-0 right-0 flex items-center pr-3">{right}</div>}
      </div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : help ? <p className="mt-1 text-xs text-muted">{help}</p> : null}
    </div>
  );
}

/** Opciones en fila, de las que se elige una (como los filtros «Todas / Stock / Vencimiento» de la app). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  testIdPrefix,
  equalWidth = false,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  testIdPrefix?: string;
  /** Todos los botones del mismo ancho y centrados en la fila. */
  equalWidth?: boolean;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${equalWidth ? "justify-center" : ""}`}>
      {options.map(({ key, label }) => {
        const selected = key === value;
        return (
          <button
            key={String(key)}
            type="button"
            data-testid={testIdPrefix ? `${testIdPrefix}-${key}` : undefined}
            aria-pressed={selected}
            onClick={() => onChange(key)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${equalWidth ? "w-36 text-center" : ""} ${
              selected ? "border-primary bg-primary text-white" : "border-line bg-white text-muted hover:text-primaryDark"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Ventana que sube sobre la página, como las de la app: encabezado con la flecha de volver a la izquierda y el título
 * a su derecha, y el cuerpo con su propio scroll. El fondo es un elemento aparte (hermano) para que no le robe los
 * gestos al scroll del cuerpo.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  width = "max-w-2xl",
  variant = "sheet",
  testId = "modal",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  /** «sheet» sube desde abajo (y llena el alto en el celular); «center» es una ventana en el medio. */
  variant?: "sheet" | "center";
  testId?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={`fixed inset-0 z-50 flex justify-center ${variant === "sheet" ? "items-end sm:items-center" : "items-center"} px-0 sm:px-4`}>
      <div data-testid={`${testId}-backdrop`} className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden bg-white shadow-lift ${width} ${
          variant === "sheet" ? "rounded-t-3xl sm:rounded-3xl" : "mx-4 rounded-3xl"
        }`}
      >
        <header className="flex items-center gap-3 border-b border-line/70 px-5 py-4">
          <button
            type="button"
            aria-label="Volver"
            data-testid={`${testId}-back`}
            onClick={onClose}
            className="rounded-full p-1.5 text-primaryDark transition hover:bg-primary/10"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="flex-1 text-lg font-bold text-ink">{title}</h2>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-testid={`${testId}-body`}>
          {children}
        </div>
        {footer && <footer className="border-t border-line/70 px-5 py-4">{footer}</footer>}
      </div>
    </div>
  );
}

/** Aviso de confirmación con dos botones (el de confirmar es del color de la app, o rojo si borra algo). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  busy = false,
  stacked = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  /** Los botones uno debajo del otro, con el principal arriba. */
  stacked?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden />
      <div role="alertdialog" aria-label={title} className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-lift">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <div className="mt-2 text-sm text-muted">{message}</div>
        <div className={`mt-6 flex gap-3 ${stacked ? "flex-col-reverse" : ""}`}>
          <Button tone="outline" className="flex-1" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button tone={danger ? "danger" : "primary"} className="flex-1" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Franja de mensaje (éxito, error o información) dentro de un formulario. */
export function Notice({ tone, children, center = false }: { tone: "error" | "ok" | "info"; children: ReactNode; /** El texto va centrado en su cuadro. */ center?: boolean }) {
  const tones = {
    error: "border-danger/30 bg-danger/10 text-danger",
    ok: "border-primary/30 bg-primary/10 text-primaryDark",
    info: "border-warn/40 bg-warn/15 text-warnInk",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-2.5 text-sm ${center ? "text-center" : ""} ${tones[tone]}`}>
      {children}
    </div>
  );
}
