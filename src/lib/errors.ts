interface ValidationItem {
  loc?: unknown[];
  msg?: string;
  type?: string;
  ctx?: Record<string, unknown>;
}

/** Un error de validación de FastAPI (un elemento de `detail` en un 422) en una frase. */
function describeValidation(item: ValidationItem): string {
  const campo = [...(item.loc ?? [])].reverse().find((p) => typeof p === "string" && p !== "body") as string | undefined;
  const ctx = item.ctx ?? {};

  let problema: string;
  switch (item.type) {
    case "missing":
      problema = "es obligatorio";
      break;
    case "string_too_long":
      problema = `no puede tener más de ${ctx.max_length} caracteres`;
      break;
    case "string_too_short":
      problema = `tiene que tener al menos ${ctx.min_length} caracteres`;
      break;
    case "greater_than":
      problema = `tiene que ser mayor a ${ctx.gt}`;
      break;
    case "greater_than_equal":
      problema = `no puede ser menor a ${ctx.ge}`;
      break;
    case "less_than":
      problema = `tiene que ser menor a ${ctx.lt}`;
      break;
    case "less_than_equal":
      problema = `no puede ser mayor a ${ctx.le}`;
      break;
    case "int_parsing":
    case "int_type":
    case "int_from_float":
      problema = "tiene que ser un número entero";
      break;
    case "date_parsing":
    case "date_type":
    case "date_from_datetime_parsing":
      problema = "no es una fecha válida";
      break;
    default:
      problema = item.msg || "no es válido";
  }

  return campo ? `${campo}: ${problema}` : problema;
}

/**
 * El mensaje de un error de la API, listo para mostrar.
 *
 * FastAPI responde `detail` como texto en los errores propios del servicio y
 * como una **lista de objetos** en los de validación (422). Renderizar esa lista
 * directamente en un componente de React lo rompe ("Objects are not valid as a
 * React child") y deja la pantalla en blanco, así que todo error que se muestre
 * pasa por acá.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;

  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail)) {
    const frases = detail
      .map((item) => (typeof item === "string" ? item : describeValidation((item ?? {}) as ValidationItem)))
      .filter(Boolean);
    if (frases.length) return frases.join(". ");
  }

  return fallback;
}
