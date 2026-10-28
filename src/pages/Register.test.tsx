import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import Register from "./Register";

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn() },
}));

import { api } from "@/lib/api";

function renderRegister(email?: string) {
  const queryClient = createTestQueryClient();
  const entries = email ? [{ pathname: "/register", state: { email } }] : ["/register"];
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={entries as any}>
        <Register />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("precarga el email recibido por navegación", () => {
    renderRegister("nuevo@test.com");
    expect(screen.getByPlaceholderText("tu@email.com")).toHaveValue("nuevo@test.com");
  });

  it("sin email precargado, el campo arranca vacío y editable", () => {
    renderRegister();
    expect(screen.getByPlaceholderText("tu@email.com")).toHaveValue("");
  });

  it("valida largo mínimo, mayúscula, minúscula y número", async () => {
    const user = userEvent.setup();
    renderRegister("nuevo@test.com");

    const [pw, confirm] = [screen.getByLabelText("Contraseña"), screen.getByLabelText("Repetir contraseña")];

    await user.type(pw, "abc");
    await user.type(confirm, "abc");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByText("La contraseña debe tener al menos 8 caracteres.")).toBeInTheDocument();
  });

  it("si las contraseñas no coinciden, lo avisa", async () => {
    const user = userEvent.setup();
    renderRegister("nuevo@test.com");
    const [pw, confirm] = [screen.getByLabelText("Contraseña"), screen.getByLabelText("Repetir contraseña")];

    await user.type(pw, "Abcdefg1");
    await user.type(confirm, "Abcdefg2");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
  });

  it("crea la cuenta correctamente", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    renderRegister("nuevo@test.com");
    const [pw, confirm] = [screen.getByLabelText("Contraseña"), screen.getByLabelText("Repetir contraseña")];

    await user.type(pw, "Abcdefg1");
    await user.type(confirm, "Abcdefg1");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/admin/auth/register", {
        email: "nuevo@test.com",
        password: "Abcdefg1",
      }),
    );
  });

  it("si falla el backend, muestra el error", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "Ya existe una cuenta con ese email. Iniciá sesión." } };
      throw err;
    });
    renderRegister("repetido@test.com");
    const [pw, confirm] = [screen.getByLabelText("Contraseña"), screen.getByLabelText("Repetir contraseña")];

    await user.type(pw, "Abcdefg1");
    await user.type(confirm, "Abcdefg1");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText("Ya existe una cuenta con ese email. Iniciá sesión.")).toBeInTheDocument();
  });
});

function LoginProbe() {
  const location = useLocation();
  return <p>LOGIN {JSON.stringify(location.state)}</p>;
}

function renderRegisterWithLogin(email?: string) {
  const queryClient = createTestQueryClient();
  const entries = email ? [{ pathname: "/register", state: { email } }] : ["/register"];
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={entries as any}>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Register · reglas de contraseña y navegación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["abcdefg1", "Debe incluir al menos una mayúscula."],
    ["ABCDEFG1", "Debe incluir al menos una minúscula."],
    ["Abcdefgh", "Debe incluir al menos un número."],
  ])("rechaza %s sin llamar al backend", async (password, message) => {
    const user = userEvent.setup();
    renderRegister("nuevo@test.com");
    const [pw, confirm] = [screen.getByLabelText("Contraseña"), screen.getByLabelText("Repetir contraseña")];

    await user.type(pw, password);
    await user.type(confirm, password);
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith("/admin/auth/register", expect.anything());
  });

  it("tras crear la cuenta navega al login con el email y el aviso de registro", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    renderRegisterWithLogin("nuevo@test.com");
    const [pw, confirm] = [screen.getByLabelText("Contraseña"), screen.getByLabelText("Repetir contraseña")];

    await user.type(pw, "Abcdefg1");
    await user.type(confirm, "Abcdefg1");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText(/LOGIN/)).toHaveTextContent('"email":"nuevo@test.com"');
    expect(screen.getByText(/LOGIN/)).toHaveTextContent('"registered":true');
  });

  it("el link 'Iniciar sesión' lleva al login", async () => {
    const user = userEvent.setup();
    renderRegisterWithLogin();

    await user.click(screen.getByRole("link", { name: /Iniciar sesión/ }));

    expect(await screen.findByText(/LOGIN/)).toBeInTheDocument();
  });

  it("mientras crea la cuenta deshabilita el botón y lo informa", async () => {
    const user = userEvent.setup();
    let release: (v: unknown) => void = () => {};
    vi.mocked(api.post).mockReturnValue(new Promise((resolve) => { release = resolve; }) as any);
    renderRegister("nuevo@test.com");
    const [pw, confirm] = [screen.getByLabelText("Contraseña"), screen.getByLabelText("Repetir contraseña")];

    await user.type(pw, "Abcdefg1");
    await user.type(confirm, "Abcdefg1");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByRole("button", { name: "Creando cuenta…" })).toBeDisabled();
    await act(async () => { release({ data: {} }); });
  });

  it("si el backend no manda detalle, muestra el mensaje genérico", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("red"));
    renderRegister("nuevo@test.com");
    const [pw, confirm] = [screen.getByLabelText("Contraseña"), screen.getByLabelText("Repetir contraseña")];

    await user.type(pw, "Abcdefg1");
    await user.type(confirm, "Abcdefg1");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText("No se pudo crear la cuenta.")).toBeInTheDocument();
  });

  it("al editar el email, lo envía tal cual al backend", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    renderRegister();
    const [pw, confirm] = [screen.getByLabelText("Contraseña"), screen.getByLabelText("Repetir contraseña")];

    await user.type(screen.getByPlaceholderText("tu@email.com"), "otro@test.com");
    await user.type(pw, "Abcdefg1");
    await user.type(confirm, "Abcdefg1");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/auth/register", { email: "otro@test.com", password: "Abcdefg1" }));
  });
});

