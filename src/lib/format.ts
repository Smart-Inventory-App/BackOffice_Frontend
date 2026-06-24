/** Trunca un texto a `max` caracteres y agrega "..." si lo excede. */
export function truncate(value: string | null | undefined, max = 50): string {
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
