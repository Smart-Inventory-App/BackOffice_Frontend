import { screen } from "@testing-library/react";
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
      consumo_por_dia: [],
      top_productos: [],
    },
  }));
}

describe("Metricas (Tendencias de Consumo)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.effectiveIsAdmin = false;
    serve();
  });

  it("para un usuario muestra las tendencias de su inventario", async () => {
    renderWithProviders(<Metricas />);

    expect(await screen.findByRole("heading", { name: "Tendencias de Consumo" })).toBeInTheDocument();
    expect(screen.getByText("Mirá cuánto consumís y reponés")).toBeInTheDocument();
    await screen.findByTestId("trends-panel");
    expect(api.get).toHaveBeenCalledWith("/me/metrics", { params: { period: 14 } });
    expect(api.get).not.toHaveBeenCalledWith("/admin/metrics", expect.anything());
  });

  it("para un administrador muestra el consumo de toda la plataforma", async () => {
    auth.effectiveIsAdmin = true;
    renderWithProviders(<Metricas />);

    expect(await screen.findByText("Cuánto se consume y se repone en toda la plataforma")).toBeInTheDocument();
    await screen.findByTestId("trends-panel");
    expect(api.get).toHaveBeenCalledWith("/admin/metrics", { params: { period: 14 } });
  });
});
