import { describe, expect, it } from "vitest";
import { digitosDelCodigo, LARGOS_CODIGO, limpiarCodigo } from "./barcode";

describe("limpiarCodigo", () => {
  it("deja pasar dígitos, espacios y guiones", () => {
    expect(limpiarCodigo("789 123-456")).toBe("789 123-456");
  });

  it("saca letras y símbolos que no son parte de un código escrito a mano", () => {
    expect(limpiarCodigo("abc789#123$")).toBe("789123");
  });

  it("con un string vacío devuelve vacío", () => {
    expect(limpiarCodigo("")).toBe("");
  });
});

describe("digitosDelCodigo", () => {
  it("se queda sólo con los dígitos", () => {
    expect(digitosDelCodigo("789 123-456")).toBe("789123456");
  });

  it("ignora letras y símbolos", () => {
    expect(digitosDelCodigo("EAN:7891234567895")).toBe("7891234567895");
  });

  it("con un string sin dígitos devuelve vacío", () => {
    expect(digitosDelCodigo("abc-")).toBe("");
  });
});

describe("LARGOS_CODIGO", () => {
  it("contiene los largos válidos de un GTIN", () => {
    expect(LARGOS_CODIGO).toEqual([8, 12, 13, 14]);
  });
});
