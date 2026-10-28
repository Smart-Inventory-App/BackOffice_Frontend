import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient, renderWithProviders } from "@/test/test-utils";
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
    total_units: 1234,
    critical_alerts: 6,
    warning_alerts: 4,
    users_with_alerts: 3,
    consumed_last_7d: 75,
    restocked_last_7d: 90,
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
    expect(await screen.findByTestId("stat-users-value")).toHaveTextContent("50");
    expect(screen.getByText("5 nuevos (7 días)")).toBeInTheDocument();
    expect(screen.getByText("top@test.com")).toBeInTheDocument();
  });

  it("las cuatro tarjetas principales tienen el formato del inicio de la app", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: stats() });
    renderWithProviders(<Dashboard />);
    await screen.findByTestId("stat-users");

    expect(screen.getByTestId("stat-products-value")).toHaveTextContent("300");
    expect(screen.getByTestId("stat-products-comment")).toHaveTextContent("1.234 unidades");
    expect(screen.getByTestId("stat-expiring-value")).toHaveTextContent("3");
    expect(screen.getByTestId("stat-expiring-comment")).toHaveTextContent("2 ya vencidos");
    expect(screen.getByTestId("stat-low-value")).toHaveTextContent("8");
    expect(screen.getByTestId("stat-low-comment")).toHaveTextContent("Alertas de stock");
  });

  it("muestra las alertas críticas y las advertencias de toda la plataforma, y el consumo de la semana", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: stats() });
    renderWithProviders(<Dashboard />);
    await screen.findByTestId("stat-users");

    expect(screen.getByTestId("alerts-critical")).toHaveTextContent("6");
    expect(screen.getByTestId("alerts-warning")).toHaveTextContent("4");
    expect(screen.getByTestId("alerts-users")).toHaveTextContent("3");
    expect(screen.getByText("Consumido (7 días)").nextElementSibling).toHaveTextContent("75");
    expect(screen.getByText("Repuesto (7 días)").nextElementSibling).toHaveTextContent("90");
    expect(screen.queryByText(/≤ 1 unidad/)).not.toBeInTheDocument();
  });

  function renderWithRoutes() {
    return render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/usuarios" element={<p>USUARIOS</p>} />
            <Route path="/productos" element={<p>PRODUCTOS</p>} />
            <Route path="/metricas" element={<p>TENDENCIAS</p>} />
            <Route path="/usuarios/:id" element={<UserProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  function UserProbe() {
    return <p>USUARIO {useLocation().pathname}</p>;
  }

  it("las tarjetas y los enlaces llevan a usuarios, productos, tendencias y al detalle de un usuario", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: stats() });
    renderWithRoutes();

    await user.click(await screen.findByTestId("stat-users"));
    expect(await screen.findByText("USUARIOS")).toBeInTheDocument();
  });

  it("«Productos», «Vencimientos» y «Stock bajo» llevan a los productos", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: stats() });
    const { unmount } = renderWithRoutes();
    await user.click(await screen.findByTestId("stat-products"));
    expect(await screen.findByText("PRODUCTOS")).toBeInTheDocument();
    unmount();

    renderWithRoutes();
    await user.click(await screen.findByTestId("stat-expiring"));
    expect(await screen.findByText("PRODUCTOS")).toBeInTheDocument();
  });

  it("«Stock bajo» lleva a los productos y «Ver tendencias» a las tendencias", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: stats() });
    const { unmount } = renderWithRoutes();
    await user.click(await screen.findByTestId("stat-low"));
    expect(await screen.findByText("PRODUCTOS")).toBeInTheDocument();
    unmount();

    renderWithRoutes();
    await user.click(await screen.findByRole("button", { name: "Ver tendencias de consumo" }));
    expect(await screen.findByText("TENDENCIAS")).toBeInTheDocument();
  });

  it("el usuario con más productos lleva a su detalle", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: stats() });
    renderWithRoutes();

    await user.click(await screen.findByRole("button", { name: "top@test.com" }));

    expect(await screen.findByText("USUARIO /usuarios/u1")).toBeInTheDocument();
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
    await screen.findByTestId("stat-users");
    expect(screen.getAllByText("Sin datos todavía").length).toBe(2);
  });
});
