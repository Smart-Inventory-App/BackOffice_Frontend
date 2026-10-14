import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import SetPassword from "./SetPassword";

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn() },
}));

import { api } from "@/lib/api";

function renderSetPassword(email: string | null = "nuevo@test.com") {
  const queryClient = createTestQueryClient();
  const entries = email
    ? [{ pathname: "/set-password", state: { email } }]
    : ["/set-password"];
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={entries as any}>
        <SetPassword />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const inviteInput = () => screen.getByPlaceholderText("Pegá el código que te enviaron");

describe("SetPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el email recibido por navegación", () => {
    renderSetPassword("nuevo@test.com");
    expect(screen.getByText("nuevo@test.com")).toBeInTheDocument();
  });

  it("valida largo mínimo, mayúscula, minúscula y número", async () => {
    const user = userEvent.setup();
    renderSetPassword();

    const [pw, confirm] = screen.getAllByPlaceholderText("••••••••");
    await user.type(inviteInput(), "codigo-123");

    await user.type(pw, "abc");
    await user.type(confirm, "abc");
    await user.click(screen.getByRole("button", { name: "Definir contraseña" }));
    expect(
      await screen.findByText("La contraseña debe tener al menos 8 caracteres."),
    ).toBeInTheDocument();

    await user.clear(pw);
    await user.clear(confirm);
    await user.type(pw, "abcdefgh");
    await user.type(confirm, "abcdefgh");
    await user.click(screen.getByRole("button", { name: "Definir contraseña" }));
    expect(await screen.findByText("Debe incluir al menos una mayúscula.")).toBeInTheDocument();

    await user.clear(pw);
    await user.clear(confirm);
    await user.type(pw, "ABCDEFGH");
    await user.type(confirm, "ABCDEFGH");
    await user.click(screen.getByRole("button", { name: "Definir contraseña" }));
    expect(await screen.findByText("Debe incluir al menos una minúscula.")).toBeInTheDocument();

    await user.clear(pw);
    await user.clear(confirm);
    await user.type(pw, "Abcdefgh");
    await user.type(confirm, "Abcdefgh");
    await user.click(screen.getByRole("button", { name: "Definir contraseña" }));
    expect(await screen.findByText("Debe incluir al menos un número.")).toBeInTheDocument();
  });

  it("si las contraseñas no coinciden, lo avisa", async () => {
    const user = userEvent.setup();
    renderSetPassword();
    const [pw, confirm] = screen.getAllByPlaceholderText("••••••••");
    await user.type(inviteInput(), "codigo-123");

    await user.type(pw, "Abcdefg1");
    await user.type(confirm, "Abcdefg2");
    await user.click(screen.getByRole("button", { name: "Definir contraseña" }));

    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
  });

  it("define la contraseña correctamente", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    renderSetPassword("nuevo@test.com");
    const [pw, confirm] = screen.getAllByPlaceholderText("••••••••");
    await user.type(inviteInput(), "codigo-123");

    await user.type(pw, "Abcdefg1");
    await user.type(confirm, "Abcdefg1");
    await user.click(screen.getByRole("button", { name: "Definir contraseña" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/admin/auth/set-password", {
        email: "nuevo@test.com",
        password: "Abcdefg1",
        invite_token: "codigo-123",
      }),
    );
  });

  it("si falla el backend, muestra el error", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "El enlace expiró." } };
      throw err;
    });
    renderSetPassword();
    const [pw, confirm] = screen.getAllByPlaceholderText("••••••••");
    await user.type(inviteInput(), "codigo-123");

    await user.type(pw, "Abcdefg1");
    await user.type(confirm, "Abcdefg1");
    await user.click(screen.getByRole("button", { name: "Definir contraseña" }));

    expect(await screen.findByText("El enlace expiró.")).toBeInTheDocument();
  });

  it("sin email en el estado de navegación, redirige (no muestra el formulario)", () => {
    renderSetPassword(null);
    expect(screen.queryByRole("button", { name: "Definir contraseña" })).not.toBeInTheDocument();
  });

  it("pide el código de invitación antes que la contraseña", () => {
    renderSetPassword();

    expect(inviteInput()).toBeRequired();
    expect(inviteInput()).toHaveFocus();
    expect(screen.getByText("Código de invitación")).toBeInTheDocument();
  });

  it("sin el código no llama al backend", async () => {
    const user = userEvent.setup();
    renderSetPassword();
    const [pw, confirm] = screen.getAllByPlaceholderText("••••••••");

    await user.type(pw, "Abcdefg1");
    await user.type(confirm, "Abcdefg1");
    await user.click(screen.getByRole("button", { name: "Definir contraseña" }));

    expect(api.post).not.toHaveBeenCalled();
  });

  it("manda el código sin los espacios que se cuelan al pegarlo", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    renderSetPassword("nuevo@test.com");
    const [pw, confirm] = screen.getAllByPlaceholderText("••••••••");

    await user.type(inviteInput(), "  codigo-pegado  ");
    await user.type(pw, "Abcdefg1");
    await user.type(confirm, "Abcdefg1");
    await user.click(screen.getByRole("button", { name: "Definir contraseña" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/admin/auth/set-password", {
        email: "nuevo@test.com",
        password: "Abcdefg1",
        invite_token: "codigo-pegado",
      }),
    );
  });

  it("si el código no es válido, muestra el mensaje del backend y no navega", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async () => {
      const err: any = new Error("403");
      err.response = {
        data: { detail: "El código de invitación no es válido o venció. Pedile uno nuevo a un administrador." },
      };
      throw err;
    });
    renderSetPassword();
    const [pw, confirm] = screen.getAllByPlaceholderText("••••••••");

    await user.type(inviteInput(), "vencido");
    await user.type(pw, "Abcdefg1");
    await user.type(confirm, "Abcdefg1");
    await user.click(screen.getByRole("button", { name: "Definir contraseña" }));

    expect(await screen.findByText(/código de invitación no es válido/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Definir contraseña" })).toBeEnabled();
  });

  it("el campo del código no autocompleta ni corrige la ortografía", () => {
    renderSetPassword();

    expect(inviteInput()).toHaveAttribute("autocomplete", "off");
    expect(inviteInput()).toHaveAttribute("spellcheck", "false");
  });
});
