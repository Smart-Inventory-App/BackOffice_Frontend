import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const realLocation = window.location;

describe("AdminShell", () => {
  const assign = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    // Cambiar de vista recarga la página: acá solo se anota a dónde iría
    delete (window as any).location;
    (window as any).location = { ...realLocation, assign };
  });
  afterEach(() => {
    (window as any).location = realLocation;
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
    expect(screen.getByText("Viendo como administrador")).toBeInTheDocument();
  });

  it("cada vez que cambia de vista recarga la página en el dashboard, esté donde esté", async () => {
    const user = userEvent.setup();
    vi.mocked(getToken).mockReturnValue("tok");
    vi.mocked(api.get).mockResolvedValue({ data: ADMIN });
    renderShell(["/usuarios/abc"]);
    await screen.findByText("admin@test.com");

    await user.click(screen.getByRole("button", { name: /Ver como usuario/ }));
    expect(assign).toHaveBeenLastCalledWith("/");
    // la vista elegida queda guardada para que la página recargada la use
    expect(localStorage.getItem("backoffice_view_as_user")).toBe("1");

    await user.click(screen.getByRole("button", { name: /Ver como admin/ }));
    expect(assign).toHaveBeenCalledTimes(2);
    expect(assign).toHaveBeenLastCalledWith("/");
    expect(localStorage.getItem("backoffice_view_as_user")).toBeNull();
  });

  it("cierra sesión tras confirmar, y cancelar no cierra sesión", async () => {
    const user = userEvent.setup();
    vi.mocked(getToken).mockReturnValue("tok");
    vi.mocked(api.get).mockResolvedValue({ data: ADMIN });

    renderShell();
    await screen.findByText("admin@test.com");
    await user.click(screen.getByRole("button", { name: /Cerrar sesión/ }));
    expect(screen.getByText("¿Seguro que querés salir del dashboard?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(setToken).not.toHaveBeenCalledWith(null);

    await user.click(screen.getByRole("button", { name: /Cerrar sesión/ }));
    await user.click(screen.getByRole("button", { name: "Salir" }));
    expect(setToken).toHaveBeenCalledWith(null);
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
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
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

describe("AdminShell · «Agregar administrador» y textos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getToken).mockReturnValue("tok");
  });

  it("el botón está por encima de la línea horizontal de la sesión", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: ADMIN });
    renderShell();
    await screen.findByText("admin@test.com");

    const button = screen.getByRole("button", { name: /Agregar administrador/ });
    const session = screen.getByText("Sesión");
    expect(button.compareDocumentPosition(session) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // el bloque de la sesión es el de la línea (borde de arriba) y viene justo después del botón
    const sessionBlock = session.parentElement!.parentElement!;
    expect(sessionBlock.className).toContain("border-t");
    expect(button.nextElementSibling).toBe(sessionBlock);
    expect(sessionBlock.contains(button)).toBe(false);
  });

  it("debajo del nombre de la cuenta dice «Viendo como administrador», y «Viendo como usuario» al cambiar de vista", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: ADMIN });
    renderShell();
    await screen.findByText("admin@test.com");

    const badge = screen.getByTestId("view-badge");
    expect(badge).toHaveTextContent("Viendo como administrador");
    expect(badge.previousElementSibling).toHaveTextContent("Ada Admin");
    await user.click(screen.getByRole("button", { name: /Ver como usuario/ }));
    expect(screen.getByTestId("view-badge")).toHaveTextContent("Viendo como usuario");
    await user.click(screen.getByRole("button", { name: /Ver como admin/ }));
    expect(screen.getByTestId("view-badge")).toHaveTextContent("Viendo como administrador");
  });

  it("un usuario común no ve ninguna de las dos marcas", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => ({ data: url === "/admin/auth/me" ? REGULAR : {} }));
    renderShell();
    await screen.findByText("user@test.com");

    expect(screen.queryByTestId("view-badge")).not.toBeInTheDocument();
  });

  it("solo lo ve un administrador en su vista de administrador", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => ({ data: url === "/admin/auth/me" ? ADMIN : {} }));
    const user = userEvent.setup();
    renderShell();
    await screen.findByText("admin@test.com");
    expect(screen.getByRole("button", { name: /Agregar administrador/ })).toBeInTheDocument();

    // viendo como usuario, un administrador tampoco lo ve
    await user.click(screen.getByRole("button", { name: /Ver como usuario/ }));
    expect(screen.queryByRole("button", { name: /Agregar administrador/ })).not.toBeInTheDocument();
  });

  it("un usuario común no lo ve nunca", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => ({ data: url === "/admin/auth/me" ? REGULAR : {} }));
    renderShell();
    await screen.findByText("user@test.com");

    expect(screen.queryByRole("button", { name: /Agregar administrador/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Agregar administrador")).not.toBeInTheDocument();
  });

  it("abre la ventana de alta y se cierra con «Cerrar»", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: ADMIN });
    renderShell();
    await screen.findByText("admin@test.com");

    await user.click(screen.getByRole("button", { name: /Agregar administrador/ }));
    expect(screen.getByRole("dialog", { name: "Agregar administrador" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dice «Dashboard» y no «Backoffice»: en la barra lateral y en el menú del usuario", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => ({ data: url === "/admin/auth/me" ? REGULAR : {} }));
    renderShell();
    await screen.findByText("user@test.com");

    expect(screen.queryByText(/backoffice/i)).not.toBeInTheDocument();
    // Debajo del logo no hay ninguna leyenda: solo los enlaces del menú dicen «Dashboard»
    expect(screen.queryByText("Dashboard", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Inicio" })).not.toBeInTheDocument();
  });
});
