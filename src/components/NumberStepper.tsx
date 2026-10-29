import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Campo numérico con dos botones pegados al borde (subir y bajar) que se detienen en los extremos, y debajo un mensaje con
 * el rango aceptado, como el de la app. El valor se maneja como texto para poder escribirlo con libertad y validarlo al
 * guardar.
 */
export default function NumberStepper({
  label,
  value,
  onChange,
  min,
  max,
  unit,
  testId,
  help,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  /** Lo que se mide, para el mensaje del rango: «días», «horas». */
  unit: string;
  testId: string;
  help?: string;
}) {
  const number = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(number) && number >= min && number <= max;
  const step = (delta: number) => {
    const base = Number.isInteger(number) ? number : min;
    onChange(String(Math.min(max, Math.max(min, base + delta))));
  };
  return (
    <div>
      <label htmlFor={testId} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={testId}
          data-testid={testId}
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, String(max).length))}
          className={`w-full rounded-xl border bg-white px-4 py-2.5 pr-11 text-sm outline-none transition focus:border-primary ${
            valid ? "border-[#D9D9D9]" : "border-danger"
          }`}
        />
        <div className="absolute inset-y-0 right-0 flex w-9 flex-col overflow-hidden rounded-r-xl border-l border-line/70">
          <button
            type="button"
            aria-label={`Subir ${label}`}
            data-testid={`${testId}-up`}
            disabled={valid && number >= max}
            onClick={() => step(1)}
            className="flex flex-1 items-center justify-center text-primaryDark transition hover:bg-primary/10 disabled:opacity-30"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            aria-label={`Bajar ${label}`}
            data-testid={`${testId}-down`}
            disabled={valid && number <= min}
            onClick={() => step(-1)}
            className="flex flex-1 items-center justify-center border-t border-line/70 text-primaryDark transition hover:bg-primary/10 disabled:opacity-30"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
      <p className={`mt-1 text-xs ${valid ? "text-muted" : "text-danger"}`} data-testid={`${testId}-range`}>
        {help ? `${help} ` : ""}Entre {min} y {max} {unit}.
      </p>
    </div>
  );
}

/** Si un valor escrito en un {@link NumberStepper} es un entero dentro del rango. */
export function inRange(value: string, min: number, max: number): boolean {
  const number = Number(value);
  return value.trim() !== "" && Number.isInteger(number) && number >= min && number <= max;
}
