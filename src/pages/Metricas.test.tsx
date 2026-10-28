import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Metricas from "./Metricas";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

const auth = vi.hoisted(() => ({ effectiveIsAdmin: false }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => auth,
}));

import { api } from "@/lib/api";

function serve() {
  vi.mocked(api.get).mockImplementation(async (_url: string, config?: any) => ({
    data: {
      period_days: config.params.period,
      total_consumido: 0,
      total_entradas: 0,
      total_ingresos: 0,
      consumo_por_dia: [],
      ingresos_por_dia: [],
      top_productos: [],
    },
  }));
}

describe("Metricas (Tendencias)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.effectiveIsAdmin = false;
    serve();
  });

  it("para un usuario muestra las tendencias de su inventario", async () => {
    renderWithProviders(<Metricas />);

    expect(await screen.findByRole("heading", { name: "Tendencias de consumo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tendencias de ingresos" })).toBeInTheDocument();
    expect(screen.getByText("Mirá cuánto consumís y cuánto ingresás")).toBeInTheDocument();
    await screen.findByTestId("trends-panel");
    await screen.findByTestId("incomes-panel");
    expect(api.get).toHaveBeenCalledWith("/me/metrics", { params: { period: 14 } });
    expect(api.get).not.toHaveBeenCalledWith("/admin/metrics", expect.anything());
  });

  it("para un administrador muestra el consumo y los ingresos de toda la plataforma", async () => {
    auth.effectiveIsAdmin = true;
    renderWithProviders(<Metricas />);

    expect(await screen.findByText("Cuánto se consume y cuánto ingresa en toda la plataforma")).toBeInTheDocument();
    await screen.findByTestId("trends-panel");
    await screen.findByTestId("incomes-panel");
    expect(api.get).toHaveBeenCalledWith("/admin/metrics", { params: { period: 14 } });
  });

  it("el período se elige una sola vez y vale para las dos mitades", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (_url: string, config?: any) => {
      const series = Array.from({ length: config.params.period }, (_, i) => ({ day: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, quantity: 1 }));
      return {
        data: { period_days: config.params.period, total_consumido: 0, total_entradas: 0, total_ingresos: 0, consumo_por_dia: series, ingresos_por_dia: series, top_productos: [] },
      };
    });
    renderWithProviders(<Metricas />);
    await screen.findByTestId("incomes-panel");

    expect(screen.getAllByTestId("trends-period-90")).toHaveLength(1);
    await user.click(screen.getByTestId("trends-period-90"));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/me/metrics", { params: { period: 90 } }));
    const consumo = within(screen.getByTestId("trends-section-consumo"));
    const ingresos = within(screen.getByTestId("trends-section-ingresos"));
    expect(await consumo.findByTestId("trends-bar-89")).toBeInTheDocument();
    expect(await ingresos.findByTestId("incomes-bar-89")).toBeInTheDocument();
  });
});
