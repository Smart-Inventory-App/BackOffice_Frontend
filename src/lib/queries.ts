import type { QueryClient } from "@tanstack/react-query";

/**
 * Todo lo que depende del inventario del usuario y que cambia cuando entra o sale stock, se edita un producto o se cambia
 * una regla de alerta. Cada consulta tiene SU propia clave: dos pantallas que piden cosas distintas con la misma clave se
 * pisan los datos y una de las dos se rompe (así falló «Inventario» al pasar por «Alertas»).
 */
export const INVENTORY_QUERY_KEYS = [
  "my-stats",
  "my-products",
  "my-recent-products",
  "my-changes",
  "my-alerts",
  "my-alert-levels",
  "my-expiring",
  "trends",
] as const;

export function invalidateInventory(qc: QueryClient) {
  INVENTORY_QUERY_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
}
