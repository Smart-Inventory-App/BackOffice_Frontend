import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChangePassword from "./ChangePassword";

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn() },
}));

const auth = vi.hoisted(() => ({
  admin: { id: "1", email: "nuevo@test.com", full_name: null, is_admin: true, is_active: true, must_change_password: true },
  refresh: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));

import { api } from "@/lib/api";

async function fill(user: ReturnType<typeof userEvent.setup>, current = "Inicial.2026", next = "Definitiva.99", again = next) {
  await user.type(screen.getByLabelText("Contraseña actual"), current);
  await user.type(screen.getByLabelText("Contraseña nueva"), next);
  await user.type(screen.getByLabelText("Repetir contraseña"), again);
}

describe("ChangePassword (primer ingreso de un administrador)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.refresh.mockResolvedValue(undefined);
  });

  it("explica que ingresó con una contraseña inicial y pide cambiarla", () => {
    render(<ChangePassword />);

    expect(screen.getByText("nuevo@test.com")).toBeInTheDocument();
    expect(screen.getByText(/contraseña inicial que te dio un administrador/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar contraseña" })).toBeDisabled();
  });

  it("cambia la contraseña y vuelve a pedir los datos de la sesión", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    render(<ChangePassword />);

    await fill(user);
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/admin/auth/change-password", {
        current_password: "Inicial.2026",
        new_password: "Definitiva.99",
      }),
    );
    await waitFor(() => expect(auth.refresh).toHaveBeenCalledOnce());
  });

  it("valida las reglas, que coincidan y que no sea igual a la actual, sin llamar al servicio", async () => {
    const user = userEvent.setup();
    render(<ChangePassword />);

    await fill(user, "Inicial.2026", "corta");
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    expect(await screen.findByText("La contraseña debe tener al menos 8 caracteres.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Contraseña nueva"));
    await user.clear(screen.getByLabelText("Repetir contraseña"));
    await user.type(screen.getByLabelText("Contraseña nueva"), "Definitiva.99");
    await user.type(screen.getByLabelText("Repetir contraseña"), "Otra.123456");
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Contraseña nueva"));
    await user.clear(screen.getByLabelText("Repetir contraseña"));
    await user.type(screen.getByLabelText("Contraseña nueva"), "Inicial.2026");
    await user.type(screen.getByLabelText("Repetir contraseña"), "Inicial.2026");
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    expect(await screen.findByText("La contraseña nueva no puede ser igual a la actual.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("si el servicio la rechaza, muestra el motivo y no cierra la pantalla", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue({ response: { data: { detail: "La contraseña actual no es correcta." } } });
    render(<ChangePassword />);

    await fill(user, "Equivocada.1");
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    expect(await screen.findByText("La contraseña actual no es correcta.")).toBeInTheDocument();
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it("hay un solo ojo por campo, cada uno muestra solo el suyo, y permite cerrar sesión", async () => {
    const user = userEvent.setup();
    render(<ChangePassword />);

    expect(screen.getAllByRole("button", { name: "Mostrar contraseña" })).toHaveLength(3);
    await user.click(screen.getAllByRole("button", { name: "Mostrar contraseña" })[0]);
    expect(screen.getByLabelText("Contraseña actual")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Contraseña nueva")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Repetir contraseña")).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(auth.logout).toHaveBeenCalledOnce();
  });
});
