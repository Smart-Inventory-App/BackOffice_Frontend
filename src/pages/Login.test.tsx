import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import { AuthProvider } from "@/context/AuthContext";
import Login from "./Login";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
}));

import { api } from "@/lib/api";

function renderLogin() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("si el email no existe, muestra el error sin pasar al paso de contraseña", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { exists: false, is_admin: false, password_set: false } });

    renderLogin();
    await user.type(screen.getByPlaceholderText("admin@smartinventory.com"), "nadie@test.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("No existe una cuenta con ese email.")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("••••••••")).not.toBeInTheDocument();
  });

  it("si el email existe y tiene contraseña, pasa al paso de contraseña y permite volver", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { exists: true, is_admin: true, password_set: true } });

    renderLogin();
    await user.type(screen.getByPlaceholderText("admin@smartinventory.com"), "admin@test.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByPlaceholderText("••••••••")).toBeInTheDocument();
    expect(screen.getByText("admin@test.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cambiar" }));
    expect(screen.getByPlaceholderText("admin@smartinventory.com")).toBeInTheDocument();
  });

  it("si falla la verificación del email, muestra el error del backend", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementationOnce(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "Servicio no disponible." } };
      throw err;
    });

    renderLogin();
    await user.type(screen.getByPlaceholderText("admin@smartinventory.com"), "admin@test.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Servicio no disponible.")).toBeInTheDocument();
  });

  it("inicia sesión con email y contraseña", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/admin/auth/check") {
        return { data: { exists: true, is_admin: true, password_set: true } };
      }
      if (url === "/admin/auth/login") return { data: { access_token: "tok" } };
      throw new Error(`POST no mockeado: ${url}`);
    });
    vi.mocked(api.get).mockResolvedValue({
      data: { id: "1", email: "admin@test.com", full_name: null, is_admin: true, is_active: true },
    });

    renderLogin();
    await user.type(screen.getByPlaceholderText("admin@smartinventory.com"), "admin@test.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByPlaceholderText("••••••••");

    await user.type(screen.getByPlaceholderText("••••••••"), "1234");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/admin/auth/login", {
        email: "admin@test.com",
        password: "1234",
      }),
    );
  });

  it("si falla el login, muestra el error del backend", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/admin/auth/check") {
        return { data: { exists: true, is_admin: false, password_set: true } };
      }
      if (url === "/admin/auth/login") {
        const err: any = new Error("fallo");
        err.response = { data: { detail: "Contraseña incorrecta." } };
        throw err;
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderLogin();
    await user.type(screen.getByPlaceholderText("admin@smartinventory.com"), "admin@test.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByPlaceholderText("••••••••");

    await user.type(screen.getByPlaceholderText("••••••••"), "mala");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Contraseña incorrecta.")).toBeInTheDocument();
  });

  it("un admin sin contraseña definida es enviado a definirla (no se ve en esta pantalla)", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { exists: true, is_admin: true, password_set: false },
    });

    renderLogin();
    await user.type(screen.getByPlaceholderText("admin@smartinventory.com"), "nuevo@test.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.queryByPlaceholderText("••••••••")).not.toBeInTheDocument());
  });
});
