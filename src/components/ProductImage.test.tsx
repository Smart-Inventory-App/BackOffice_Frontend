import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
