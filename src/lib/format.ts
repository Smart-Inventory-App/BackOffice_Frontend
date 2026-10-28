/** Cuántos caracteres de un dato largo se muestran en todo el dashboard antes del «...». */
export const FIELD_MAX = 50;

/** Trunca un texto a `max` caracteres y agrega "..." si lo excede. */
export function truncate(value: string | null | undefined, max = FIELD_MAX): string {
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

/** Un número con puntos de miles: 1234567 → «1.234.567». */
export function formatThousands(value: number): string {
  return new Intl.NumberFormat("es-AR").format(value);
}

/** Todas las fechas y horas del panel se muestran en hora argentina, igual que en la app. */
export const AR_TIME_ZONE = "America/Argentina/Buenos_Aires";

/** «27/10/2026 21:47» en hora argentina; «—» si no hay fecha. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  // La base devuelve los instantes en UTC; si llega sin zona se la agrega, para no correrlos
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: AR_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

/** «27/10/2026» de una fecha AAAA-MM-DD (un vencimiento), sin correrse de día por la zona horaria. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
}

/** La inicial en mayúscula: «octubre» → «Octubre». */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
