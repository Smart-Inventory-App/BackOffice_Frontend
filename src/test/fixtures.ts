import type { PlatformOverview } from "@/lib/types";

const days = (count: number, quantities: Record<number, number> = {}) =>
  Array.from({ length: count }, (_, i) => ({
    day: `2026-10-${String(9 + i).padStart(2, "0")}`,
    count: quantities[i] ?? 0,
  }));

/** Un resumen de la plataforma con datos de ejemplo, para probar el dashboard del administrador. */
export function platformOverview(overrides: Partial<PlatformOverview> = {}): PlatformOverview {
  return {
    period_days: 14,
    users: {
      total: 50,
      active: 40,
      new_in_period: 6,
      active_in_period: 30,
      with_products: 20,
      registrations_per_day: days(14, { 13: 6 }),
    },
    activity_per_day: days(14).map((d, i) => ({ day: d.day, logins: i % 3, entradas: i % 2, salidas: 1 })),
    inventory: {
      products: 300,
      units: 1234,
      with_image: 100,
      without_expiry: 60,
    },
    most_active_users: [
      { user_id: "u1", email: "top@test.com", name: "Ana Gómez", username: "ana", movements: 25, entries: 10, exits: 15, products: 20, units: 1500, is_active: true },
      { user_id: "u3", email: "baja@test.com", name: null, username: null, movements: 5, entries: 5, exits: 0, products: 3, units: 12, is_active: false },
    ],
    ocr: {
      runs: 10,
      succeeded: 8,
      avg_ms: 1500,
      avg_confidence: 0.87,
      by_type: [
        { doc_type: "barcode", ejecuciones: 6, exitosas: 6, fallidas: 0 },
        { doc_type: "receipt", ejecuciones: 4, exitosas: 2, fallidas: 2 },
      ],
    },
    ...overrides,
  };
}
