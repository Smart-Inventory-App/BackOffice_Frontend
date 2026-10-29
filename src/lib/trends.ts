import { capitalize } from "./format";

/**
 * Cuentas de la pantalla «Tendencias de Consumo»: sacar de los datos diarios lo que se muestra, sin tocar la pantalla.
 */

export interface DayPoint {
  /** Día como AAAA-MM-DD. */
  day: string;
  quantity: number;
}

/** Los períodos que se pueden elegir, en días. */
// El dashboard suma los 90 días (en la app son 7, 14 y 30)
export const TREND_PERIODS = [7, 14, 30, 90] as const;
// El detalle de un usuario ofrece 7, 14, 30 y 60 días
export const USER_TREND_PERIODS = [7, 14, 30, 60] as const;
export type TrendPeriod = (typeof TREND_PERIODS)[number] | (typeof USER_TREND_PERIODS)[number];

/** Una fecha AAAA-MM-DD como fecha local (sin correrse de día por la zona horaria). */
export function parseDay(day: string): Date {
  const [year, month, date] = day.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, date);
}


/** «Miércoles 22 de octubre» */
export function formatDayLong(day: string): string {
  // El idioma agrega una coma después del día de la semana: acá se escribe sin ella («Jueves 22 de octubre»)
  return capitalize(parseDay(day).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }).replace(",", ""));
}

/** «22 de octubre» */
export function formatDayMonth(day: string): string {
  return parseDay(day).toLocaleDateString("es-AR", { day: "numeric", month: "long" });
}

/** «22 oct» */
export function formatDayShort(day: string): string {
  return parseDay(day).toLocaleDateString("es-AR", { day: "numeric", month: "short" }).replace(".", "");
}

/** El día más consumido del período (el primero si hay empate), o `null` si no hubo consumo. */
export function peakIndex(days: DayPoint[]): number | null {
  let best: number | null = null;
  days.forEach((point, index) => {
    if (point.quantity > 0 && (best === null || point.quantity > days[best].quantity)) best = index;
  });
  return best;
}

/** Cuánto se consumió por día, con un decimal. */
export function averagePerDay(total: number, period: number): number {
  return period > 0 ? Math.round((total / period) * 10) / 10 : 0;
}

export interface TrendChange {
  direction: "up" | "down" | "same";
  /** Porcentaje de diferencia, entero y sin signo. */
  percent: number;
}

/** Cómo cambió el consumo frente al período anterior. Sin consumo antes no hay con qué comparar. */
export function changeVsPrevious(total: number, previousTotal: number | null): TrendChange | null {
  if (previousTotal === null || previousTotal <= 0) return null;
  const percent = Math.round((Math.abs(total - previousTotal) / previousTotal) * 100);
  if (percent === 0) return { direction: "same", percent: 0 };
  return { direction: total > previousTotal ? "up" : "down", percent };
}

export interface MonthSegment {
  key: string;
  /** Nombre del mes, completo y abreviado. */
  long: string;
  short: string;
  /** Cuántos días seguidos del período caen en ese mes. */
  count: number;
}

/** Tramos de días seguidos que pertenecen al mismo mes: con eso se rotula el gráfico. */
export function monthSegments(days: DayPoint[]): MonthSegment[] {
  const segments: MonthSegment[] = [];
  for (const point of days) {
    const date = parseDay(point.day);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const last = segments[segments.length - 1];
    if (last && last.key === key) {
      last.count += 1;
    } else {
      segments.push({
        key,
        long: capitalize(date.toLocaleDateString("es-AR", { month: "long" })),
        short: capitalize(date.toLocaleDateString("es-AR", { month: "short" }).replace(".", "")),
        count: 1,
      });
    }
  }
  return segments;
}

/** Cada cuántos días se escribe el número del día bajo el gráfico, según lo ancha que queda cada barra. */
export function labelStep(barWidth: number): number {
  if (barWidth >= 16) return 1;
  if (barWidth >= 10) return 2;
  return 3;
}

/** Alto de una barra: proporcional al día de mayor consumo, con un mínimo para que un día sin consumo igual se vea. */
export function barHeight(quantity: number, max: number, full: number, minimum = 3): number {
  if (max <= 0 || quantity <= 0) return minimum;
  return Math.max(minimum, Math.round((quantity / max) * full));
}
