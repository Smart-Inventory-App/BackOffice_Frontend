import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

function Rompe(): never {
  throw new Error("fallo al dibujar");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React registra en consola el error capturado; acá es lo esperado y ensucia la salida.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("muestra el contenido cuando no hay errores", () => {
    render(
      <ErrorBoundary>
        <p>Todo bien</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Todo bien")).toBeInTheDocument();
    expect(screen.queryByText("Algo salió mal")).not.toBeInTheDocument();
  });

  it("en vez de dejar la pantalla en blanco muestra un aviso con la opción de recargar", () => {
    render(
      <ErrorBoundary>
        <Rompe />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Algo salió mal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recargar" })).toBeInTheDocument();
  });

  it("deja registrado el error para poder diagnosticarlo", () => {
    render(
      <ErrorBoundary>
        <Rompe />
      </ErrorBoundary>,
    );

    expect(console.error).toHaveBeenCalledWith("Error de interfaz:", expect.any(Error), expect.any(String));
  });

  it("el botón recarga la página", async () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, reload } });

    render(
      <ErrorBoundary>
        <Rompe />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

    expect(reload).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });
});
