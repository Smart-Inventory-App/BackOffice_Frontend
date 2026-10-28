import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import { AuthProvider } from "@/context/AuthContext";
import AdminShell from "./AdminShell";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getToken: vi.fn(),
  setToken: vi.fn(),
}));

import { api, getToken, setToken } from "@/lib/api";

const ADMIN = { id: "1", email: "admin@test.com", full_name: "Ada Admin", is_admin: true, is_active: true };
const REGULAR = { id: "2", email: "user@test.com", full_name: null, is_admin: false, is_active: true };

function renderShell(initialEntries = ["/"]) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <AdminShell>
            <p>contenido</p>
          </AdminShell>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("para un admin, muestra la navegación completa y el botón de ver como usuario", async () => {
    vi.mocked(getToken).mockReturnValue("tok");
    vi.mocked(api.get).mockResolvedValue({ data: ADMIN });

    renderShell();
    expect(await screen.findByText("admin@test.com")).toBeInTheDocument();
    expect(screen.getByText("Ada Admin")).toBeInTheDocument();
    expect(screen.getAllByText("OCR").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Ver como usuario/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agregar administrador/ })).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("para un usuario no admin, muestra la navegación reducida sin botones de admin", async () => {
    vi.mocked(getToken).mockReturnValue("tok");
    vi.mocked(api.get).mockResolvedValue({ data: REGULAR });

    renderShell();
    expect(await screen.findByText("user@test.com")).toBeInTheDocument();
    expect(screen.getAllByText("Mi perfil").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Ver como usuario/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Agregar administrador/ })).not.toBeInTheDocument();
  });

  it("alterna ver como usuario / ver como admin", async () => {
    const user = userEvent.setup();
    vi.mocked(getToken).mockReturnValue("tok");
    vi.mocked(api.get).mockResolvedValue({ data: ADMIN });

    renderShell();
    await screen.findByText("admin@test.com");

    await user.click(screen.getByRole("button", { name: /Ver como usuario/ }));
    expect(screen.getByText("Viendo como usuario")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver como admin/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Ver como admin/ }));
    expect(screen.queryByText("Viendo como usuario")).not.toBeInTheDocument();
  });

  it("busca un usuario existente, lo selecciona y lo hace admin; y si falla, el error", async () => {
    const user = userEvent.setup();
    vi.mocked(getToken).mockReturnValue("tok");
    const found = { id: "9", email: "nuevo@test.com", is_admin: false, is_active: true };
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/auth/me") return { data: ADMIN };
      if (url === "/admin/users/") return { data: { items: [found], total: 1 } };
      throw new Error(`GET no mockeado: ${url}`);
    });
    vi.mocked(api.post).mockImplementationOnce(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "Ese usuario ya es administrador." } };
      throw err;
    });

    renderShell();
    await screen.findByText("admin@test.com");
    await user.click(screen.getByRole("button", { name: /Agregar administrador/ }));

    await user.type(screen.getByPlaceholderText("Buscar por email…"), "nuevo");
    await user.click(await screen.findByRole("button", { name: "nuevo@test.com" }));
    expect(screen.getByText("nuevo@test.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hacer administrador" }));
    expect(await screen.findByText("Ese usuario ya es administrador.")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/admin/users/9/admin");

    vi.mocked(api.post).mockResolvedValueOnce({ data: {} });
    await user.click(screen.getByRole("button", { name: "Hacer administrador" }));
    expect(await screen.findByText(/nuevo@test.com ya es administrador/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByText("Agregar administrador", { selector: "h3" })).not.toBeInTheDocument();
  });

  it("no ofrece como resultado a alguien que ya es admin", async () => {
    const user = userEvent.setup();
    vi.mocked(getToken).mockReturnValue("tok");
    const already = { id: "9", email: "yaadmin@test.com", is_admin: true, is_active: true };
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/auth/me") return { data: ADMIN };
      if (url === "/admin/users/") return { data: { items: [already], total: 1 } };
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderShell();
    await screen.findByText("admin@test.com");
    await user.click(screen.getByRole("button", { name: /Agregar administrador/ }));
    await user.type(screen.getByPlaceholderText("Buscar por email…"), "yaadmin");

    expect(await screen.findByText("Sin resultados.")).toBeInTheDocument();
  });

  it("cierra sesión tras confirmar, y cancelar no cierra sesión", async () => {
    const user = userEvent.setup();
    vi.mocked(getToken).mockReturnValue("tok");
    vi.mocked(api.get).mockResolvedValue({ data: ADMIN });

    renderShell();
    await screen.findByText("admin@test.com");
    await user.click(screen.getByRole("button", { name: /Cerrar sesión/ }));
    expect(screen.getByText("¿Seguro que querés salir del backoffice?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(setToken).not.toHaveBeenCalledWith(null);

    await user.click(screen.getByRole("button", { name: /Cerrar sesión/ }));
    await user.click(screen.getByRole("button", { name: "Salir" }));
    expect(setToken).toHaveBeenCalledWith(null);
  });
});

