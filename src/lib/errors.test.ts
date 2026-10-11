import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./errors";

const conDetalle = (detail: unknown) => ({ response: { data: { detail } } });

describe("apiErrorMessage", () => {
  it("devuelve el texto del error cuando `detail` es un string", () => {
    expect(apiErrorMessage(conDetalle("Producto no encontrado"), "fallback")).toBe("Producto no encontrado");
  });

  it("usa el fallback si no hay respuesta (error de red) o `detail` está vacío", () => {
    expect(apiErrorMessage(new Error("Network Error"), "No se pudo guardar")).toBe("No se pudo guardar");
    expect(apiErrorMessage(undefined, "x")).toBe("x");
    expect(apiErrorMessage(conDetalle("   "), "x")).toBe("x");
    expect(apiErrorMessage(conDetalle(null), "x")).toBe("x");
    expect(apiErrorMessage(conDetalle([]), "x")).toBe("x");
  });

  it("no devuelve nunca un objeto: un 422 de FastAPI (lista de errores) se convierte en una frase", () => {
    const err = conDetalle([
      { type: "string_too_long", loc: ["body", "nombre"], msg: "String should have at most 20 characters", ctx: { max_length: 20 } },
    ]);

    const mensaje = apiErrorMessage(err, "fallback");

    expect(typeof mensaje).toBe("string");
    expect(mensaje).toBe("nombre: no puede tener más de 20 caracteres");
  });

  it.each([
    [{ type: "missing", loc: ["body", "categoria"] }, "categoria: es obligatorio"],
    [{ type: "greater_than", loc: ["body", "stock"], ctx: { gt: 0 } }, "stock: tiene que ser mayor a 0"],
    [{ type: "greater_than_equal", loc: ["body", "stock"], ctx: { ge: 0 } }, "stock: no puede ser menor a 0"],
    [{ type: "less_than", loc: ["body", "x"], ctx: { lt: 5 } }, "x: tiene que ser menor a 5"],
    [{ type: "less_than_equal", loc: ["body", "x"], ctx: { le: 5 } }, "x: no puede ser mayor a 5"],
    [{ type: "string_too_short", loc: ["body", "x"], ctx: { min_length: 3 } }, "x: tiene que tener al menos 3 caracteres"],
    [{ type: "int_parsing", loc: ["body", "stock"] }, "stock: tiene que ser un número entero"],
    [{ type: "int_type", loc: ["body", "stock"] }, "stock: tiene que ser un número entero"],
    [{ type: "date_parsing", loc: ["body", "vencimiento"] }, "vencimiento: no es una fecha válida"],
    [{ type: "date_from_datetime_parsing", loc: ["body", "vencimiento"] }, "vencimiento: no es una fecha válida"],
    [{ type: "value_error", loc: ["body", "codigo_barras"], msg: "El dígito verificador no coincide" }, "codigo_barras: El dígito verificador no coincide"],
    [{ type: "otra_cosa", loc: ["query"] }, "query: no es válido"],
    [{ type: "otra_cosa", msg: "algo falló" }, "algo falló"],
  ])("traduce el error de validación %j", (item, esperado) => {
    expect(apiErrorMessage(conDetalle([item]), "fallback")).toBe(esperado);
  });

  it("junta varios errores de validación y tolera elementos que no son objetos", () => {
    const err = conDetalle([
      { type: "missing", loc: ["body", "nombre"] },
      { type: "greater_than", loc: ["body", "stock"], ctx: { gt: 0 } },
      "texto suelto",
      null,
    ]);

    expect(apiErrorMessage(err, "fallback")).toBe("nombre: es obligatorio. stock: tiene que ser mayor a 0. texto suelto. no es válido");
  });
});
