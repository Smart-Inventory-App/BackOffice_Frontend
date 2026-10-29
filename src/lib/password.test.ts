import { describe, expect, it } from "vitest";
import { generatePassword } from "./password";

describe("generatePassword", () => {
  it("genera 12 caracteres con una mayúscula, una minúscula y un número", () => {
    for (let i = 0; i < 50; i++) {
      const password = generatePassword();
      expect(password).toHaveLength(12);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
    }
  });

  it("no usa los caracteres que se confunden al leerlos", () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePassword(40)).not.toMatch(/[0O1lI]/);
    }
  });

  it("puede ser más larga y no repite siempre la misma", () => {
    expect(generatePassword(20)).toHaveLength(20);
    expect(new Set(Array.from({ length: 20 }, () => generatePassword())).size).toBeGreaterThan(15);
  });
});
