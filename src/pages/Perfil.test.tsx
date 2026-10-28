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
    email: "ana@test.com",
    first_name: "Ana",
    last_name: "Gómez",
    username: "anag",
    stock_minimo: 7,
    dias_alerta_vencimiento: 10,
    alert_check_hour: 5,
    user_type: "individuo",
    ...overrides,
  };
}

function mockApi(value: MyProfile = profile(), taken = false) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/me/profile") return { data: value };
    if (url === "/me/profile/username-available") return { data: { available: !taken } };
    throw new Error(`GET no mockeado: ${url}`);
  });
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

// Por defecto se pasa a editar (con el lápiz), que es donde están los campos
async function show(value?: MyProfile, taken = false, edit = true) {
  mockApi(value, taken);
  renderWithProviders(<Perfil />);
  await screen.findByTestId("profile-avatar");
  if (edit) await userEvent.setup().click(screen.getByTestId("profile-edit"));
}

describe("Perfil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("primero muestra los datos ya cargados, sin campos para escribir, y un lápiz a la derecha del encabezado", async () => {
    await show(undefined, false, false);

    expect(screen.getByTestId("profile-view-first-name")).toHaveTextContent("Ana");
    expect(screen.getByTestId("profile-view-last-name")).toHaveTextContent("Gómez");
    expect(screen.getByTestId("profile-view-username")).toHaveTextContent("anag");
    expect(screen.getByTestId("profile-view-type")).toHaveTextContent("Individuo");
    expect(screen.getByTestId("profile-view-stock-days")).toHaveTextContent("7 días");
    expect(screen.getByTestId("profile-view-expiry-days")).toHaveTextContent("10 días");
    expect(screen.getByTestId("profile-view-check-hour")).toHaveTextContent("5 h");
    expect(screen.getByTestId("profile-avatar")).toHaveTextContent("AG");
    expect(screen.getByText("ana@test.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar perfil" })).toBeInTheDocument();
  });

  it("los datos que faltan se ven con un guion", async () => {
    await show(profile({ first_name: null, last_name: null, username: null }), false, false);

    expect(screen.getByTestId("profile-view-first-name")).toHaveTextContent("–");
    expect(screen.getByTestId("profile-view-username")).toHaveTextContent("–");
  });

  it("el lápiz pasa a editar y «Cancelar» vuelve a la vista descartando lo escrito", async () => {
    const user = userEvent.setup();
    await show();

    expect(screen.queryByTestId("profile-edit")).not.toBeInTheDocument();
    await user.clear(field("Nombre"));
    await user.type(field("Nombre"), "Otro");
    await user.click(screen.getByTestId("profile-cancel"));

    expect(screen.getByTestId("profile-view-first-name")).toHaveTextContent("Ana");
    expect(api.put).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("profile-edit"));
    expect(field("Nombre").value).toBe("Ana");
  });

  it("después de guardar vuelve a la vista con los datos nuevos y el aviso", async () => {
    const user = userEvent.setup();
    await show();
    vi.mocked(api.put).mockResolvedValue({ data: profile({ first_name: "Anabel" }) });

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByTestId("profile-view")).toBeInTheDocument();
    expect(screen.getByTestId("profile-view-first-name")).toHaveTextContent("Anabel");
    expect(screen.getByText("Cambios guardados.")).toBeInTheDocument();
  });

  it("al editar, el formulario trae el perfil actual y muestra el resumen de la cuenta", async () => {
    await show();

    expect(field("Nombre").value).toBe("Ana");
    expect(field("Apellido").value).toBe("Gómez");
    expect(field("Usuario").value).toBe("anag");
    expect(field("Stock mínimo (días de cobertura)").value).toBe("7");
    expect(field("Aviso de vencimiento (días)").value).toBe("10");
    expect(field("Hora del chequeo diario").value).toBe("5");
    expect(screen.getByTestId("profile-avatar")).toHaveTextContent("AG");
    expect(screen.getByTestId("profile-type-badge")).toHaveTextContent("Individuo");
    expect(screen.getByText("ana@test.com")).toBeInTheDocument();
    expect(screen.getByText(/Hora de Argentina \(UTC-3\)/)).toBeInTheDocument();
  });

  it("un comercio se muestra como tal, y sin nombre usa el usuario o el mail para las iniciales", async () => {
    await show(profile({ user_type: "comercio", first_name: null, last_name: null, username: "tienda" }));

    expect(screen.getByTestId("profile-type-badge")).toHaveTextContent("Comercio");
    expect(screen.getByText("Sin nombre cargado")).toBeInTheDocument();
    expect(screen.getByTestId("profile-avatar")).toHaveTextContent("T");
  });

  it("muestra el contador de caracteres de nombre, apellido y usuario", async () => {
    await show();

    expect(screen.getByText("3/20")).toBeInTheDocument(); // Ana
    expect(field("Nombre")).toHaveAttribute("maxlength", "20");
    await userEvent.setup().type(field("Nombre"), "bel");
    expect(screen.getByText("6/20")).toBeInTheDocument();
  });

  it("guarda los cambios, con la hora de Argentina, y muestra el mensaje de éxito", async () => {
    const user = userEvent.setup();
    await show();
    vi.mocked(api.put).mockResolvedValue({ data: profile({ first_name: "Anabel", user_type: "comercio" }) });

    await user.clear(field("Nombre"));
    await user.type(field("Nombre"), "Anabel");
    await user.click(screen.getByTestId("profile-type-comercio"));
    await user.clear(field("Stock mínimo (días de cobertura)"));
    await user.type(field("Stock mínimo (días de cobertura)"), "9");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/me/profile", {
        first_name: "Anabel",
        last_name: "Gómez",
        username: "anag",
        user_type: "comercio",
        stock_minimo: 9,
        dias_alerta_vencimiento: 10,
        alert_check_hour: 5,
      }),
    );
    expect(await screen.findByText("Cambios guardados.")).toBeInTheDocument();
  });

  it("al vaciar nombre, apellido y usuario se envían como null", async () => {
    const user = userEvent.setup();
    await show();
    vi.mocked(api.put).mockResolvedValue({ data: profile({ first_name: null, last_name: null, username: null }) });

    await user.clear(field("Nombre"));
    await user.clear(field("Apellido"));
    await user.clear(field("Usuario"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        "/me/profile",
        expect.objectContaining({ first_name: null, last_name: null, username: null }),
      ),
    );
  });

  it("los botones suben y bajan los días y la hora, y se detienen en los extremos", async () => {
    const user = userEvent.setup();
    await show(profile({ stock_minimo: 2, dias_alerta_vencimiento: 90, alert_check_hour: 23 }));

    expect(screen.getByTestId("profile-stock-days-down")).toBeDisabled();
    expect(screen.getByTestId("profile-expiry-days-up")).toBeDisabled();
    expect(screen.getByTestId("profile-check-hour-up")).toBeDisabled();
    await user.click(screen.getByTestId("profile-stock-days-up"));
    await user.click(screen.getByTestId("profile-expiry-days-down"));
    await user.click(screen.getByTestId("profile-check-hour-down"));

    expect(field("Stock mínimo (días de cobertura)").value).toBe("3");
    expect(field("Aviso de vencimiento (días)").value).toBe("89");
    expect(field("Hora del chequeo diario").value).toBe("22");
  });

  it("solo deja escribir números y avisa el rango; fuera de rango no se puede guardar", async () => {
    const user = userEvent.setup();
    await show();

    await user.clear(field("Stock mínimo (días de cobertura)"));
    await user.type(field("Stock mínimo (días de cobertura)"), "a1b");
    expect(field("Stock mínimo (días de cobertura)").value).toBe("1");
    expect(screen.getByTestId("profile-stock-days-range")).toHaveTextContent("Entre 2 y 90 días.");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();

    await user.type(field("Stock mínimo (días de cobertura)"), "5");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    await user.clear(field("Hora del chequeo diario"));
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    await user.click(screen.getByTestId("profile-check-hour-up"));
    expect(field("Hora del chequeo diario").value).toBe("1");
  });

  it("avisa debajo del usuario si ya lo tiene otra cuenta y no deja guardar", async () => {
    const user = userEvent.setup();
    await show(profile(), true);

    await user.clear(field("Usuario"));
    await user.type(field("Usuario"), "ocupado");

    expect(await screen.findByText("Ese nombre de usuario ya está en uso.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(api.get).toHaveBeenCalledWith("/me/profile/username-available", { params: { username: "ocupado" } });
  });

  it("no consulta la disponibilidad del usuario que ya es el propio, ni uno vacío", async () => {
    const user = userEvent.setup();
    await show();

    await user.clear(field("Usuario"));
    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(api.get).not.toHaveBeenCalledWith("/me/profile/username-available", expect.anything());
  });

  it("si la consulta del usuario falla, no lo marca como ocupado", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/profile") return { data: profile() };
      throw new Error("sin conexión");
    });
    renderWithProviders(<Perfil />);
    await screen.findByTestId("profile-avatar");
    await user.click(screen.getByTestId("profile-edit"));

    await user.type(field("Usuario"), "x");
    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(screen.queryByText("Ese nombre de usuario ya está en uso.")).not.toBeInTheDocument();
  });

  it("si falla el guardado, muestra el error del backend", async () => {
    const user = userEvent.setup();
    await show();
    vi.mocked(api.put).mockRejectedValue({ response: { data: { detail: "Ese nombre de usuario ya está en uso." } } });

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ese nombre de usuario ya está en uso.");
  });

  it("si el error de guardado no trae detalle, usa el mensaje genérico", async () => {
    const user = userEvent.setup();
    await show();
    vi.mocked(api.put).mockRejectedValue(new Error("boom"));

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("No se pudo guardar.")).toBeInTheDocument();
  });
});
