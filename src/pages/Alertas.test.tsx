import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Alertas from "./Alertas";
import type { MyProduct } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "@/lib/api";

function product(overrides: Partial<MyProduct> = {}): MyProduct {
  return {
    id: 1,
    nombre: "Yerba Mate",
    marca: null,
    categoria: "Almacén",
    stock: 1,
    vencimiento: null,
    descripcion: null,
    imagen_url: null,
    ubicacion: null,
    codigo_barras: null,
    stock_minimo: null,
    dias_alerta_vencimiento: null,
    created_at: null,
    ...overrides,
  };
}

describe("Alertas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra las tres secciones con sus productos", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string, config?: any) => {
      if (config?.params?.bajo_stock) return { data: { items: [product({ id: 1, nombre: "Yerba" })], total: 1 } };
      if (config?.params?.por_vencer) {
        return { data: { items: [product({ id: 2, nombre: "Leche", vencimiento: "2026-02-01" })], total: 1 } };
      }
      if (config?.params?.vencido) {
        return { data: { items: [product({ id: 3, nombre: "Queso", vencimiento: "2020-01-01" })], total: 1 } };
      }
      throw new Error("GET no mockeado");
    });

    renderWithProviders(<Alertas />);

    expect(await screen.findByText("Yerba")).toBeInTheDocument();
    expect(screen.getByText("Leche")).toBeInTheDocument();
    expect(screen.getByText("Queso")).toBeInTheDocument();
    expect(screen.getByText("2026-02-01")).toBeInTheDocument();
  });

  it("sin alertas, muestra los tres estados vacíos", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 0 } });
    renderWithProviders(<Alertas />);

    expect(await screen.findByText("No tenés productos con stock bajo.")).toBeInTheDocument();
    expect(screen.getByText("No tenés productos por vencer esta semana.")).toBeInTheDocument();
    expect(screen.getByText("No tenés productos vencidos.")).toBeInTheDocument();
  });
});
