import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Picklist, addIfMissing } from "./Picklist";

describe("addIfMissing", () => {
  it("agrega un valor nuevo y ordena alfabéticamente", () => {
    expect(addIfMissing(["Zapallo", "Arroz"], "Manzana")).toEqual(["Arroz", "Manzana", "Zapallo"]);
  });

  it("no duplica un valor ya presente", () => {
    expect(addIfMissing(["Arroz"], "Arroz")).toEqual(["Arroz"]);
  });

  it("ignora valores vacíos o nulos", () => {
    expect(addIfMissing(["Arroz"], "")).toEqual(["Arroz"]);
    expect(addIfMissing(["Arroz"], null)).toEqual(["Arroz"]);
    expect(addIfMissing(["Arroz"], undefined)).toEqual(["Arroz"]);
  });
});

describe("Picklist", () => {
  it("muestra las opciones y el placeholder por defecto", () => {
    render(<Picklist label="Categoría" value="" options={["Almacén"]} onChange={vi.fn()} />);
    expect(screen.getByText("Categoría")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Seleccionar…" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Almacén" })).toBeInTheDocument();
  });

  it("usa el emptyLabel cuando se provee", () => {
    render(<Picklist label="Marca" value="" options={[]} emptyLabel="Sin marca" onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: "Sin marca" })).toBeInTheDocument();
  });

  it("muestra el valor actual aunque no esté en las opciones todavía", () => {
    render(<Picklist label="Ubicación" value="Freezer" options={["Alacena"]} onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: "Freezer" })).toBeInTheDocument();
  });

  it("selecciona una opción existente y llama a onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Picklist label="Categoría" value="" options={["Almacén", "Limpieza"]} onChange={onChange} />);
    await user.selectOptions(screen.getByRole("combobox"), "Limpieza");
    expect(onChange).toHaveBeenCalledWith("Limpieza");
  });

  it("permite agregar una opción nueva escribiendo y confirmando con Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Picklist label="Categoría" value="" options={["Almacén"]} onChange={onChange} />);

    await user.selectOptions(screen.getByRole("combobox"), "+ Nueva…");
    const input = screen.getByRole("textbox");
    await user.type(input, "Bebidas{Enter}");

    expect(onChange).toHaveBeenCalledWith("Bebidas");
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("permite agregar una opción nueva con el botón OK", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Picklist label="Categoría" value="" options={[]} onChange={onChange} />);

    await user.selectOptions(screen.getByRole("combobox"), "+ Nueva…");
    await user.type(screen.getByRole("textbox"), "  Limpieza  ");
    await user.click(screen.getByRole("button", { name: "OK" }));

    expect(onChange).toHaveBeenCalledWith("Limpieza");
  });

  it("confirmar sin texto no llama a onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Picklist label="Categoría" value="" options={[]} onChange={onChange} />);

    await user.selectOptions(screen.getByRole("combobox"), "+ Nueva…");
    await user.click(screen.getByRole("button", { name: "OK" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("cancelar la creación vuelve al select sin llamar a onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Picklist label="Categoría" value="" options={["Almacén"]} onChange={onChange} />);

    await user.selectOptions(screen.getByRole("combobox"), "+ Nueva…");
    await user.type(screen.getByRole("textbox"), "Algo");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("marca el select como required cuando se pide", () => {
    render(<Picklist label="Categoría" value="" options={[]} required onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toBeRequired();
  });
});
