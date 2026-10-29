import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImageViewer from "./ImageViewer";
import ProductImage from "./ProductImage";

const scaleOf = () => {
  const match = /scale\(([\d.]+)\)/.exec(screen.getByTestId("image-viewer-image").style.transform);
  return Number(match?.[1]);
};

function touch(target: HTMLElement, type: "touchStart" | "touchMove" | "touchEnd", x = 100, y = 100) {
  const touches = type === "touchEnd" ? [] : [{ clientX: x, clientY: y }];
  fireEvent[type](target, { touches });
}

describe("ImageViewer", () => {
  it("muestra la imagen en un diálogo con una «X» para cerrar", async () => {
    const onClose = vi.fn();
    render(<ImageViewer url="https://img/foto.jpg" alt="Yerba" onClose={onClose} />);

    const dialog = screen.getByRole("dialog", { name: "Imagen de Yerba" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId("image-viewer-image")).toHaveAttribute("src", "https://img/foto.jpg");
    await userEvent.setup().click(screen.getByRole("button", { name: "Cerrar imagen" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("también se cierra con Escape y tocando el fondo", async () => {
    const onClose = vi.fn();
    render(<ImageViewer url="u" alt="Yerba" onClose={onClose} />);

    await userEvent.setup().keyboard("{Escape}");
    await userEvent.setup().click(screen.getByTestId("image-viewer-backdrop"));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("la rueda del mouse agranda y achica, entre 1 y 6 veces", () => {
    render(<ImageViewer url="u" alt="Yerba" onClose={() => {}} />);
    const frame = screen.getByTestId("image-viewer-frame");
    expect(scaleOf()).toBe(1);

    fireEvent.wheel(frame, { deltaY: -100, clientX: 10, clientY: 10 });
    expect(scaleOf()).toBeGreaterThan(1);
    fireEvent.wheel(frame, { deltaY: 100 });
    expect(scaleOf()).toBeCloseTo(1, 5);
    fireEvent.wheel(frame, { deltaY: 100 });
    expect(scaleOf()).toBe(1); // no baja de 1

    for (let i = 0; i < 40; i++) fireEvent.wheel(frame, { deltaY: -100 });
    expect(scaleOf()).toBe(6); // ni pasa de 6
  });

  describe("desde el celular", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 28, 12, 0, 0));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("un solo toque no hace zoom", () => {
      render(<ImageViewer url="u" alt="Yerba" onClose={() => {}} />);
      const frame = screen.getByTestId("image-viewer-frame");

      touch(frame, "touchStart");
      touch(frame, "touchMove", 300, 300);
      touch(frame, "touchEnd");

      expect(scaleOf()).toBe(1);
    });

    it("dos toques y arrastrar hacia afuera agranda, y al soltar vuelve al tamaño normal", () => {
      render(<ImageViewer url="u" alt="Yerba" onClose={() => {}} />);
      const frame = screen.getByTestId("image-viewer-frame");

      touch(frame, "touchStart");
      touch(frame, "touchEnd");
      vi.advanceTimersByTime(150);
      touch(frame, "touchStart");
      touch(frame, "touchMove", 220, 100); // 120 px: el doble
      expect(scaleOf()).toBeCloseTo(2, 5);
      touch(frame, "touchMove", 700, 100); // lejos: se frena en 4
      expect(scaleOf()).toBe(4);
      touch(frame, "touchEnd");

      expect(scaleOf()).toBe(1);
      expect(screen.getByTestId("image-viewer-image").className).toContain("transition-transform");
    });

    it("si pasa mucho tiempo entre un toque y el otro, no cuenta como doble toque", () => {
      render(<ImageViewer url="u" alt="Yerba" onClose={() => {}} />);
      const frame = screen.getByTestId("image-viewer-frame");

      touch(frame, "touchStart");
      touch(frame, "touchEnd");
      vi.advanceTimersByTime(800);
      touch(frame, "touchStart");
      touch(frame, "touchMove", 400, 100);

      expect(scaleOf()).toBe(1);
    });
  });
});

describe("ProductImage · ampliar", () => {
  it("al hacer clic en la imagen se abre en grande, y la «X» la cierra", async () => {
    const user = userEvent.setup();
    render(<ProductImage url="https://img/foto.jpg" alt="Yerba" />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("product-image-zoom"));
    expect(screen.getByRole("dialog", { name: "Imagen de Yerba" })).toBeInTheDocument();

    await user.click(screen.getByTestId("image-viewer-close"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("también se abre con el teclado (Enter o Espacio)", async () => {
    const user = userEvent.setup();
    render(<ProductImage url="https://img/foto.jpg" alt="Yerba" />);

    screen.getByTestId("product-image-zoom").focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.keyboard(" ");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("una tecla cualquiera no la abre", async () => {
    const user = userEvent.setup();
    render(<ProductImage url="https://img/foto.jpg" alt="Yerba" />);

    screen.getByTestId("product-image-zoom").focus();
    await user.keyboard("a");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("el clic para ampliar no llega a la fila o tarjeta que la contiene", async () => {
    const user = userEvent.setup();
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <ProductImage url="https://img/foto.jpg" alt="Yerba" />
      </div>,
    );

    await user.click(screen.getByTestId("product-image-zoom"));

    expect(onRow).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sin url o con la imagen rota no hay nada para ampliar", () => {
    const { unmount } = render(<ProductImage url={null} alt="Yerba" />);
    expect(screen.queryByTestId("product-image-zoom")).not.toBeInTheDocument();
    unmount();

    render(<ProductImage url="https://img/rota.jpg" alt="Yerba" />);
    fireEvent.error(screen.getByRole("img", { name: "Yerba" }));
    expect(screen.queryByTestId("product-image-zoom")).not.toBeInTheDocument();
  });

  it("con zoomable en falso es solo la imagen", () => {
    render(<ProductImage url="https://img/foto.jpg" alt="Yerba" zoomable={false} />);

    expect(screen.queryByTestId("product-image-zoom")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Yerba" })).toBeInTheDocument();
  });
});
