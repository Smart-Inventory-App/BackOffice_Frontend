import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN_KEY = "backoffice_token";

describe("api / getToken / setToken", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it("getToken devuelve null si no hay nada guardado", async () => {
    const { getToken } = await import("./api");
    expect(getToken()).toBeNull();
  });

  it("setToken guarda el token en localStorage", async () => {
    const { getToken, setToken } = await import("./api");
    setToken("abc123");
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe("abc123");
    expect(getToken()).toBe("abc123");
  });

  it("setToken(null) borra el token guardado", async () => {
    const { getToken, setToken } = await import("./api");
    setToken("abc123");
    setToken(null);
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(getToken()).toBeNull();
  });

  it("usa localhost:8002 como baseURL por defecto", async () => {
    const { api } = await import("./api");
    expect(api.defaults.baseURL).toBe("http://localhost:8002");
  });

  it("el interceptor de request agrega el header Authorization si hay token", async () => {
    const { api, setToken } = await import("./api");
    setToken("mi-token");
    const config = await (api.interceptors.request as unknown as { handlers: Array<{ fulfilled: (v: any) => any; rejected: (e: any) => any }> }).handlers[0].fulfilled({ headers: {} } as any);
    expect(config.headers.Authorization).toBe("Bearer mi-token");
  });

  it("el interceptor de request no agrega el header si no hay token", async () => {
    const { api } = await import("./api");
    const config = await (api.interceptors.request as unknown as { handlers: Array<{ fulfilled: (v: any) => any; rejected: (e: any) => any }> }).handlers[0].fulfilled({ headers: {} } as any);
    expect(config.headers.Authorization).toBeUndefined();
  });

  it("el interceptor de response deja pasar una respuesta exitosa", async () => {
    const { api } = await import("./api");
    const res = { data: "ok" };
    expect((api.interceptors.response as unknown as { handlers: Array<{ fulfilled: (v: any) => any; rejected: (e: any) => any }> }).handlers[0].fulfilled(res as any)).toBe(res);
  });

  it("el interceptor de response borra el token y redirige a /login en un 401", async () => {
    const { api, getToken, setToken } = await import("./api");
    setToken("mi-token");

    delete (window as any).location;
    (window as any).location = { pathname: "/productos", href: "" };

    const error = { response: { status: 401 } };
    await expect(
      (api.interceptors.response as unknown as { handlers: Array<{ fulfilled: (v: any) => any; rejected: (e: any) => any }> }).handlers[0].rejected(error),
    ).rejects.toBe(error);

    expect(getToken()).toBeNull();
    expect(window.location.href).toBe("/login");
  });

  it("el interceptor de response no redirige de nuevo si ya está en /login", async () => {
    const { api } = await import("./api");

    delete (window as any).location;
    (window as any).location = { pathname: "/login", href: "" };

    const error = { response: { status: 401 } };
    await expect(
      (api.interceptors.response as unknown as { handlers: Array<{ fulfilled: (v: any) => any; rejected: (e: any) => any }> }).handlers[0].rejected(error),
    ).rejects.toBe(error);

    expect(window.location.href).toBe("");
  });

  it("el interceptor de response no toca nada en errores que no son 401", async () => {
    const { api, setToken, getToken } = await import("./api");
    setToken("mi-token");

    delete (window as any).location;
    (window as any).location = { pathname: "/productos", href: "" };

    const error = { response: { status: 500 } };
    await expect(
      (api.interceptors.response as unknown as { handlers: Array<{ fulfilled: (v: any) => any; rejected: (e: any) => any }> }).handlers[0].rejected(error),
    ).rejects.toBe(error);

    expect(getToken()).toBe("mi-token");
    expect(window.location.href).toBe("");
  });

  it("el interceptor de response maneja un error sin response (de red)", async () => {
    const { api } = await import("./api");
    const error = {};
    await expect(
      (api.interceptors.response as unknown as { handlers: Array<{ fulfilled: (v: any) => any; rejected: (e: any) => any }> }).handlers[0].rejected(error),
    ).rejects.toBe(error);
  });
});
