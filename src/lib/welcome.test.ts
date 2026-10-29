import { beforeEach, describe, expect, it } from "vitest";
import { clearWelcome, justLoggedIn, markJustLoggedIn } from "./welcome";

describe("welcome", () => {
  beforeEach(() => {
    clearWelcome();
  });

  it("al arrancar no hay un ingreso reciente", () => {
    expect(justLoggedIn()).toBe(false);
  });

  it("se marca al iniciar sesión y se borra cuando el dashboard lo usó", () => {
    markJustLoggedIn();
    expect(justLoggedIn()).toBe(true);

    clearWelcome();
    expect(justLoggedIn()).toBe(false);
  });
});
