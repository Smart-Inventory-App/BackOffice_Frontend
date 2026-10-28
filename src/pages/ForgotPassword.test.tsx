import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPassword from "./ForgotPassword";

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn() },
}));

import { api } from "@/lib/api";

function LoginProbe() {
  return <p>LOGIN {JSON.stringify(useLocation().state)}</p>;
}

function renderForgot(email?: string) {
  const entries = email ? [{ pathname: "/forgot-password", state: { email } }] : ["/forgot-password"];
  return render(
    <MemoryRouter initialEntries={entries as any}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function serve(overrides: Record<string, unknown> = {}) {
  vi.mocked(api.post).mockImplementation(async (url: string) => {
    if (url in overrides) {
      const value = overrides[url];
      if (value instanceof Error || (value && typeof value === "object" && "response" in (value as object))) throw value;
      return { data: value };
    }
    if (url === "/admin/auth/forgot-password") return { data: { detail: "sent" } };
    if (url === "/admin/auth/verify-code") return { data: { reset_token: "tok-reset" } };
    if (url === "/admin/auth/reset-password") return { data: {} };
    throw new Error(`POST no mockeado: ${url}`);
  });
}

async function toCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Enviar código" }));
  await screen.findByLabelText("Código de 6 dígitos");
}

describe("ForgotPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serve();
  });

  it("precarga el email que viene del ingreso y pide el código", async () => {
    const user = userEvent.setup();
    renderForgot("ana@test.com");

    expect(screen.getByLabelText("Email")).toHaveValue("ana@test.com");
    await toCodeStep(user);

    expect(api.post).toHaveBeenCalledWith("/admin/auth/forgot-password", { email: "ana@test.com" });
    expect(screen.getByText("Si ana@test.com tiene una cuenta, le enviamos un código.")).toBeInTheDocument();
  });

  it("sin email no se puede enviar el código", () => {
    renderForgot();

    expect(screen.getByRole("button", { name: "Enviar código" })).toBeDisabled();
  });

  it("si falla el envío del código, muestra el error", async () => {
    const user = userEvent.setup();
    serve({ "/admin/auth/forgot-password": { response: { data: { detail: "No se pudo enviar el código." } } } });
    renderForgot("ana@test.com");

    await user.click(screen.getByRole("button", { name: "Enviar código" }));

    expect(await screen.findByText("No se pudo enviar el código.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Código de 6 dígitos")).not.toBeInTheDocument();
  });

  it("el código solo admite números, de a seis, y recién entonces deja continuar", async () => {
    const user = userEvent.setup();
    renderForgot("ana@test.com");
    await toCodeStep(user);

    const code = screen.getByLabelText("Código de 6 dígitos");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await user.type(code, "12ab34567");
    expect(code).toHaveValue("123456");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
  });

  it("un código incorrecto se explica", async () => {
    const user = userEvent.setup();
    serve({ "/admin/auth/verify-code": { response: { data: { detail: "El código no es válido o venció. Pedí uno nuevo." } } } });
    renderForgot("ana@test.com");
    await toCodeStep(user);

    await user.type(screen.getByLabelText("Código de 6 dígitos"), "000000");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("El código no es válido o venció. Pedí uno nuevo.")).toBeInTheDocument();
  });

  it("permite pedir un código nuevo", async () => {
    const user = userEvent.setup();
    renderForgot("ana@test.com");
    await toCodeStep(user);

    await user.click(screen.getByRole("button", { name: "Enviar un código nuevo" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
  });

  async function toPasswordStep(user: ReturnType<typeof userEvent.setup>) {
    renderForgot("ana@test.com");
    await toCodeStep(user);
    await user.type(screen.getByLabelText("Código de 6 dígitos"), "123456");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByLabelText("Contraseña nueva");
  }

  it("con el código correcto pide la contraseña nueva y, al guardarla, vuelve al ingreso avisando", async () => {
    const user = userEvent.setup();
    await toPasswordStep(user);

    await user.type(screen.getByLabelText("Contraseña nueva"), "Nueva1234");
    await user.type(screen.getByLabelText("Repetir contraseña"), "Nueva1234");
    await user.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/admin/auth/reset-password", {
        reset_token: "tok-reset",
        new_password: "Nueva1234",
      }),
    );
    expect(await screen.findByText(/LOGIN/)).toHaveTextContent('"passwordChanged":true');
  });

  it("valida las reglas de la contraseña y que coincidan, sin llamar al servicio", async () => {
    const user = userEvent.setup();
    await toPasswordStep(user);
    vi.mocked(api.post).mockClear();

    await user.type(screen.getByLabelText("Contraseña nueva"), "corta");
    await user.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(await screen.findByText("La contraseña debe tener al menos 8 caracteres.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Contraseña nueva"));
    await user.type(screen.getByLabelText("Contraseña nueva"), "Nueva1234");
    await user.type(screen.getByLabelText("Repetir contraseña"), "Otra12345");
    await user.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("si el servicio rechaza la contraseña nueva, muestra el motivo", async () => {
    const user = userEvent.setup();
    await toPasswordStep(user);
    serve({ "/admin/auth/reset-password": { response: { data: { detail: "La contraseña nueva no puede ser igual a la actual." } } } });

    await user.type(screen.getByLabelText("Contraseña nueva"), "Nueva1234");
    await user.type(screen.getByLabelText("Repetir contraseña"), "Nueva1234");
    await user.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(await screen.findByText("La contraseña nueva no puede ser igual a la actual.")).toBeInTheDocument();
  });

  it("el ojo muestra la contraseña nueva y «Volver a iniciar sesión» lleva al ingreso con el email", async () => {
    const user = userEvent.setup();
    await toPasswordStep(user);

    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(screen.getByLabelText("Contraseña nueva")).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("link", { name: "Volver a iniciar sesión" }));
    expect(await screen.findByText(/LOGIN/)).toHaveTextContent('"email":"ana@test.com"');
  });
});
