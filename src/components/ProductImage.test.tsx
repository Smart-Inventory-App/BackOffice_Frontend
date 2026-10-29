import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ProductImage from "./ProductImage";

describe("ProductImage", () => {
  it("sin url, muestra el ícono de imagen ausente", () => {
    render(<ProductImage url={null} alt="Yerba" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("con url, muestra la imagen", () => {
    render(<ProductImage url="https://example.com/foto.jpg" alt="Yerba" />);
    const img = screen.getByRole("img", { name: "Yerba" });
    expect(img).toHaveAttribute("src", "https://example.com/foto.jpg");
  });

  it("si la imagen falla al cargar, cae al ícono de imagen ausente", () => {
    render(<ProductImage url="https://example.com/rota.jpg" alt="Yerba" />);
    const img = screen.getByRole("img", { name: "Yerba" });
    fireEvent.error(img);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("acepta una clase custom", () => {
    render(<ProductImage url={null} alt="Yerba" className="h-4 w-4" />);
    expect(document.querySelector(".h-4.w-4")).toBeInTheDocument();
  });
});

describe("ProductImage dentro de una fila que se toca", () => {
  function inRow() {
    const onRow = vi.fn();
    render(
      <button type="button" onClick={onRow}>
        <ProductImage url="https://example.com/foto.jpg" alt="Yerba" />
      </button>,
    );
    return onRow;
  }

  it("al tocar la imagen se abre en grande y no se abre la fila", async () => {
    const onRow = inRow();

    await userEvent.setup().click(screen.getByTestId("product-image-zoom"));

    expect(screen.getByTestId("image-viewer-frame")).toBeInTheDocument();
    expect(onRow).not.toHaveBeenCalled();
  });

  it("al cerrar la imagen con la «X» no se abre la fila", async () => {
    const user = userEvent.setup();
    const onRow = inRow();

    await user.click(screen.getByTestId("product-image-zoom"));
    await user.click(screen.getByTestId("image-viewer-close"));

    expect(screen.queryByTestId("image-viewer-frame")).not.toBeInTheDocument();
    expect(onRow).not.toHaveBeenCalled();
  });

  it("al salir tocando el fondo tampoco se abre la fila", async () => {
    const user = userEvent.setup();
    const onRow = inRow();

    await user.click(screen.getByTestId("product-image-zoom"));
    await user.click(screen.getByTestId("image-viewer-backdrop"));

    expect(screen.queryByTestId("image-viewer-frame")).not.toBeInTheDocument();
    expect(onRow).not.toHaveBeenCalled();
  });

  it("con Escape se cierra la imagen y la fila sigue sin abrirse", async () => {
    const user = userEvent.setup();
    const onRow = inRow();

    await user.click(screen.getByTestId("product-image-zoom"));
    await user.keyboard("{Escape}");

    expect(screen.queryByTestId("image-viewer-frame")).not.toBeInTheDocument();
    expect(onRow).not.toHaveBeenCalled();
  });
});
