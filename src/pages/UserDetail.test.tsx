import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import UserDetail from "./UserDetail";
import type { AppUserDetail } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "@/lib/api";

function renderDetail(id = "u1") {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/usuarios/${id}`]}>
        <Routes>
          <Route path="/usuarios/:id" element={<UserDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function userDetail(overrides: Partial<AppUserDetail> = {}): AppUserDetail {
  return {
    id: "u1",
    email: "usuario@test.com",
    is_active: true,
    is_admin: false,
    created_at: "2026-01-15T00:00:00Z",
    username: "usuario1",
    first_name: "Ana",
    last_name: "Gómez",
    product_count: 1,
    products: [
      {
        id: 1,
        nombre: "Yerba Mate",
        marca: null,
        categoria: "Almacén",
        stock: 3,
        vencimiento: "2026-05-01",
        descripcion: null,
        imagen_url: null,
        ubicacion: null,
        codigo_barras: null,
        created_at: null,
        owner: { user_id: "u1", email: "usuario@test.com" },
      },
    ],
    ...overrides,
  };
}

describe("UserDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra los datos del usuario y sus productos", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: userDetail() });
    renderDetail();

    expect(await screen.findByText("usuario@test.com")).toBeInTheDocument();
    expect(screen.getByText("Ana Gómez")).toBeInTheDocument();
    expect(screen.getByText("Yerba Mate")).toBeInTheDocument();
    expect(screen.getByText(/Almacén · stock 3 · vence 2026-05-01/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/admin/users/u1");
  });

  it("sin productos, muestra el estado vacío", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: userDetail({ products: [] }) });
    renderDetail();
    expect(await screen.findByText("Este usuario no cargó productos.")).toBeInTheDocument();
  });

  it("si falla la carga, muestra el error", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("404"));
    renderDetail();
    expect(await screen.findByText("No se encontró el usuario.")).toBeInTheDocument();
  });

  it("sin nombre, usuario ni fecha, usa los valores de reemplazo", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: userDetail({
        email: null,
        first_name: null,
        last_name: null,
        username: null,
        created_at: null,
        is_active: false,
      }),
    });
    renderDetail();
    expect(await screen.findByText("u1")).toBeInTheDocument();
    expect(screen.getByText("Deshabilitado")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
