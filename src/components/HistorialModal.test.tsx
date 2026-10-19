import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HistorialModal from "./HistorialModal";
import type { ConsumptionEvent, MyProduct } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { api } from "@/lib/api";

const PRODUCT: MyProduct = {
  id: 1,
  nombre: "Yerba Mate",
  marca: null,
  categoria: "Almacén",
  stock: 5,
  vencimiento: null,
  descripcion: null,
  imagen_url: null,
  ubicacion: null,
  codigo_barras: null,
  stock_minimo: null,
  dias_alerta_vencimiento: null,
  created_at: null,
};

function event(overrides: Partial<ConsumptionEvent> = {}): ConsumptionEvent {
  return {
    id: 1,
    quantity: 2,
    event_type: "consumed",
    consumed_at: "2026-01-01T10:00:00Z",
    note: null,
    actor_email: "user@test.com",
    reverses_event_id: null,
    reversed: false,
    ...overrides,
  };
}

describe("HistorialModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no renderiza nada sin producto", () => {
    const { container } = render(
      <HistorialModal product={null} onClose={vi.fn()} onChanged={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("carga y muestra los eventos, más recientes primero", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [event({ id: 1, quantity: 1 }), event({ id: 2, quantity: 2, event_type: "restocked" })],
    });

    render(<HistorialModal product={PRODUCT} onClose={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Yerba Mate")).toBeInTheDocument();
    const rows = await screen.findAllByText(/Consumido|Entrada/);
    expect(rows[0]).toHaveTextContent("Entrada");
    expect(api.get).toHaveBeenCalledWith("/me/products/1/consumption");
  });

  it("muestra las ventas y los alquileres con su propio motivo", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [event({ id: 1, event_type: "sold" }), event({ id: 2, event_type: "rented" }), event({ id: 3, event_type: "expired" })],
    });

    render(<HistorialModal product={PRODUCT} onClose={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Vendido")).toBeInTheDocument();
    expect(screen.getByText("Alquilado")).toBeInTheDocument();
    expect(screen.getByText("Vencido")).toBeInTheDocument();
  });

  it("permite corregir un movimiento como venta o alquiler", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [event()] });
    vi.mocked(api.put).mockResolvedValue({ data: {} });

    const { container } = render(<HistorialModal product={PRODUCT} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByText("Consumido");
    await user.click(container.querySelectorAll("button")[1]);
    await user.click(screen.getByRole("button", { name: "Alquilado" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/me/products/1/events/1", {
        quantity: 2,
        event_type: "rented",
        note: undefined,
      }),
    );
  });

  it("sin eventos, muestra el estado vacío", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    render(<HistorialModal product={PRODUCT} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(
      await screen.findByText("Todavía no hay movimientos para este producto"),
    ).toBeInTheDocument();
  });

  it("si falla la carga, muestra el error", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("fallo"));
    render(<HistorialModal product={PRODUCT} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText("No se pudo cargar el historial")).toBeInTheDocument();
  });

  it("edita cantidad y motivo, guarda y notifica el cambio", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    vi.mocked(api.get).mockResolvedValue({ data: [event()] });
    vi.mocked(api.put).mockResolvedValue({ data: {} });

    const { container } = render(
      <HistorialModal product={PRODUCT} onClose={vi.fn()} onChanged={onChanged} />,
    );
    await screen.findByText("Consumido");

    const editButton = container.querySelectorAll("button")[1]; // X, Editar(lápiz), Borrar
    await user.click(editButton);

    const quantityInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    await user.clear(quantityInput);
    await user.type(quantityInput, "4");
    await user.click(screen.getByRole("button", { name: "Entrada" }));

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/me/products/1/events/1", {
        quantity: 4,
        event_type: "restocked",
        note: undefined,
      }),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("cancela la edición sin guardar", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [event()] });

    const { container } = render(
      <HistorialModal product={PRODUCT} onClose={vi.fn()} onChanged={vi.fn()} />,
    );
    await screen.findByText("Consumido");

    const editButton = container.querySelectorAll("button")[1];
    await user.click(editButton);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByText("Consumido")).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it("si falla la corrección, muestra el error de fila", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [event()] });
    vi.mocked(api.put).mockImplementation(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "No se puede corregir un evento revertido." } };
      throw err;
    });

    const { container } = render(
      <HistorialModal product={PRODUCT} onClose={vi.fn()} onChanged={vi.fn()} />,
    );
    await screen.findByText("Consumido");
    await user.click(container.querySelectorAll("button")[1]);
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText("No se puede corregir un evento revertido."),
    ).toBeInTheDocument();
  });

  it("no guarda con una cantidad inválida", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [event()] });

    const { container } = render(
      <HistorialModal product={PRODUCT} onClose={vi.fn()} onChanged={vi.fn()} />,
    );
    await screen.findByText("Consumido");
    await user.click(container.querySelectorAll("button")[1]);

    const quantityInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    await user.clear(quantityInput);
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(api.put).not.toHaveBeenCalled();
  });

  it("borra un evento tras confirmar, y no hace nada si se cancela la confirmación", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    vi.mocked(api.get).mockResolvedValue({ data: [event()] });
    vi.mocked(api.delete).mockResolvedValue({ data: {} });

    const { container } = render(
      <HistorialModal product={PRODUCT} onClose={vi.fn()} onChanged={onChanged} />,
    );
    await screen.findByText("Consumido");
    const deleteButton = container.querySelectorAll("button")[2];

    await user.click(deleteButton);
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("¿Borrar este registro de consumo?")).toBeInTheDocument();
    expect(within(dialog).getByText("El stock se va a ajustar automáticamente.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.click(deleteButton);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/me/products/1/events/1"));
    expect(onChanged).toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("si falla el borrado, muestra el error de fila", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [event()] });
    vi.mocked(api.delete).mockImplementation(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "No se puede borrar." } };
      throw err;
    });

    const { container } = render(
      <HistorialModal product={PRODUCT} onClose={vi.fn()} onChanged={vi.fn()} />,
    );
    await screen.findByText("Consumido");
    await user.click(container.querySelectorAll("button")[2]);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Borrar" }));

    expect(await screen.findByText("No se puede borrar.")).toBeInTheDocument();
  });

  it("un evento revertido no tiene acciones, y un evento reversa muestra el ícono correspondiente", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        event({ id: 1, reversed: true }),
        event({ id: 2, reverses_event_id: 1, note: "corrección" }),
      ],
    });

    render(<HistorialModal product={PRODUCT} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByText("Corregido");
    expect(screen.getByText("corrección")).toBeInTheDocument();
  });

  it("cierra el modal desde la X", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(api.get).mockResolvedValue({ data: [] });

    const { container } = render(
      <HistorialModal product={PRODUCT} onClose={onClose} onChanged={vi.fn()} />,
    );
    await screen.findByText("Todavía no hay movimientos para este producto");
    await user.click(container.querySelectorAll("button")[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
