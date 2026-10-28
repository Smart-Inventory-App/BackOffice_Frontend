import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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

function Probe({ name }: { name: string }) {
  const location = useLocation();
  return (
    <p>
      {name} {JSON.stringify(location.state)}
    </p>
  );
}

function renderLogin(state?: { email?: string; registered?: boolean; passwordChanged?: boolean }) {
  const queryClient = createTestQueryClient();
  const entries = state ? [{ pathname: "/login", state }] : ["/login"];
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={entries as any}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Probe name="REGISTER" />} />
            <Route path="/forgot-password" element={<Probe name="FORGOT" />} />
            <Route path="/set-password" element={<Probe name="SETPASSWORD" />} />
            <Route path="/" element={<p>HOME</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const emailField = () => screen.getByLabelText("Email");
const passwordField = () => screen.getByLabelText("Contraseña");

function checkReturns(data: Record<string, boolean>) {
  vi.mocked(api.post).mockImplementation(async (url: string) => {
    if (url === "/admin/auth/check") return { data };
    if (url === "/admin/auth/login") return { data: { access_token: "tok" } };
    throw new Error(`POST no mockeado: ${url}`);
  });
}

async function goToPassword(user: ReturnType<typeof userEvent.setup>, email = "admin@test.com") {
  await user.type(emailField(), email);
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await screen.findByLabelText("Contraseña");
}

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el logo, «Smart Inventory» y el formulario del email", () => {
    renderLogin();

    expect(screen.getByAltText("Smart Inventory")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("SmartInventory");
    expect(emailField()).toHaveAttribute("placeholder", "tu@email.com");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("si el email no existe, muestra el error sin pasar al paso de contraseña", async () => {
    const user = userEvent.setup();
    checkReturns({ exists: false, is_admin: false, password_set: false });

    renderLogin();
    await user.type(emailField(), "nadie@test.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("No existe una cuenta con ese email.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Contraseña")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toBeInTheDocument();
  });

  it("al volver de un registro exitoso, muestra el aviso y precarga el email", () => {
    renderLogin({ email: "nuevo@test.com", registered: true });

    expect(screen.getByText("Cuenta creada. Iniciá sesión con tu contraseña.")).toBeInTheDocument();
    expect(emailField()).toHaveValue("nuevo@test.com");
  });

  it("al volver de cambiar la contraseña, lo avisa", () => {
    renderLogin({ email: "nuevo@test.com", passwordChanged: true });

    expect(screen.getByText("Contraseña actualizada. Iniciá sesión con la nueva.")).toBeInTheDocument();
  });

  it("si el email existe, pasa al paso de contraseña, ofrece recuperarla y permite volver", async () => {
    const user = userEvent.setup();
    checkReturns({ exists: true, is_admin: true, password_set: true });

    renderLogin();
    await goToPassword(user);

    expect(screen.getByRole("link", { name: "Olvidé mi contraseña" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Crear cuenta" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /admin@test.com/ }));
    expect(emailField()).toHaveValue("admin@test.com");
  });

  it("el ojo muestra y oculta la contraseña", async () => {
    const user = userEvent.setup();
    checkReturns({ exists: true, is_admin: false, password_set: true });

    renderLogin();
    await goToPassword(user);
    await user.type(passwordField(), "secreta");

    expect(passwordField()).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(passwordField()).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(passwordField()).toHaveAttribute("type", "password");
  });

  it("si falla la verificación del email, muestra el error del backend", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { detail: "Servicio caído." } } });

    renderLogin();
    await user.type(emailField(), "admin@test.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Servicio caído.")).toBeInTheDocument();
  });

  it("inicia sesión con email y contraseña y va al inicio", async () => {
    const user = userEvent.setup();
    checkReturns({ exists: true, is_admin: true, password_set: true });
    vi.mocked(api.get).mockResolvedValue({
      data: { id: "1", email: "admin@test.com", full_name: null, is_admin: true, is_active: true },
    });

    renderLogin();
    await goToPassword(user);
    await user.type(passwordField(), "1234");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/admin/auth/login", { email: "admin@test.com", password: "1234" }),
    );
    expect(await screen.findByText("HOME")).toBeInTheDocument();
  });

  it("si falla el login, muestra el error del backend debajo del campo", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/admin/auth/check") return { data: { exists: true, is_admin: false, password_set: true } };
      throw { response: { data: { detail: "Contraseña incorrecta." } } };
    });

    renderLogin();
    await goToPassword(user);
    await user.type(passwordField(), "mala");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Contraseña incorrecta.")).toBeInTheDocument();
  });

  it("un admin sin contraseña definida es enviado a definirla", async () => {
    const user = userEvent.setup();
    checkReturns({ exists: true, is_admin: true, password_set: false });

    renderLogin();
    await user.type(emailField(), "nuevo@test.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText(/SETPASSWORD/)).toHaveTextContent('"email":"nuevo@test.com"');
  });

  it("una cuenta de Google sin contraseña recibe el aviso y el camino para crear una", async () => {
    const user = userEvent.setup();
    checkReturns({ exists: true, is_admin: false, password_set: false, google_only: true });

    renderLogin();
    await user.type(emailField(), "google@test.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText(/se creó con Google/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Contraseña")).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Crear una contraseña" }));
    expect(await screen.findByText(/FORGOT/)).toHaveTextContent('"email":"google@test.com"');
  });

  it("el aviso de Google desaparece al cambiar el email", async () => {
    const user = userEvent.setup();
    checkReturns({ exists: true, is_admin: false, password_set: false, google_only: true });

    renderLogin();
    await user.type(emailField(), "google@test.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText(/se creó con Google/);

    await user.type(emailField(), "x");

    expect(screen.queryByText(/se creó con Google/)).not.toBeInTheDocument();
  });

  it("«Crear cuenta» lleva a /register con el email ya escrito", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(emailField(), "nadie@test.com");
    await user.click(screen.getByRole("link", { name: "Crear cuenta" }));

    expect(await screen.findByText(/REGISTER/)).toHaveTextContent('"email":"nadie@test.com"');
  });

  it("«Olvidé mi contraseña» lleva a recuperarla con el email", async () => {
    const user = userEvent.setup();
    checkReturns({ exists: true, is_admin: false, password_set: true });

    renderLogin();
    await goToPassword(user, "yo@test.com");
    await user.click(screen.getByRole("link", { name: "Olvidé mi contraseña" }));

    expect(await screen.findByText(/FORGOT/)).toHaveTextContent('"email":"yo@test.com"');
  });

  it("al volver a consultar otro email se borra el aviso de cuenta creada", async () => {
    const user = userEvent.setup();
    checkReturns({ exists: true, is_admin: false, password_set: true });

    renderLogin({ email: "nuevo@test.com", registered: true });
    expect(screen.getByText("Cuenta creada. Iniciá sesión con tu contraseña.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByLabelText("Contraseña");
    expect(screen.queryByText("Cuenta creada. Iniciá sesión con tu contraseña.")).not.toBeInTheDocument();
  });
});
