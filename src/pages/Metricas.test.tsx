import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Metricas from "./Metricas";
import type { MyMetrics } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "@/lib/api";

function metrics(overrides: Partial<MyMetrics> = {}): MyMetrics {
  return {
    period_days: 30,
    total_consumido: 12,
    total_entradas: 20,
    consumo_por_dia: [{ day: "2026-01-01", quantity: 3 }],
    top_productos: [{ product_id: 1, nombre: "Yerba Mate", cantidad: 8 }],
    productos_menos_usados: [{ product_id: 2, nombre: "Sal", cantidad: 1 }],
    ...overrides,
  };
}

describe("Metricas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el consumo del período y permite cambiarlo", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: metrics() });
    renderWithProviders(<Metricas />);

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("Consumido en el período")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "7 días" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/me/metrics", { params: { period: 7 } }),
    );
  });

  it("si falla la carga, muestra el mensaje de error", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("fallo"));
    renderWithProviders(<Metricas />);
    expect(await screen.findByText("No se pudieron cargar las métricas.")).toBeInTheDocument();
  });

  it("sin consumo, sin top productos, muestra los estados vacíos correspondientes", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: metrics({ total_consumido: 0, top_productos: [], productos_menos_usados: [] }),
    });
    renderWithProviders(<Metricas />);

    expect(await screen.findByText("Sin consumo registrado todavía")).toBeInTheDocument();
    expect(screen.getAllByText("Sin datos todavía").length).toBe(2);
  });

  it("con top productos pero sin datos suficientes para comparar, lo indica", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: metrics({ productos_menos_usados: [] }),
    });
    renderWithProviders(<Metricas />);
    expect(
      await screen.findByText("No hay suficientes productos para comparar"),
    ).toBeInTheDocument();
  });
});
