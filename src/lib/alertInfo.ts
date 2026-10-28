import type { AlertOut, AlertLevel } from "@/lib/types";

/** Colores de cada nivel de alerta, los mismos de la app: fondo suave y texto oscuro. */
export const LEVEL_TONES: Record<AlertLevel, { background: string; text: string; border: string; label: string }> = {
  critical: { background: "#e5484d40", text: "#671a1c", border: "#e5484d", label: "Críticas" },
  warning: { background: "#fbbc0540", text: "#564209", border: "#fbbc05", label: "Advertencias" },
};

const daysText = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
const unitsText = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;
// Cuánto alcanza el stock, dicho como una persona: nunca «0 días»
const coverageText = (days: number) => (days <= 0 ? "menos de 1 día" : daysText(days));
// «Queda 1 ud.» / «Quedan 3 ud.»
const left = (n: number) => `${n === 1 ? "Queda" : "Quedan"} ${n} ud.`;
const scopeText = (alert: AlertOut) => (alert.rule_scope === "product" ? "la regla de este producto" : "tu regla general");

/** «hoy», «mañana» o «en N días»: nunca «en 0 días». */
export function whenText(days: number): string {
  if (days <= 0) return "hoy";
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

/** Una fecha AAAA-MM-DD como «5 de marzo». */
export function expiryDate(value: string | null): string {
  const [year, month, day] = (value ?? "").slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es-AR", { day: "numeric", month: "long" });
}

/** Qué le pasa al producto, en pocas palabras: «Vence en 3 días», «Se agota mañana»... */
export function alertTitle(alert: AlertOut): string {
  switch (alert.type) {
    case "stock_low_coverage":
      return `Se agota ${whenText(alert.days_until_stockout ?? 0)}`;
    case "expiry": {
      const days = alert.days_to_expiry ?? 0;
      if (days < -1) return `Venció hace ${-days} días`;
      if (days === -1) return "Venció ayer";
      if (days === 0) return "Vence hoy";
      if (days === 1) return "Vence mañana";
      return `Vence en ${days} días`;
    }
    case "slow_pace":
      return "Riesgo de vencimiento";
    default:
      return "Información";
  }
}

/** La descripción que acompaña a la alerta en la lista: dice qué pasa con números concretos. */
export function alertDescription(alert: AlertOut): string {
  switch (alert.type) {
    case "expiry": {
      const days = alert.days_to_expiry ?? 0;
      const when = expiryDate(alert.product_expiry);
      const stock = left(alert.product_stock);
      if (days < 0) return `Venció el ${when}. ${stock} que ya no conviene consumir.`;
      const limit = alert.limit_days != null ? ` y tu aviso es con menos de ${daysText(alert.limit_days)}` : " en stock";
      return `Vence el ${when}. ${stock}${limit}.`;
    }
    case "stock_low_coverage": {
      const days = coverageText(alert.days_until_stockout ?? 0);
      const minimum = alert.limit_days != null ? ` Mínimo configurado de ${daysText(alert.limit_days)}.` : "";
      const single = alert.product_stock === 1;
      return `${left(alert.product_stock)} ${single ? "restante que alcanza" : "restantes que alcanzan"} para ${days}.${minimum}`;
    }
    case "slow_pace": {
      const units = alert.units_wasted ?? 0;
      const verb = units === 1 ? "se vencerá" : "se vencerán";
      return `Al ritmo actual, ${unitsText(units)} ${verb} ${whenText(alert.days_to_expiry ?? 0)}.`;
    }
    default:
      return "";
  }
}

const PREDICTION_NOTE = "Calculado por el modelo predictivo con tu historial de consumo.";

/** La explicación completa para el detalle de la alerta: un párrafo por idea. */
export function alertDetails(alert: AlertOut): string[] {
  const critical = alert.level === "critical";
  switch (alert.type) {
    case "expiry": {
      const days = alert.days_to_expiry ?? 0;
      const when = expiryDate(alert.product_expiry);
      const paragraphs: string[] = [];
      if (days < 0) paragraphs.push(`Venció el ${when} (${days === -1 ? "ayer" : `hace ${daysText(-days)}`}).`);
      else if (days === 0) paragraphs.push(`Vence hoy, ${when}.`);
      else if (days === 1) paragraphs.push(`Vence mañana, ${when}.`);
      else paragraphs.push(`Vence el ${when}, en ${daysText(days)}.`);
      paragraphs.push(`${alert.product_stock === 1 ? "Queda" : "Quedan"} ${unitsText(alert.product_stock)} en stock.`);
      // A un producto que ya venció no le sirve «te avisamos cuando falten menos de...»
      if (alert.limit_days != null && days >= 0) {
        paragraphs.push(`Te avisamos cuando faltan menos de ${daysText(alert.limit_days)} para el vencimiento (${scopeText(alert)}).`);
      }
      paragraphs.push(
        critical
          ? days < 0
            ? "Ya no conviene consumirlo."
            : "Ya está dentro de ese período: conviene usarlo primero."
          : "Todavía no llegó a ese período, pero se acerca.",
      );
      return paragraphs;
    }
    case "stock_low_coverage": {
      const stock = alert.product_stock;
      const subject = stock === 1 ? "la unidad que queda alcanza" : `las ${unitsText(stock)} que quedan alcanzan`;
      const paragraphs = [`Con el consumo, ${subject} para ${coverageText(alert.days_until_stockout ?? 0)}.`];
      if (alert.limit_days != null) {
        paragraphs.push(`El mínimo es de ${daysText(alert.limit_days)} (${scopeText(alert)}): ${critical ? "está por debajo de él." : "se está acercando."}`);
      }
      if (alert.suggested_qty) paragraphs.push(`Para volver a esa cobertura se sugiere reponer ${unitsText(alert.suggested_qty)}.`);
      paragraphs.push(PREDICTION_NOTE);
      return paragraphs;
    }
    case "slow_pace": {
      const units = alert.units_wasted ?? 0;
      const paragraphs = [
        alertDescription(alert),
        `Se está consumiendo este producto más lento de lo que tarda en vencer, y ${units === 1 ? "esa unidad quedaría" : "esas unidades quedarían"} sin usar.`,
      ];
      if (critical) paragraphs.push("Su vencimiento ya está dentro del período de aviso.");
      paragraphs.push(PREDICTION_NOTE);
      return paragraphs;
    }
    default:
      return [];
  }
}

export type TypeFilter = "todas" | "stock" | "vencimiento";

export const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "stock", label: "Stock" },
  { key: "vencimiento", label: "Vencimiento" },
];
