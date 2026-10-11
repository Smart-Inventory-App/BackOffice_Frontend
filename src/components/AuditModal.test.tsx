import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import AuditModal from "./AuditModal";
import type { AuditEntry } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "@/lib/api";

function renderModal(props: Partial<React.ComponentProps<typeof AuditModal>> = {}) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditModal userId="u1" userEmail="user@test.com" onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 1,
    user_id: "u1",
    changed_by: "admin@test.com",
    kind: "status",
    is_active: false,
    action: null,
    reason: "actividad sospechosa",
    created_at: "2026-01-01T12:00:00Z",
    ...overrides,
  };
}

describe("AuditModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el email del usuario y pide el registro correspondiente", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderModal();
    expect(screen.getByText("user@test.com")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/admin/users/u1/audit");
  });

  it("si no hay email, usa el id del usuario", () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderModal({ userEmail: null });
    expect(screen.getByText("u1")).toBeInTheDocument();
  });

  it("sin cambios registrados, muestra el estado vacío", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderModal();
    expect(
      await screen.findByText("Este usuario no tiene cambios registrados."),
    ).toBeInTheDocument();
  });

  it("si falla la carga, muestra el error", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("fallo"));
    renderModal();
    expect(await screen.findByText("No se pudo cargar la auditoría.")).toBeInTheDocument();
  });

  it("muestra entradas de estado habilitado/deshabilitado con su motivo", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        entry({ id: 1, is_active: true, reason: null }),
        entry({ id: 2, is_active: false, reason: "cuenta duplicada" }),
      ],
    });
    renderModal();

    expect(await screen.findByText("Habilitado")).toBeInTheDocument();
    expect(screen.getByText("Deshabilitado")).toBeInTheDocument();
    expect(screen.getByText(/cuenta duplicada/)).toBeInTheDocument();
    expect(screen.getAllByText(/Por: admin@test.com/).length).toBe(2);
  });

  it("muestra entradas de rol otorgado y revocado", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        entry({ id: 3, kind: "role", action: "granted", is_active: null }),
        entry({ id: 4, kind: "role", action: "revoked", is_active: null }),
      ],
    });
    renderModal();

    expect(await screen.findByText("Se le dio admin")).toBeInTheDocument();
    expect(screen.getByText("Se le quitó admin")).toBeInTheDocument();
  });

  it("cierra el modal desde los botones de cerrar", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderModal({ onClose });

    await screen.findByText("Este usuario no tiene cambios registrados.");
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
