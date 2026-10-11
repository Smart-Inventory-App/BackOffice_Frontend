import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getToken: vi.fn(),
  setToken: vi.fn(),
}));

import { api, getToken, setToken } from "@/lib/api";

const ADMIN = {
  id: "1",
  email: "admin@test.com",
  full_name: "Admin",
  is_admin: true,
  is_active: true,
};

function Probe() {
  const { admin, loading, login, logout, viewAsUser, setViewAsUser, effectiveIsAdmin } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="admin">{admin ? admin.email : "sin-admin"}</span>
      <span data-testid="effective">{String(effectiveIsAdmin)}</span>
      <span data-testid="viewAsUser">{String(viewAsUser)}</span>
      <button onClick={() => login("admin@test.com", "1234")}>login</button>
      <button onClick={() => logout()}>logout</button>
      <button onClick={() => setViewAsUser(true)}>ver-como-usuario</button>
      <button onClick={() => setViewAsUser(false)}>ver-como-admin</button>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("sin token guardado, termina de cargar sin admin", async () => {
    vi.mocked(getToken).mockReturnValue(null);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("admin").textContent).toBe("sin-admin");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("con token guardado, pide /admin/auth/me y carga el admin", async () => {
    vi.mocked(getToken).mockReturnValue("token-valido");
    vi.mocked(api.get).mockResolvedValueOnce({ data: ADMIN });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("admin").textContent).toBe(ADMIN.email));
    expect(api.get).toHaveBeenCalledWith("/admin/auth/me");
    expect(screen.getByTestId("effective").textContent).toBe("true");
  });

  it("si /admin/auth/me falla, borra el token y sigue sin admin", async () => {
    vi.mocked(getToken).mockReturnValue("token-invalido");
    vi.mocked(api.get).mockRejectedValueOnce(new Error("401"));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(setToken).toHaveBeenCalledWith(null);
    expect(screen.getByTestId("admin").textContent).toBe("sin-admin");
  });

  it("login hace POST, guarda el token y consulta el perfil", async () => {
    vi.mocked(getToken).mockReturnValue(null);
    vi.mocked(api.post).mockResolvedValueOnce({ data: { access_token: "nuevo-token" } });
    vi.mocked(api.get).mockResolvedValueOnce({ data: ADMIN });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    await act(async () => {
      await user.click(screen.getByText("login"));
    });

    expect(api.post).toHaveBeenCalledWith("/admin/auth/login", {
      email: "admin@test.com",
      password: "1234",
    });
    expect(setToken).toHaveBeenCalledWith("nuevo-token");
    await waitFor(() => expect(screen.getByTestId("admin").textContent).toBe(ADMIN.email));
  });

  it("logout limpia token, admin y viewAsUser", async () => {
    vi.mocked(getToken).mockReturnValue("token-valido");
    vi.mocked(api.get).mockResolvedValueOnce({ data: ADMIN });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("admin").textContent).toBe(ADMIN.email));

    await user.click(screen.getByText("logout"));

    expect(setToken).toHaveBeenCalledWith(null);
    expect(screen.getByTestId("admin").textContent).toBe("sin-admin");
  });

  it("viewAsUser guarda la preferencia en localStorage y afecta effectiveIsAdmin", async () => {
    vi.mocked(getToken).mockReturnValue("token-valido");
    vi.mocked(api.get).mockResolvedValueOnce({ data: ADMIN });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("admin").textContent).toBe(ADMIN.email));
    expect(screen.getByTestId("effective").textContent).toBe("true");

    await user.click(screen.getByText("ver-como-usuario"));
    expect(screen.getByTestId("viewAsUser").textContent).toBe("true");
    expect(screen.getByTestId("effective").textContent).toBe("false");
    expect(window.localStorage.getItem("backoffice_view_as_user")).toBe("1");

    await user.click(screen.getByText("ver-como-admin"));
    expect(screen.getByTestId("viewAsUser").textContent).toBe("false");
    expect(window.localStorage.getItem("backoffice_view_as_user")).toBeNull();
  });

  it("lee viewAsUser inicial desde localStorage", async () => {
    window.localStorage.setItem("backoffice_view_as_user", "1");
    vi.mocked(getToken).mockReturnValue(null);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("viewAsUser").textContent).toBe("true");
  });

  it("useAuth fuera de un AuthProvider lanza un error", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow("useAuth must be used within AuthProvider");
    consoleError.mockRestore();
  });
});
