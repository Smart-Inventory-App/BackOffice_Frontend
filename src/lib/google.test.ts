import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { googleClientId, googleEnabled, loadGoogleIdentity, signOutFromGoogle } from "./google";

function scripts() {
  return [...document.head.querySelectorAll("script")].filter((s) => s.src.includes("accounts.google.com/gsi/client"));
}

describe("lib/google", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.google;
    scripts().forEach((s) => s.remove());
  });

  describe("el ID de cliente", () => {
    it("sin VITE_GOOGLE_CLIENT_ID no hay Google (igual que en la app)", () => {
      vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
      expect(googleClientId()).toBeUndefined();
      expect(googleEnabled()).toBe(false);
    });

    it("con un ID de cliente lo usa, sin espacios", () => {
      vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "  web.apps.googleusercontent.com ");
      expect(googleClientId()).toBe("web.apps.googleusercontent.com");
      expect(googleEnabled()).toBe(true);
    });

    it("un ID en blanco no cuenta", () => {
      vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "   ");
      expect(googleEnabled()).toBe(false);
    });
  });

  describe("cargar la librería", () => {
    beforeEach(() => {
      delete window.google;
    });

    it("si ya está cargada, la devuelve sin agregar otro script", async () => {
      const ready = { accounts: { id: {} } };
      window.google = ready as never;

      await expect(loadGoogleIdentity()).resolves.toBe(ready);
      expect(scripts()).toHaveLength(0);
    });

    it("agrega el script una sola vez aunque se pida dos veces, y resuelve cuando carga", async () => {
      const first = loadGoogleIdentity();
      const second = loadGoogleIdentity();
      expect(scripts()).toHaveLength(1);
      expect(second).toBe(first);

      const ready = { accounts: { id: { initialize: vi.fn() } } };
      window.google = ready as never;
      scripts()[0].dispatchEvent(new Event("load"));

      await expect(first).resolves.toBe(ready);
    });
  });

  describe("cerrar sesión", () => {
    it("le pide a Google que no vuelva a entrar solo con la misma cuenta", () => {
      const disableAutoSelect = vi.fn();
      window.google = { accounts: { id: { disableAutoSelect } } } as never;

      signOutFromGoogle();

      expect(disableAutoSelect).toHaveBeenCalledOnce();
    });

    it("sin la librería cargada, o si falla, no rompe", () => {
      expect(() => signOutFromGoogle()).not.toThrow();
      window.google = { accounts: { id: { disableAutoSelect: () => { throw new Error("boom"); } } } } as never;
      expect(() => signOutFromGoogle()).not.toThrow();
    });
  });
});
