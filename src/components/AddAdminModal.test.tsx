import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddAdminModal from "./AddAdminModal";

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn(), get: vi.fn() },
}));

import { api } from "@/lib/api";

const email = () => screen.getByLabelText("Email");

function noAccount() {
  return { response: { status: 404, data: { detail: "Ese email todavía no tiene cuenta: definí una contraseña inicial para pasársela." } } };
}

async function typeEmail(user: ReturnType<typeof userEvent.setup>, value = "nuevo@test.com") {
  await user.type(email(), value);
  await user.click(screen.getByRole("button", { name: "Hacer administrador" }));
}

describe("AddAdminModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pide solo el email, y no sugiere usuarios mientras se escribe", async () => {
    const user = userEvent.setup();
    render(<AddAdminModal onClose={() => {}} />);

    await user.type(email(), "ana");

    expect(screen.getByRole("button", { name: "Hacer administrador" })).toBeEnabled();
    expect(screen.queryByPlaceholderText("Buscar por email…")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin resultados/)).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("no se puede enviar sin email", () => {
    render(<AddAdminModal onClose={() => {}} />);

    expect(screen.getByRole("button", { name: "Hacer administrador" })).toBeDisabled();
  });

  it("si el email ya tiene cuenta, lo hace administrador y sigue entrando con su contraseña", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { account_created: false } });
    render(<AddAdminModal onClose={() => {}} />);

    await typeEmail(user, "existente@test.com");

    expect(await screen.findByTestId("add-admin-done")).toHaveTextContent("existente@test.com ya es administrador");
    expect(screen.getByTestId("add-admin-done")).toHaveTextContent("con la contraseña que ya tiene");
    expect(api.post).toHaveBeenCalledWith("/admin/auth/admins", { email: "existente@test.com" });
    expect(screen.queryByTestId("add-admin-password")).not.toBeInTheDocument();
  });

  it("si no tiene cuenta, pide una contraseña inicial que ya viene generada y cumple las reglas", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValueOnce(noAccount());
    render(<AddAdminModal onClose={() => {}} />);

    await typeEmail(user);

    const initial = await screen.findByTestId("add-admin-initial");
    expect(initial).toHaveTextContent("Ese email todavía no tiene cuenta");
    const password = (screen.getByLabelText("Contraseña inicial") as HTMLInputElement).value;
    expect(password).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(screen.getByRole("button", { name: "Crear administrador" })).toBeInTheDocument();
  });

  it("crea la cuenta con la contraseña inicial y la muestra para pasársela a la persona", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValueOnce(noAccount()).mockResolvedValueOnce({ data: { account_created: true } });
    render(<AddAdminModal onClose={() => {}} />);
    await typeEmail(user);
    await screen.findByTestId("add-admin-initial");

    await user.clear(screen.getByLabelText("Contraseña inicial"));
    await user.type(screen.getByLabelText("Contraseña inicial"), "Inicial.2026");
    await user.click(screen.getByRole("button", { name: "Crear administrador" }));

    expect(await screen.findByTestId("add-admin-password")).toHaveTextContent("Inicial.2026");
    expect(api.post).toHaveBeenLastCalledWith("/admin/auth/admins", { email: "nuevo@test.com", initial_password: "Inicial.2026" });
    expect(screen.getByTestId("add-admin-done")).toHaveTextContent("el dashboard le va a pedir que la cambie");
  });

  it("se puede copiar la contraseña inicial", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    vi.mocked(api.post).mockRejectedValueOnce(noAccount()).mockResolvedValueOnce({ data: { account_created: true } });
    render(<AddAdminModal onClose={() => {}} />);
    await typeEmail(user);
    await screen.findByTestId("add-admin-initial");
    await user.click(screen.getByRole("button", { name: "Crear administrador" }));
    const shown = (await screen.findByTestId("add-admin-password")).textContent;

    await user.click(screen.getByRole("button", { name: /Copiar/ }));

    expect(writeText).toHaveBeenCalledWith(shown);
    expect(await screen.findByRole("button", { name: /Copiada/ })).toBeInTheDocument();
  });

  it("si el portapapeles no está disponible, no rompe", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true });
    vi.mocked(api.post).mockRejectedValueOnce(noAccount()).mockResolvedValueOnce({ data: { account_created: true } });
    render(<AddAdminModal onClose={() => {}} />);
    await typeEmail(user);
    await screen.findByTestId("add-admin-initial");
    await user.click(screen.getByRole("button", { name: "Crear administrador" }));
    await screen.findByTestId("add-admin-password");

    await user.click(screen.getByRole("button", { name: /Copiar/ }));

    expect(screen.getByRole("button", { name: /Copiar/ })).toBeInTheDocument();
  });

  it("«Generar otra» cambia la contraseña inicial", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValueOnce(noAccount());
    render(<AddAdminModal onClose={() => {}} />);
    await typeEmail(user);
    await screen.findByTestId("add-admin-initial");
    const first = (screen.getByLabelText("Contraseña inicial") as HTMLInputElement).value;

    await user.click(screen.getByRole("button", { name: /Generar otra/ }));

    expect((screen.getByLabelText("Contraseña inicial") as HTMLInputElement).value).not.toBe(first);
  });

  it("valida las reglas de la contraseña inicial sin llamar al servicio", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValueOnce(noAccount());
    render(<AddAdminModal onClose={() => {}} />);
    await typeEmail(user);
    await screen.findByTestId("add-admin-initial");
    vi.mocked(api.post).mockClear();

    await user.clear(screen.getByLabelText("Contraseña inicial"));
    await user.type(screen.getByLabelText("Contraseña inicial"), "corta");
    await user.click(screen.getByRole("button", { name: "Crear administrador" }));

    expect(await screen.findByText("La contraseña debe tener al menos 8 caracteres.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("al cambiar el email vuelve a empezar: ya no pide la contraseña", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValueOnce(noAccount());
    render(<AddAdminModal onClose={() => {}} />);
    await typeEmail(user);
    await screen.findByTestId("add-admin-initial");

    await user.type(email(), "x");

    expect(screen.queryByTestId("add-admin-initial")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hacer administrador" })).toBeInTheDocument();
  });

  it("si el email ya es administrador, lo avisa", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue({ response: { status: 409, data: { detail: "Ya existe un administrador con ese email" } } });
    render(<AddAdminModal onClose={() => {}} />);

    await typeEmail(user, "repe@test.com");

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un administrador con ese email");
  });

  it("si falla otra cosa, muestra el mensaje genérico, y un 404 con la contraseña ya pedida también es un error", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValueOnce(noAccount()).mockRejectedValue(noAccount());
    render(<AddAdminModal onClose={() => {}} />);
    await typeEmail(user);
    await screen.findByTestId("add-admin-initial");

    await user.click(screen.getByRole("button", { name: "Crear administrador" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ese email todavía no tiene cuenta");
    vi.mocked(api.post).mockRejectedValue(new Error("boom"));
    await user.click(screen.getByRole("button", { name: "Crear administrador" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se pudo agregar al administrador."));
  });

  it("se cierra con «Cerrar», con el fondo y con «Listo»", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(api.post).mockResolvedValue({ data: { account_created: false } });
    render(<AddAdminModal onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await user.click(screen.getByTestId("add-admin-backdrop"));
    await typeEmail(user, "a@test.com");
    await user.click(await screen.findByRole("button", { name: "Listo" }));

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe("AddAdminModal · texto del campo de mail", () => {
  it("el campo de email dice «email@example.com»", () => {
    render(<AddAdminModal onClose={() => {}} />);

    expect(screen.getByPlaceholderText("email@example.com")).toBeInTheDocument();
  });
});
