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
  it("muestra todo lo que se sabe del producto, con fechas argentinas", () => {
    render(<ProductDetailModal product={product()} onClose={() => {}} />);

    expect(screen.getByRole("dialog", { name: "Información del Producto" })).toBeInTheDocument();
    expect(screen.getByTestId("product-detail-name")).toHaveTextContent("Yerba Mate");
    expect(screen.getByText("La Merced")).toBeInTheDocument();
    expect(screen.getByTestId("product-detail-stock")).toHaveTextContent("1 unidad");
    expect(screen.getByText("Alacena")).toBeInTheDocument();
    expect(screen.getByText("01/12/2026")).toBeInTheDocument();
    expect(screen.getByText("7791234567890")).toBeInTheDocument();
    expect(screen.getByText("Yerba suave")).toBeInTheDocument();
    expect(screen.getByText("Fecha de carga: 27/10/2026 19:30")).toBeInTheDocument();
  });

  it("sin reglas propias, avisa que rigen las generales del perfil", () => {
    render(<ProductDetailModal product={product()} onClose={() => {}} />);

    expect(screen.getAllByText("Tu regla general")).toHaveLength(2);
    expect(screen.getByText("Se avisa con las reglas generales de tu perfil.")).toBeInTheDocument();
  });

  it("con reglas propias, las muestra como del producto", () => {
    render(<ProductDetailModal product={product({ stock_minimo: 1, dias_alerta_vencimiento: 15, stock: 8 })} onClose={() => {}} />);

    expect(screen.getByText("1 día (regla de este producto)")).toBeInTheDocument();
    expect(screen.getByText("15 días (regla de este producto)")).toBeInTheDocument();
    expect(screen.queryByText("Se avisa con las reglas generales de tu perfil.")).not.toBeInTheDocument();
    expect(screen.getByTestId("product-detail-stock")).toHaveTextContent("8 unidades");
  });

  it("los datos que faltan se muestran con un guion y la descripción vacía no ocupa lugar", () => {
    render(
      <ProductDetailModal
        product={product({ marca: null, ubicacion: null, vencimiento: null, codigo_barras: null, descripcion: null, created_at: null })}
        onClose={() => {}}
      />,
    );

    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("Descripción")).not.toBeInTheDocument();
  });

  it("solo ofrece los accesos que se le pasan y los dispara", async () => {
    const user = userEvent.setup();
    const handlers = { onStockTotal: vi.fn(), onHistory: vi.fn(), onEdit: vi.fn(), onClose: vi.fn() };
    const { rerender } = render(<ProductDetailModal product={product()} onClose={handlers.onClose} />);
    expect(screen.queryByRole("button", { name: /Stock total/ })).not.toBeInTheDocument();

    rerender(<ProductDetailModal product={product()} {...handlers} />);
    await user.click(screen.getByRole("button", { name: /Stock total/ }));
    await user.click(screen.getByRole("button", { name: /Historial/ }));
    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await user.click(screen.getByLabelText("Volver"));

    expect(handlers.onStockTotal).toHaveBeenCalledOnce();
    expect(handlers.onHistory).toHaveBeenCalledOnce();
    expect(handlers.onEdit).toHaveBeenCalledOnce();
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });
});
