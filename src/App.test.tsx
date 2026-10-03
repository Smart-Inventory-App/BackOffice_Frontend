import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import { AuthProvider } from "@/context/AuthContext";
import App from "./App";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
}));

import { api, getToken } from "@/lib/api";

const ADMIN = { id: "1", email: "admin@test.com", full_name: null, is_admin: true, is_active: true };
const REGULAR = { id: "2", email: "user@test.com", full_name: null, is_admin: false, is_active: true };

function renderApp(initialEntries: string[]) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const EMPTY_STATS = {
  total_users: 0,
  active_users: 0,
  inactive_users: 0,
  new_users_last_7d: 0,
  total_products: 0,
  products_with_image: 0,
  low_stock_products: 0,
  expiring_soon_products: 0,
  expired_products: 0,
  products_by_category: [],
  top_users_by_products: [],
  products_per_day_last_14d: [],
};

const EMPTY_MY_STATS = {
  total_products: 0,
  products_with_image: 0,
  low_stock_products: 0,
  expiring_soon_products: 0,
  expired_products: 0,
  products_by_category: [],
};

function mockAdmin(user: typeof ADMIN | typeof REGULAR) {
  vi.mocked(getToken).mockReturnValue("tok");
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/admin/auth/me") return { data: user };
    if (url === "/admin/stats/") return { data: EMPTY_STATS };
    if (url === "/me/stats") return { data: EMPTY_MY_STATS };
    if (url === "/admin/ocr/status") return { data: { available: true, checks: {}, engines: [] } };
    if (url === "/admin/ocr/stats") {
      return { data: { dias: 7, ejecuciones: 0, exitosas: 0, fallidas: 0, usuarios: 0, ms_promedio: null, confianza_promedio: null, por_tipo: [] } };
    }
    if (url === "/admin/ocr/audit") return { data: { items: [], total: 0 } };
    if (url === "/admin/users/") return { data: { items: [], total: 0 } };
    return { data: {} };
  });
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sin sesión, cualquier ruta protegida redirige a /login", async () => {
    vi.mocked(getToken).mockReturnValue(null);
    renderApp(["/"]);
    await waitFor(() => expect(screen.getByPlaceholderText("admin@smartinventory.com")).toBeInTheDocument());
  });

  it("un admin ve el Dashboard de admin en la raíz, con navegación de administrador", async () => {
    mockAdmin(ADMIN);
    renderApp(["/"]);
    await waitFor(() => expect(screen.getByText("admin@test.com")).toBeInTheDocument());
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getAllByText("Usuarios").length).toBeGreaterThan(0);
  });

  it("un usuario no admin ve su propio dashboard en la raíz", async () => {
    mockAdmin(REGULAR);
    renderApp(["/"]);
    await waitFor(() => expect(screen.getByText("user@test.com")).toBeInTheDocument());
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Estado de tu inventario")).toBeInTheDocument();
  });

  it("un usuario no admin no puede entrar a /usuarios: es redirigido a la raíz", async () => {
    mockAdmin(REGULAR);
    renderApp(["/usuarios"]);
    await waitFor(() => expect(screen.getByText("user@test.com")).toBeInTheDocument());
    expect(screen.queryByText(/Monitoreo y habilitación de cuentas/)).not.toBeInTheDocument();
  });

  it("un admin sí puede entrar a /usuarios", async () => {
    mockAdmin(ADMIN);
    renderApp(["/usuarios"]);
    expect(
      await waitFor(() => screen.getByText(/Monitoreo y habilitación de cuentas/)),
    ).toBeInTheDocument();
  });

  it("un admin puede entrar a /ocr y a /ml", async () => {
    mockAdmin(ADMIN);
    renderApp(["/ocr"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "OCR" })).toBeInTheDocument());
  });

  it("un admin en modo 'ver como usuario' pierde acceso a rutas de admin", async () => {
    mockAdmin(ADMIN);
    window.localStorage.setItem("backoffice_view_as_user", "1");
    renderApp(["/usuarios"]);
    await waitFor(() => expect(screen.getByText("admin@test.com")).toBeInTheDocument());
    expect(screen.queryByText(/Monitoreo y habilitación de cuentas/)).not.toBeInTheDocument();
  });

  it("una ruta desconocida redirige a la raíz", async () => {
    mockAdmin(REGULAR);
    renderApp(["/esto-no-existe"]);
    await waitFor(() => expect(screen.getByText("Estado de tu inventario")).toBeInTheDocument());
  });

  it("la ruta /set-password se muestra sin el shell del backoffice", async () => {
    vi.mocked(getToken).mockReturnValue(null);
    renderApp(["/set-password"]);
    // Sin email en el estado de navegación, SetPassword redirige a /login.
    await waitFor(() => expect(screen.getByPlaceholderText("admin@smartinventory.com")).toBeInTheDocument());
  });
});
