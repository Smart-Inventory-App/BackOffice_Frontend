import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Auditoria from "./Auditoria";
import type { ActivityEntry, Paginated } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "@/lib/api";

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: "1",
    kind: "login",
    actor_email: "user@test.com",
    target_user_id: null,
    target_email: null,
    description: "user@test.com inició sesión",
    created_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

function paginated(items: ActivityEntry[], total = items.length): Paginated<ActivityEntry> {
  return { items, total };
}

describe("Auditoria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista la actividad reciente", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: paginated([entry()]) });
    renderWithProviders(<Auditoria />);
    expect(await screen.findByText("user@test.com inició sesión")).toBeInTheDocument();
    expect(screen.getAllByText("Inicio de sesión").length).toBeGreaterThan(0);
  });

  it("muestra el título, las columnas y el usuario de cada evento", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: paginated([
        entry({ id: "1", kind: "login", actor_email: "a@test.com", target_email: null }),
        entry({ id: "2", kind: "role", actor_email: "admin@test.com", target_email: "b@test.com", description: "b@test.com recibió el rol" }),
        entry({ id: "3", kind: "registered", actor_email: null, target_email: null, description: "alguien se registró" }),
      ]),
    });
    renderWithProviders(<Auditoria />);
    await screen.findByText("b@test.com recibió el rol");

    expect(screen.getByRole("heading", { name: "Auditoría de Eventos" })).toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Evento", "Usuario", "Detalle", "Fecha del evento"]);
    expect(screen.getByText("a@test.com")).toBeInTheDocument();
    expect(screen.getByText("b@test.com")).toBeInTheDocument();
    expect(screen.queryByText("admin@test.com")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("alguien se registró")).toHaveClass("text-left");
  });

  it("sin actividad, muestra el estado vacío", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: paginated([]) });
    renderWithProviders(<Auditoria />);
    expect(await screen.findByText("No hay actividad registrada todavía.")).toBeInTheDocument();
  });

  it("filtra por tipo de evento", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: paginated([entry()]) });
    renderWithProviders(<Auditoria />);
    await screen.findByText("user@test.com inició sesión");

    await user.click(screen.getByRole("button", { name: "Entrada de producto" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/activity/",
        expect.objectContaining({ params: expect.objectContaining({ kind: "product_created" }) }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Todos" }));
    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls[vi.mocked(api.get).mock.calls.length - 1]!;
      expect((lastCall[1] as any).params.kind).toBeUndefined();
    });
  });

  it("muestra cada tipo de evento con su ícono y color", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: paginated([
        entry({ id: "1", kind: "registered", description: "Se registró" }),
        entry({ id: "2", kind: "product_created", description: "Cargó un producto" }),
        entry({ id: "3", kind: "product_updated", description: "Editó un producto" }),
        entry({ id: "4", kind: "product_deleted", description: "Borró un producto" }),
        entry({ id: "5", kind: "status", description: "Cambió de estado" }),
        entry({ id: "6", kind: "role", description: "Cambió de rol" }),
        entry({ id: "7", kind: "product_exit", description: "Sacó un producto" }),
      ]),
    });
    renderWithProviders(<Auditoria />);

    expect(await screen.findByText("Usuario nuevo")).toBeInTheDocument();
    expect(screen.getByText("Salida de producto")).toBeInTheDocument();
    expect(screen.getByText("Edición de producto")).toBeInTheDocument();
    expect(screen.getByText("Eliminación de producto")).toBeInTheDocument();
    // «Entrada de producto» está también como filtro, ahora justo antes de «Salida de producto»
    const filtros = screen.getAllByRole("button").map((b) => b.textContent);
    expect(filtros.indexOf("Salida de producto")).toBe(filtros.indexOf("Entrada de producto") + 1);
    expect(screen.getByText("Habilitación")).toBeInTheDocument();
    expect(screen.getByText("Rol de admin")).toBeInTheDocument();
  });

  function serveWithUsers(items: ActivityEntry[] = [entry()]) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/activity/filters/options") {
        return {
          data: {
            users: [
              { user_id: "u1", email: "ana@test.com" },
              { user_id: "u2", email: "beto@test.com" },
            ],
          },
        };
      }
      return { data: paginated(items) };
    });
  }

  it("arriba a la derecha, paralelo al título y la descripción, está el filtro «Todos los usuarios», más angosto que en Productos", async () => {
    serveWithUsers();
    renderWithProviders(<Auditoria />);

    const titulo = await screen.findByRole("heading", { name: "Auditoría de Eventos" });
    const encabezado = titulo.parentElement!.parentElement!;
    const filtro = screen.getByTestId("audit-user-filter");
    expect(encabezado.className).toContain("justify-between");
    expect(encabezado.firstElementChild).toContainElement(titulo);
    expect(encabezado.lastElementChild).toBe(filtro);
    expect(filtro.className).toContain("w-56");
    expect(within(filtro).getByRole("button", { name: "Usuario" })).toHaveTextContent("Todos los usuarios");
  });

  it("filtra todas las entradas por usuario, y «Todos los usuarios» quita el filtro", async () => {
    const user = userEvent.setup();
    serveWithUsers();
    renderWithProviders(<Auditoria />);
    await screen.findByText("user@test.com inició sesión");

    await user.click(screen.getByRole("button", { name: "Usuario" }));
    expect(within(screen.getByRole("listbox", { name: "Usuario" })).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Todos los usuarios",
      "ana@test.com",
      "beto@test.com",
    ]);
    await user.click(screen.getByRole("option", { name: "beto@test.com" }));

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/activity/",
        expect.objectContaining({ params: expect.objectContaining({ user_id: "u2" }) }),
      ),
    );
    expect(screen.getByRole("button", { name: "Usuario" })).toHaveTextContent("beto@test.com");

    // se combina con el tipo de evento
    await user.click(screen.getByRole("button", { name: "Inicio de sesión" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/activity/",
        expect.objectContaining({ params: expect.objectContaining({ user_id: "u2", kind: "login" }) }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Usuario" }));
    await user.click(screen.getByRole("option", { name: "Todos los usuarios" }));
    await waitFor(() => {
      const llamadas = vi.mocked(api.get).mock.calls.filter((c) => c[0] === "/admin/activity/");
      expect((llamadas[llamadas.length - 1][1] as any).params.user_id).toBeUndefined();
    });
  });

  it("la lista ocupa el alto que queda de la pantalla y se desplaza por dentro, igual que la de productos", async () => {
    serveWithUsers();
    renderWithProviders(<Auditoria />);
    await screen.findByText("user@test.com inició sesión");

    const contenedor = screen.getByRole("table").parentElement!;
    expect(contenedor.className).toContain("overflow-auto");
    expect(contenedor.className).toContain("md:flex-1");
    expect(contenedor.className).toContain("md:max-h-none");
    expect(contenedor.className).toContain("max-h-[60vh]");
    expect(contenedor.parentElement!.className).toContain("md:flex-1");
    expect(contenedor.parentElement!.parentElement!.className).toContain("md:h-[calc(100vh-4.5rem)]");
  });

  it("un evento sin fecha muestra el guion largo", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: paginated([entry({ created_at: null })]) });
    renderWithProviders(<Auditoria />);
    expect(await screen.findByText("—")).toBeInTheDocument();
  });
});
