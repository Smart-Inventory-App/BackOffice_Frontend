import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Dashboard from "./Dashboard";
import type { DashboardStats } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "@/lib/api";

function stats(overrides: Partial<DashboardStats> = {}): DashboardStats {
  return {
    total_users: 50,
    active_users: 40,
    inactive_users: 10,
    new_users_last_7d: 5,
    total_products: 300,
    products_with_image: 100,
    low_stock_products: 8,
    expiring_soon_products: 3,
    expired_products: 2,
    products_by_category: [{ label: "Almacén", count: 10 }],
    top_users_by_products: [{ user_id: "u1", email: "top@test.com", count: 20 }],
    products_per_day_last_14d: [{ day: "2026-01-01", count: 5 }],
    ...overrides,
  };
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra las métricas principales", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: stats() });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText("50")).toBeInTheDocument();
    expect(screen.getByText("5 nuevos (7 días)")).toBeInTheDocument();
    expect(screen.getByText("top@test.com")).toBeInTheDocument();
  });

  it("si falla la carga, muestra el mensaje de error", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("fallo"));
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText("No se pudieron cargar las métricas.")).toBeInTheDocument();
  });

  it("sin datos de categorías ni usuarios top, muestra los estados vacíos", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: stats({ products_by_category: [], top_users_by_products: [] }),
    });
    renderWithProviders(<Dashboard />);
    await screen.findByText("50");
    expect(screen.getAllByText("Sin datos todavía").length).toBe(2);
  });
});
