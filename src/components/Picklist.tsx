import { useState } from "react";

export function addIfMissing(options: string[], value: string | null | undefined): string[] {
  if (!value || options.includes(value)) return options;
  return [...options, value].sort((a, b) => a.localeCompare(b));
}

export function Picklist({
  label,
  value,
  options,
  onChange,
  required,
  emptyLabel,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  emptyLabel?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");

  const confirmAdd = () => {
    const trimmed = newValue.trim();
    setAdding(false);
    setNewValue("");
    if (trimmed) onChange(trimmed);
  };

  if (adding) {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
        <div className="flex gap-2">
          <input
            autoFocus
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmAdd();
              }
            }}
            className="flex-1 rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={confirmAdd}
            className="rounded-xl bg-primary px-3 text-sm font-medium text-white"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setNewValue(""); }}
            className="rounded-xl border border-line px-3 text-sm text-muted"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // El valor actual siempre se muestra, aunque todavía no haya llegado la
  // lista de opciones del servidor (evita que el select "parpadee" a blanco
  // mientras se resuelven varias consultas en paralelo).
  const displayOptions = value && !options.includes(value) ? [value, ...options] : options;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === "__new__") {
            setAdding(true);
            return;
          }
          onChange(e.target.value);
        }}
        required={required}
        className="w-full rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
      >
        {emptyLabel ? (
          <option value="">{emptyLabel}</option>
        ) : (
          <option value="" disabled>
            Seleccionar…
          </option>
        )}
        {displayOptions.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="__new__">+ Nueva…</option>
      </select>
    </div>
  );
}
