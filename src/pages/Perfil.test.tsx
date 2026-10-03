import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Perfil from "./Perfil";
import type { MyProfile } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), put: vi.fn() },
}));

import { api } from "@/lib/api";

function profile(overrides: Partial<MyProfile> = {}): MyProfile {
  return {
    email: "user@test.com",
    first_name: "Ana",
    last_name: "Gómez",
    username: "ana",
    stock_minimo: 2,
    dias_alerta_vencimiento: 5,
    ...overrides,
  };
}

describe("Perfil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("precarga el formulario con el perfil actual", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: profile() });
    renderWithProviders(<Perfil />);

    expect(await screen.findByDisplayValue("Ana")).toBeInTheDocument();
    expect(screen.getByDisplayValue("user@test.com")).toBeDisabled();
    expect(screen.getByDisplayValue("2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
  });

  it("guarda los cambios y actualiza el mensaje de éxito", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: profile() });
    vi.mocked(api.put).mockResolvedValue({ data: profile({ first_name: "Nueva" }) });

    renderWithProviders(<Perfil />);
    const nombreInput = await screen.findByDisplayValue("Ana");
    await user.clear(nombreInput);
    await user.type(nombreInput, "Nueva");

    const apellidoInput = screen.getByDisplayValue("Gómez");
    await user.clear(apellidoInput);
    await user.type(apellidoInput, "Pérez");

    const usuarioInput = screen.getByDisplayValue("ana");
    await user.clear(usuarioInput);
    await user.type(usuarioInput, "ana2");

    const stockMinimoInput = screen.getByDisplayValue("2");
    await user.clear(stockMinimoInput);
    await user.type(stockMinimoInput, "3");

    const diasAlertaInput = screen.getByDisplayValue("5");
    await user.clear(diasAlertaInput);
    await user.type(diasAlertaInput, "7");

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/me/profile", {
        first_name: "Nueva",
        last_name: "Pérez",
        username: "ana2",
        stock_minimo: 3,
        dias_alerta_vencimiento: 7,
      }),
    );
    expect(await screen.findByText("Guardado.")).toBeInTheDocument();
  });

  it("si falla el guardado, muestra el error del backend", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: profile() });
    vi.mocked(api.put).mockImplementation(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "Ese usuario ya está en uso." } };
      throw err;
    });

    renderWithProviders(<Perfil />);
    await screen.findByDisplayValue("Ana");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Ese usuario ya está en uso.")).toBeInTheDocument();
  });

  it("mientras carga, no muestra el formulario", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}) as any);
    const { container } = renderWithProviders(<Perfil />);
    expect(container.querySelector("form")).not.toBeInTheDocument();
  });

  it("con nombre, apellido y usuario vacíos, precarga campos en blanco", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: profile({ first_name: null, last_name: null, username: null }),
    });
    renderWithProviders(<Perfil />);
    expect(await screen.findByDisplayValue("2")).toBeInTheDocument();
    // Nombre, Apellido y Usuario quedan vacíos: sólo el email deshabilitado
    // conserva su propio valor.
    expect(screen.getAllByDisplayValue("").length).toBe(3);
  });

  it("al vaciar nombre/apellido/usuario y guardar, se envían como null", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: profile() });
    vi.mocked(api.put).mockResolvedValue({ data: profile() });

    renderWithProviders(<Perfil />);
    const nombreInput = await screen.findByDisplayValue("Ana");
    await user.clear(nombreInput);
    await user.clear(screen.getByDisplayValue("Gómez"));
    await user.clear(screen.getByDisplayValue("ana"));

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        "/me/profile",
        expect.objectContaining({ first_name: null, last_name: null, username: null }),
      ),
    );
  });

  it("si el error de guardado no trae detalle, usa el mensaje genérico", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: profile() });
    vi.mocked(api.put).mockRejectedValue(new Error("network down"));

    renderWithProviders(<Perfil />);
    await screen.findByDisplayValue("Ana");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("No se pudo guardar.")).toBeInTheDocument();
  });
});
