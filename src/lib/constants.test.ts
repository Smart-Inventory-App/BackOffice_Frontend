import { describe, expect, it } from "vitest";
import { PAGE_SIZE } from "./constants";

describe("PAGE_SIZE", () => {
  it("es un número positivo", () => {
    expect(PAGE_SIZE).toBeGreaterThan(0);
  });
});
