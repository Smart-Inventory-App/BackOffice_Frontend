import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import MyDashboard from "./MyDashboard";
import type { MyStats } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "@/lib/api";

function stats(overrides: Partial<MyStats> = {}): MyStats {
  return {
    total_products: 12,
    products_with_image: 5,
    low_stock_products: 1,
    expiring_soon_products: 2,
    expired_products: 0,
    products_by_category: [{ label: "Almacén", count: 4 }],
    ...overrides,
  };
}

describe("MyDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra las métricas del usuario", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: stats() });
    renderWithProviders(<MyDashboard />);
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("5 con imagen")).toBeInTheDocument();
  });

  it("si falla la carga, muestra el mensaje de error", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("fallo"));
    renderWithProviders(<MyDashboard />);
    expect(await screen.findByText("No se pudieron cargar tus métricas.")).toBeInTheDocument();
  });

  it("sin categorías, muestra el estado vacío", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: stats({ products_by_category: [] }) });
    renderWithProviders(<MyDashboard />);
    expect(await screen.findByText("Sin datos todavía")).toBeInTheDocument();
  });
});
