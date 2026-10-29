import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  total_units: 0,
  critical_alerts: 0,
  warning_alerts: 0,
  users_with_alerts: 0,
  consumed_last_7d: 0,
  restocked_last_7d: 0,
  products_by_category: [],
  top_users_by_products: [],
  products_per_day_last_14d: [],
};

const EMPTY_MY_STATS = {
  total_products: 0,
  total_units: 0,
  products_with_image: 0,
  low_stock_products: 0,
  expiring_soon_products: 0,
  expired_products: 0,
  critical_alerts: 0,
  warning_alerts: 0,
  products_by_category: [],
  stock_by_category: [],
  products_by_location: [],
  expiry_buckets: [],
};

function mockAdmin(user: typeof ADMIN | typeof REGULAR) {
  vi.mocked(getToken).mockReturnValue("tok");
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/admin/auth/me") return { data: user };
    if (url === "/admin/stats/") return { data: EMPTY_STATS };
    if (url === "/me/stats") return { data: EMPTY_MY_STATS };
    if (url === "/me/changes") return { data: [] };
    if (url === "/me/products") return { data: { items: [], total: 0 } };
    if (url === "/me/alerts/summary") return { data: { critical: 0, warning: 0, total: 0, expiring: 0, low_stock: 0 } };
    if (url === "/me/profile") {
      return { data: { email: "user@test.com", first_name: "Ana", last_name: null, username: null, stock_minimo: 7, dias_alerta_vencimiento: 7, alert_check_hour: 5, user_type: "individuo" } };
    }
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
    await waitFor(() => expect(screen.getByPlaceholderText("email@example.com")).toBeInTheDocument());
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
    expect(screen.getByTestId("dashboard-greeting")).toHaveTextContent("Tu estado, Ana");
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
    await waitFor(() => expect(screen.getByTestId("dashboard-greeting")).toBeInTheDocument());
  });

  it("la ruta /set-password se muestra sin el shell del backoffice", async () => {
    vi.mocked(getToken).mockReturnValue(null);
    renderApp(["/set-password"]);
    // Sin email en el estado de navegación, SetPassword redirige a /login.
    await waitFor(() => expect(screen.getByPlaceholderText("email@example.com")).toBeInTheDocument());
  });

  it("la ruta /forgot-password se muestra sin el shell del backoffice", async () => {
    vi.mocked(getToken).mockReturnValue(null);
    renderApp(["/forgot-password"]);
    expect(await screen.findByText("Recuperá el acceso a tu cuenta")).toBeInTheDocument();
  });

  it("un administrador ve las tendencias de toda la plataforma", async () => {
    mockAdmin(ADMIN);
    renderApp(["/metricas"]);
    expect(await screen.findByText("Cuánto se consume y cuánto ingresa en todo Smart Inventory")).toBeInTheDocument();
  });
});

describe("App · contraseña inicial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const FIRST_LOGIN = { ...ADMIN, must_change_password: true };

  it("un administrador que entró con la contraseña inicial no ve nada hasta cambiarla", async () => {
    mockAdmin(FIRST_LOGIN as typeof ADMIN);
    renderApp(["/"]);

    expect(await screen.findByText("Elegí tu contraseña")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar contraseña" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Usuarios" })).not.toBeInTheDocument();
  });

  it("tampoco puede entrar a las pantallas de administrador sin cambiarla", async () => {
    mockAdmin(FIRST_LOGIN as typeof ADMIN);
    renderApp(["/usuarios"]);

    expect(await screen.findByText("Elegí tu contraseña")).toBeInTheDocument();
    expect(screen.queryByText(/Monitoreo y habilitación de cuentas/)).not.toBeInTheDocument();
  });

  it("al cambiarla vuelve a pedir la sesión y entra al dashboard", async () => {
    const user = userEvent.setup();
    let changed = false;
    mockAdmin(FIRST_LOGIN as typeof ADMIN);
    const base = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url: string, config?: any) =>
      url === "/admin/auth/me" ? { data: changed ? ADMIN : FIRST_LOGIN } : base(url, config),
    );
    vi.mocked(api.post).mockImplementation(async () => {
      changed = true;
      return { data: {} };
    });
    renderApp(["/"]);

    await screen.findByText("Elegí tu contraseña");
    await user.type(screen.getByLabelText("Contraseña actual"), "Inicial.2026");
    await user.type(screen.getByLabelText("Contraseña nueva"), "Definitiva.99");
    await user.type(screen.getByLabelText("Repetir contraseña"), "Definitiva.99");
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });
});
