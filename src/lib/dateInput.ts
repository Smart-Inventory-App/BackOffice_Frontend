// Entrada de fechas como DD/MM/AAAA (se escriben solo los números), igual que en la app; el formulario guarda AAAA-MM-DD.

export function formatDateDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** De «05/03/2027» a «2027-03-05», o `null` si no está completa o el día no existe. */
export function displayToIso(display: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isRealDate ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/** De «2027-03-05» a «05/03/2027»; si no es una fecha ISO, el texto tal cual. */
export function isoToDisplay(iso?: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (iso ?? "");
}
