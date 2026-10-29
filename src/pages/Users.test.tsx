import type { ReactElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import { AuthProvider } from "@/context/AuthContext";
import Users from "./Users";
import type { AppUser, Paginated } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
}));

import { api, getToken } from "@/lib/api";

function renderUsers(ui: ReactElement = <Users />) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function appUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "u1",
    email: "usuario@test.com",
    is_active: true,
    is_admin: false,
    created_at: "2026-01-15T00:00:00Z",
    username: "usuario1",
    first_name: "Ana",
    last_name: "Gómez",
    product_count: 4,
    ...overrides,
  };
}

function paginated(items: AppUser[], total = items.length): Paginated<AppUser> {
  return { items, total };
}

function mockUsersGet(items: AppUser[]) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/admin/users/") return { data: paginated(items) };
    throw new Error(`GET no mockeado: ${url}`);
  });
}

describe("Users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista usuarios con su estado y datos, y sin resultados muestra el estado vacío", async () => {
    mockUsersGet([appUser()]);
    renderUsers();
    expect(await screen.findByText("usuario@test.com")).toBeInTheDocument();
    expect(screen.getByText("Ana Gómez")).toBeInTheDocument();
    expect(screen.getByText("Habilitado")).toBeInTheDocument();
    expect(screen.queryByText("Activo")).not.toBeInTheDocument();
  });

  it("sin usuarios, muestra el estado vacío", async () => {
    mockUsersGet([]);
    renderUsers();
    expect(await screen.findByText("No se encontraron usuarios.")).toBeInTheDocument();
  });

  it("la lista ocupa el alto que queda de la pantalla, igual que la de productos", async () => {
    mockUsersGet([appUser()]);
    renderUsers();
    await screen.findByText("usuario@test.com");

    const tabla = screen.getByRole("table");
    const contenedor = tabla.parentElement!;
    expect(contenedor.className).toContain("md:flex-1");
    expect(contenedor.className).toContain("md:max-h-none");
    expect(contenedor.className).toContain("overflow-auto");
    expect(contenedor.parentElement!.className).toContain("md:flex-1");
    expect(contenedor.parentElement!.parentElement!.className).toContain("md:h-[calc(100vh-4.5rem)]");
  });

  it("arriba a la derecha, paralelo al título, dice cuántos usuarios hay y cuántos están habilitados", async () => {
    vi.mocked(api.get).mockImplementation(async () => ({ data: { items: [appUser()], total: 1385, enabled: 88 } }));
    renderUsers();

    const resumen = await screen.findByTestId("users-summary");
    expect(screen.getByTestId("users-summary-total")).toHaveTextContent("1.385 Usuarios");
    expect(screen.getByTestId("users-summary-enabled")).toHaveTextContent("88 Habilitados");
    const encabezado = screen.getByRole("heading", { name: "Usuarios de la Plataforma" }).parentElement!.parentElement!;
    expect(encabezado.className).toContain("justify-between");
    expect(encabezado.lastElementChild).toBe(resumen);
  });

  it("en singular dice «1 Usuario | 1 Habilitado»", async () => {
    vi.mocked(api.get).mockImplementation(async () => ({ data: { items: [appUser()], total: 1, enabled: 1 } }));
    renderUsers();

    expect(await screen.findByTestId("users-summary-total")).toHaveTextContent("1 Usuario");
    expect(screen.getByTestId("users-summary-enabled")).toHaveTextContent("1 Habilitado");
    expect(screen.getByTestId("users-summary-total")).not.toHaveTextContent("1 Usuarios");
  });

  it("si el servidor no manda el conteo de habilitados, muestra cero", async () => {
    mockUsersGet([appUser()]);
    renderUsers();

    expect(await screen.findByTestId("users-summary-enabled")).toHaveTextContent("0 Habilitados");
  });

  it("el título es «Usuarios de la Plataforma»", async () => {
    mockUsersGet([appUser()]);
    renderUsers();

    expect(await screen.findByRole("heading", { name: "Usuarios de la Plataforma" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar por mail o nombre de usuario…")).toBeInTheDocument();
  });

  it("filtra por búsqueda y por estado", async () => {
    const user = userEvent.setup();
    mockUsersGet([appUser()]);
    renderUsers();
    await screen.findByText("usuario@test.com");

    await user.type(screen.getByPlaceholderText("Buscar por mail o nombre de usuario…"), "usuario");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/users/",
        expect.objectContaining({ params: expect.objectContaining({ search: "usuario" }) }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Estado" }));
    const opciones = within(screen.getByRole("listbox", { name: "Estado" })).getAllByRole("option").map((o) => o.textContent);
    expect(opciones).toEqual(["Todos los usuarios", "Habilitados", "Deshabilitados", "Administradores"]);
    await user.click(screen.getByRole("option", { name: "Administradores" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/users/",
        expect.objectContaining({ params: expect.objectContaining({ status_filter: "admin" }) }),
      ),
    );
  });

  it("habilita a un usuario deshabilitado directamente, sin pedir motivo", async () => {
    const user = userEvent.setup();
    mockUsersGet([appUser({ is_active: false })]);
    vi.mocked(api.patch).mockResolvedValue({ data: {} });

    renderUsers();
    await screen.findByText("Deshabilitado");
    await user.click(screen.getByRole("button", { name: "Habilitar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/admin/users/u1/status", {
        is_active: true,
        reason: null,
      }),
    );
  });

  it("deshabilita a un usuario activo pidiendo un motivo, y permite cancelar", async () => {
    const user = userEvent.setup();
    mockUsersGet([appUser()]);
    vi.mocked(api.patch).mockResolvedValue({ data: {} });

    renderUsers();
    await screen.findByText("usuario@test.com");
    await user.click(screen.getByRole("button", { name: "Deshabilitar" }));

    expect(screen.getByText("Deshabilitar usuario")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/actividad sospechosa/), "cuenta duplicada");

    const modal = screen.getByText("Deshabilitar usuario").closest(".rounded-3xl") as HTMLElement;
    await user.click(within(modal).getByRole("button", { name: "Deshabilitar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/admin/users/u1/status", {
        is_active: false,
        reason: "cuenta duplicada",
      }),
    );
  });

  it("cancela la deshabilitación sin llamar al backend", async () => {
    const user = userEvent.setup();
    mockUsersGet([appUser()]);
    renderUsers();
    await screen.findByText("usuario@test.com");
    await user.click(screen.getByRole("button", { name: "Deshabilitar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(api.patch).not.toHaveBeenCalled();
    expect(screen.queryByText("Deshabilitar usuario")).not.toBeInTheDocument();
  });

  it("a un administrador (que no es el admin logueado) se le puede quitar el rol; y si falla, muestra el error", async () => {
    const user = userEvent.setup();
    mockUsersGet([appUser({ is_admin: true, email: "otro-admin@test.com" })]);
    vi.mocked(api.delete).mockImplementationOnce(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "No podés quitarte el rol a vos mismo." } };
      throw err;
    });

    renderUsers();
    await screen.findByText("otro-admin@test.com");
    expect(screen.getByText("Admin")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Quitar admin/ }));
    const modal = screen.getByText("Quitar administrador").closest(".rounded-3xl") as HTMLElement;
    await user.click(within(modal).getByRole("button", { name: "Quitar admin" }));

    expect(
      await screen.findByText("No podés quitarte el rol a vos mismo."),
    ).toBeInTheDocument();

    vi.mocked(api.delete).mockResolvedValueOnce({ data: {} });
    await user.click(within(modal).getByRole("button", { name: "Quitar admin" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/admin/users/u1/admin"));
  });

  it("cancela quitar el admin sin llamar al backend", async () => {
    const user = userEvent.setup();
    mockUsersGet([appUser({ is_admin: true })]);
    renderUsers();
    await screen.findByText("usuario@test.com");
    await user.click(screen.getByRole("button", { name: /Quitar admin/ }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.queryByText("Quitar administrador")).not.toBeInTheDocument();
  });

  it("abre el registro de auditoría de un usuario", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/users/") return { data: paginated([appUser()]) };
      if (url === "/admin/users/u1/audit") return { data: [] };
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderUsers();
    await screen.findByText("usuario@test.com");
    await user.click(screen.getByRole("button", { name: /Ver/ }));

    expect(await screen.findByText("Registro de auditoría")).toBeInTheDocument();
    expect(screen.getByText("Este usuario no tiene cambios registrados.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByText("Registro de auditoría")).not.toBeInTheDocument();
  });

  it("sin nombre, usuario o email, usa los valores de reemplazo", async () => {
    mockUsersGet([
      appUser({
        id: "u2",
        email: null,
        first_name: null,
        last_name: null,
        username: null,
        created_at: null,
      }),
    ]);
    renderUsers();
    expect(await screen.findByText("u2")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("un usuario sin email usa su id en los modales de deshabilitar y quitar admin", async () => {
    const user = userEvent.setup();
    mockUsersGet([appUser({ id: "u3", email: null, is_admin: true })]);
    renderUsers();
    await screen.findByText("u3");

    await user.click(screen.getByRole("button", { name: "Deshabilitar" }));
    expect(within(screen.getByText("Deshabilitar usuario").closest(".rounded-3xl") as HTMLElement).getByText("u3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await user.click(screen.getByRole("button", { name: /Quitar admin/ }));
    expect(screen.getAllByText("u3").length).toBeGreaterThan(0);
  });

  it("el propio admin logueado no ve un botón para quitarse el rol a sí mismo", async () => {
    vi.mocked(getToken).mockReturnValue("tok");
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/auth/me") {
        return { data: { id: "self", email: "yo@test.com", full_name: null, is_admin: true, is_active: true } };
      }
      if (url === "/admin/users/") {
        return { data: paginated([appUser({ id: "self", email: "yo@test.com", is_admin: true })]) };
      }
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderUsers();
    await screen.findByText("yo@test.com");
    expect(screen.queryByRole("button", { name: /Quitar admin/ })).not.toBeInTheDocument();
  });
});
