import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ProductDetailModal from "./ProductDetailModal";
import type { MyProduct } from "@/lib/types";

function product(overrides: Partial<MyProduct> = {}): MyProduct {
  return {
    id: 1,
    nombre: "Yerba Mate",
    marca: "La Merced",
    categoria: "Almacén",
    stock: 1,
    vencimiento: "2026-12-01",
    descripcion: "Yerba suave",
    imagen_url: null,
    ubicacion: "Alacena",
    codigo_barras: "7791234567890",
    stock_minimo: null,
    dias_alerta_vencimiento: null,
    created_at: "2026-10-27T22:30:00Z",
    ...overrides,
  };
}

describe("ProductDetailModal", () => {
  it("muestra los mismos datos que la ventana de la app, con fechas argentinas", () => {
    render(<ProductDetailModal product={product()} onClose={() => {}} />);

    expect(screen.getByRole("dialog", { name: "Información del Producto" })).toBeInTheDocument();
    expect(screen.getByTestId("product-detail-name")).toHaveTextContent("Yerba Mate");
    expect(screen.getByTestId("product-detail-categoria")).toHaveTextContent("Almacén");
    expect(screen.getByTestId("product-detail-marca")).toHaveTextContent("La Merced");
    expect(screen.getByTestId("product-detail-stock")).toHaveTextContent(/^1$/);
    expect(screen.getByTestId("product-detail-descripcion")).toHaveTextContent("Yerba suave");
    expect(screen.getByText("Ubicación de guardado")).toBeInTheDocument();
    expect(screen.getByTestId("product-detail-ubicacion")).toHaveTextContent("Alacena");
    expect(screen.getByTestId("product-detail-vencimiento")).toHaveTextContent("01/12/2026");
    expect(screen.getByTestId("product-detail-codigo")).toHaveTextContent("7791234567890");
    expect(screen.getByTestId("product-detail-created")).toHaveTextContent("27/10/2026 19:30");
  });

  it("la categoría y el stock se destacan con el color principal", () => {
    render(<ProductDetailModal product={product()} onClose={() => {}} />);

    expect(screen.getByTestId("product-detail-categoria").className).toContain("text-primary");
    expect(screen.getByTestId("product-detail-stock").className).toContain("text-primary");
    expect(screen.getByTestId("product-detail-marca").className).not.toContain("text-primary");
  });

  it("sin reglas propias, usa las generales del perfil con su aclaración", () => {
    render(<ProductDetailModal product={product()} generalRules={{ coverageDays: 7, expiryDays: 1 }} onClose={() => {}} />);

    expect(screen.getByText("Reglas de alerta")).toBeInTheDocument();
    expect(screen.getByTestId("product-detail-stock-minimo")).toHaveTextContent("7 días");
    expect(screen.getByTestId("product-detail-dias-alerta")).toHaveTextContent("1 día");
    expect(screen.getAllByText("Usando tu regla general")).toHaveLength(2);
  });

  it("sin reglas propias ni generales cargadas, lo dice en lugar del valor", () => {
    render(<ProductDetailModal product={product()} onClose={() => {}} />);

    expect(screen.getByTestId("product-detail-stock-minimo")).toHaveTextContent("Usando tu regla general");
    expect(screen.getByTestId("product-detail-dias-alerta")).toHaveTextContent("Usando tu regla general");
  });

  it("con reglas propias, muestra su valor sin aclaración", () => {
    render(
      <ProductDetailModal product={product({ stock_minimo: 1, dias_alerta_vencimiento: 15, stock: 8 })} generalRules={{ coverageDays: 7, expiryDays: 7 }} onClose={() => {}} />,
    );

    expect(screen.getByTestId("product-detail-stock-minimo")).toHaveTextContent("1 día");
    expect(screen.getByTestId("product-detail-dias-alerta")).toHaveTextContent("15 días");
    expect(screen.queryByText("Usando tu regla general")).not.toBeInTheDocument();
    expect(screen.getByTestId("product-detail-stock")).toHaveTextContent(/^8$/);
  });

  it("los datos que faltan se muestran con un guion y la descripción vacía no ocupa lugar", () => {
    render(
      <ProductDetailModal
        product={product({ marca: null, ubicacion: null, vencimiento: null, codigo_barras: null, descripcion: "  ", created_at: null })}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId("product-detail-marca")).toHaveTextContent("—");
    expect(screen.getByTestId("product-detail-ubicacion")).toHaveTextContent("—");
    expect(screen.getByTestId("product-detail-codigo")).toHaveTextContent("—");
    expect(screen.getByTestId("product-detail-vencimiento")).toHaveTextContent("Sin vencimiento");
    expect(screen.queryByText("Descripción")).not.toBeInTheDocument();
    expect(screen.queryByText("Fecha de carga")).not.toBeInTheDocument();
  });

  it("solo ofrece los accesos que se le pasan y los dispara", async () => {
    const user = userEvent.setup();
    const handlers = { onHistory: vi.fn(), onEdit: vi.fn(), onClose: vi.fn() };
    const { rerender } = render(<ProductDetailModal product={product()} onClose={handlers.onClose} />);
    expect(screen.queryByRole("button", { name: /Historial|Editar/ })).not.toBeInTheDocument();

    rerender(<ProductDetailModal product={product()} {...handlers} />);
    expect(screen.queryByRole("button", { name: /Stock total/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Historial/ }));
    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await user.click(screen.getByLabelText("Volver"));

    expect(handlers.onHistory).toHaveBeenCalledOnce();
    expect(handlers.onEdit).toHaveBeenCalledOnce();
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });
});

describe("ProductDetailModal · íconos", () => {
  it("la fecha de vencimiento y el código de barras llevan su símbolo, del mismo tamaño", () => {
    render(<ProductDetailModal product={product()} onClose={() => {}} />);

    expect(screen.getByText("Fecha de vencimiento")).toBeInTheDocument();
    expect(screen.queryByText("Vencimiento")).not.toBeInTheDocument();
    const calendar = screen.getByTestId("icon-calendar");
    const barcode = screen.getByTestId("icon-barcode");
    expect(calendar.getAttribute("width")).toBe(barcode.getAttribute("width"));
    expect(calendar.getAttribute("height")).toBe(barcode.getAttribute("height"));
    expect(calendar.closest("p")!.className).toContain("text-muted");
    expect(barcode.closest("p")!.className).toContain("text-muted");
    // El símbolo es lo primero del rótulo
    expect(calendar.closest("p")!.firstElementChild).toBe(calendar);
    expect(barcode.closest("p")!.firstElementChild).toBe(barcode);
  });
});
