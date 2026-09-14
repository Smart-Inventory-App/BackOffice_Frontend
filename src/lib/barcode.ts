/**
 * El campo de código de barras, del lado del navegador.
 * Validado también en el backend.
 */

/** Deja sólo lo que puede tener un código escrito a mano: dígitos, espacios y guiones. */
export function limpiarCodigo(valor: string): string {
  return valor.replace(/[^\d\s-]/g, "");
}

/** Los dígitos solos, que es lo que se compara y lo que tiene largo. */
export function digitosDelCodigo(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Largos que puede tener un GTIN: EAN-8, UPC-A, EAN-13 y GTIN-14. */
export const LARGOS_CODIGO = [8, 12, 13, 14];