describe("Register · el ojo de la contraseña", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hay un ojo en «Contraseña» y otro en «Repetir contraseña», y siguen ahí cuando aparece un error", async () => {
    const user = userEvent.setup();
    renderRegister("nuevo@test.com");

    expect(screen.getAllByRole("button", { name: "Mostrar contraseña" })).toHaveLength(2);
    await user.type(screen.getByLabelText("Contraseña"), "Abcdefg1");
    await user.type(screen.getByLabelText("Repetir contraseña"), "Abcdefg2");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();

    // con la contraseña equivocada, los dos ojos siguen estando y cada uno muestra solo su campo
    const eyes = screen.getAllByRole("button", { name: "Mostrar contraseña" });
    expect(eyes).toHaveLength(2);
    await user.click(eyes[1]);
    expect(screen.getByLabelText("Repetir contraseña")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
    await user.click(screen.getAllByRole("button", { name: "Mostrar contraseña" })[0]);
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "text");
  });
});

describe("Register · el email ya tiene cuenta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function check(data: Record<string, unknown>) {
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/admin/auth/check") return { data };
      return { data: {} };
    });
  }

  it("avisa que el email está disponible", async () => {
    check({ exists: false, is_admin: false, password_set: false });
    renderRegister("libre@test.com");

    expect(await screen.findByText("Email disponible")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/admin/auth/check", { email: "libre@test.com" });
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeEnabled();
  });

  it("avisa que ya existe una cuenta y no deja crear otra", async () => {
    check({ exists: true, is_admin: false, password_set: true });
    renderRegister("ocupado@test.com");

    expect(await screen.findByText("Ya existe una cuenta con ese email.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeDisabled();
  });

  it("si la cuenta es de Google y no tiene contraseña, lo explica y ofrece crear una", async () => {
    check({ exists: true, is_admin: false, password_set: false, google_only: true });
    renderRegister("google@test.com");

    expect(await screen.findByText(/Cuenta de Google/)).toBeInTheDocument();
    expect(screen.getByTestId("register-google-hint")).toHaveTextContent("Ingresá con Google o creá una contraseña desde «Olvidé mi contraseña»");
    expect(screen.getByRole("link", { name: "«Olvidé mi contraseña»" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeDisabled();
  });

  it("no consulta con un email que todavía no parece un email, y si la consulta falla sigue como si nada", async () => {
    renderRegister();
    await userEvent.setup().type(screen.getByLabelText("Email"), "ana@");
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(api.post).not.toHaveBeenCalled();

    vi.mocked(api.post).mockRejectedValue(new Error("sin conexión"));
    await userEvent.setup().type(screen.getByLabelText("Email"), "test.com");
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(screen.queryByText("Ya existe una cuenta con ese email.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeEnabled();
  });
});