describe("AdminShell · agregar administrador, casos de borde", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockUsers(items: any[] | Error) {
    vi.mocked(getToken).mockReturnValue("tok");
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/auth/me") return { data: ADMIN };
      if (url === "/admin/users/") {
        if (items instanceof Error) throw items;
        return { data: { items, total: items.length } };
      }
      throw new Error(`GET no mockeado: ${url}`);
    });
  }

  async function openAddAdmin(user: ReturnType<typeof userEvent.setup>) {
    renderShell();
    await screen.findByText("admin@test.com");
    await user.click(screen.getByRole("button", { name: /Agregar administrador/ }));
  }

  it("con menos de 2 caracteres no consulta la API", async () => {
    const user = userEvent.setup();
    mockUsers([]);
    await openAddAdmin(user);

    await user.type(screen.getByPlaceholderText("Buscar por email…"), "a");

    await new Promise((r) => setTimeout(r, 450));
    expect(api.get).not.toHaveBeenCalledWith("/admin/users/", expect.anything());
    expect(screen.queryByText("Sin resultados.")).not.toBeInTheDocument();
  });

  it("busca con el término, límite 8 y espera a que el usuario deje de escribir", async () => {
    const user = userEvent.setup();
    mockUsers([]);
    await openAddAdmin(user);

    await user.type(screen.getByPlaceholderText("Buscar por email…"), "ana");

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/users/", { params: { search: "ana", limit: 8 } }));
    const searches = vi.mocked(api.get).mock.calls.filter(([url]) => url === "/admin/users/");
    expect(searches).toHaveLength(1);
  });

  it("si la búsqueda falla, muestra 'Sin resultados.' en lugar de romper", async () => {
    const user = userEvent.setup();
    mockUsers(new Error("500"));
    await openAddAdmin(user);

    await user.type(screen.getByPlaceholderText("Buscar por email…"), "ana");

    expect(await screen.findByText("Sin resultados.")).toBeInTheDocument();
  });

  it("un usuario sin email se muestra y se elige por su id", async () => {
    const user = userEvent.setup();
    mockUsers([{ id: "u-77", email: null, is_admin: false, is_active: true }]);
    await openAddAdmin(user);

    await user.type(screen.getByPlaceholderText("Buscar por email…"), "u-7");
    await user.click(await screen.findByRole("button", { name: "u-77" }));

    expect(screen.getByRole("button", { name: "Hacer administrador" })).toBeEnabled();
    expect(screen.getByTitle("u-77")).toBeInTheDocument();
  });

  it("'Cambiar' descarta la selección y vuelve a la búsqueda", async () => {
    const user = userEvent.setup();
    mockUsers([{ id: "9", email: "ana@test.com", is_admin: false, is_active: true }]);
    await openAddAdmin(user);

    await user.type(screen.getByPlaceholderText("Buscar por email…"), "ana");
    await user.click(await screen.findByRole("button", { name: "ana@test.com" }));
    expect(screen.getByRole("button", { name: "Hacer administrador" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Cambiar" }));

    expect(screen.getByPlaceholderText("Buscar por email…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hacer administrador" })).toBeDisabled();
  });

  it("sin usuario elegido, 'Hacer administrador' está deshabilitado y no llama a la API", async () => {
    const user = userEvent.setup();
    mockUsers([]);
    await openAddAdmin(user);

    const button = screen.getByRole("button", { name: "Hacer administrador" });
    expect(button).toBeDisabled();
    await user.click(button);

    expect(api.post).not.toHaveBeenCalled();
  });

  it("al cerrar y reabrir el modal, la búsqueda y los avisos vuelven a empezar", async () => {
    const user = userEvent.setup();
    mockUsers([{ id: "9", email: "ana@test.com", is_admin: false, is_active: true }]);
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    await openAddAdmin(user);
    await user.type(screen.getByPlaceholderText("Buscar por email…"), "ana");
    await user.click(await screen.findByRole("button", { name: "ana@test.com" }));
    await user.click(screen.getByRole("button", { name: "Hacer administrador" }));
    expect(await screen.findByText(/ana@test.com ya es administrador/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await user.click(screen.getByRole("button", { name: /Agregar administrador/ }));

    expect(screen.queryByText(/ya es administrador/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar por email…")).toHaveValue("");
  });
});

describe("AdminShell · alertas críticas en el menú", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getToken).mockReturnValue("tok");
  });

  it("un usuario ve cuántas alertas críticas tiene junto a «Alertas»", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/auth/me") return { data: REGULAR };
      if (url === "/me/alerts/summary") return { data: { critical: 4, warning: 2, total: 6, expiring: 1, low_stock: 3 } };
      return { data: {} };
    });
    renderShell();

    expect(await screen.findByTestId("nav-alert-count")).toHaveTextContent("4");
    expect(screen.getAllByRole("link", { name: /Alertas/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Inicio" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Inventario" }).length).toBeGreaterThan(0);
  });

  it("sin alertas críticas, o si falla la consulta, no muestra el contador", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/auth/me") return { data: REGULAR };
      throw new Error("sin conexión");
    });
    renderShell();

    await screen.findByText("user@test.com");
    expect(screen.queryByTestId("nav-alert-count")).not.toBeInTheDocument();
  });

  it("un administrador no consulta las alertas y ve el menú de administración, con tendencias", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/auth/me") return { data: ADMIN };
      return { data: {} };
    });
    renderShell();

    await screen.findByText("admin@test.com");
    expect(api.get).not.toHaveBeenCalledWith("/me/alerts/summary");
    expect(screen.getAllByRole("link", { name: "Tendencias" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Usuarios" }).length).toBeGreaterThan(0);
  });
});
