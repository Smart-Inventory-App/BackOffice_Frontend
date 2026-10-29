import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { truncate } from "@/lib/format";

// Todos los filtros miden lo mismo, entren o no los textos: lo que no entra se corta con «...»
export const FILTER_CLASS =
  "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 text-left text-sm outline-none focus:border-primary";

/** Cuántas opciones se ven a la vez al abrir el menú: el resto se alcanza desplazándose. */
export const VISIBLE_OPTIONS = 10;
const OPTION_HEIGHT_REM = 2.5;

export interface DropdownOption {
  value: string;
  label: string;
}

/**
 * Un filtro desplegable: muestra «Todos…» o la opción elegida y, al abrirse, las primeras 10 opciones; si hay más, el
 * menú se desplaza para llegar al resto. Se cierra al elegir, al tocar afuera o con Escape.
 */
export default function FilterDropdown({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const chosen = options.find((o) => o.value === value);
  const shownLabel = value ? (chosen?.label ?? value) : allLabel;
  const all: DropdownOption[] = [{ value: "", label: allLabel }, ...options];

  return (
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={value ? shownLabel : undefined}
        onClick={() => setOpen((v) => !v)}
        className={FILTER_CLASS}
      >
        <span className="min-w-0 truncate">{shownLabel}</span>
        <ChevronDown size={16} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          data-testid={`dropdown-${label}`}
          className="absolute left-0 right-0 z-30 mt-1 overflow-y-auto rounded-xl border border-line bg-white shadow-lift"
          style={{ maxHeight: `${VISIBLE_OPTIONS * OPTION_HEIGHT_REM}rem` }}
        >
          {all.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value || "__all__"}
                type="button"
                role="option"
                aria-selected={selected}
                title={option.label}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex h-10 w-full items-center justify-between gap-2 px-4 text-left text-sm transition hover:bg-canvas ${
                  selected ? "font-semibold text-primaryDark" : "text-ink"
                }`}
              >
                <span className="min-w-0 truncate">{truncate(option.label)}</span>
                {selected && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Un filtro de la lista con opciones de texto simple. */
export function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  // El filtro que se trae del dashboard puede no estar entre las opciones todavía
  const shown = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <FilterDropdown label={label} allLabel={allLabel} value={value} options={shown.map((o) => ({ value: o, label: o }))} onChange={onChange} />
  );
}
