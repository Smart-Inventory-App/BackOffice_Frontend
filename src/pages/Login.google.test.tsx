import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import { AuthProvider } from "@/context/AuthContext";
import Login from "./Login";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
}));

const google = vi.hoisted(() => ({ enabled: true, onError: undefined as undefined | ((message: string) => void) }));
vi.mock("@/lib/google", () => ({
  googleEnabled: () => google.enabled,
  googleClientId: () => (google.enabled ? "web.apps.googleusercontent.com" : undefined),
  loadGoogleIdentity: () => new Promise(() => {}),
  signOutFromGoogle: vi.fn(),
}));

import { api } from "@/lib/api";

function renderLogin() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Login · ingreso con Google, como en la app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    google.enabled = true;
  });

  it("en el paso del email, debajo de «Continuar», hay una «o» y «Continuar con Google»", () => {
    renderLogin();

    const next = screen.getByRole("button", { name: "Continuar" });
    const label = screen.getByTestId("google-button-label");
    expect(label).toHaveTextContent("Continuar con Google");
    expect(screen.getByText("o")).toBeInTheDocument();
    expect(next.compareDocumentPosition(screen.getByText("o")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("o").compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sin ID de cliente de Google no aparece ni el botón ni la «o»", () => {
    google.enabled = false;
    renderLogin();

    expect(screen.queryByTestId("google-button-label")).not.toBeInTheDocument();
    expect(screen.queryByText("o")).not.toBeInTheDocument();
  });

  it("en el paso de la contraseña ya no se ofrece Google", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { exists: true, is_admin: false, password_set: true } });
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "ana@test.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByLabelText("Contraseña");

    expect(screen.queryByTestId("google-button-label")).not.toBeInTheDocument();
  });

  it("no hay botón de Google en la pantalla de crear cuenta (como en la app): ahí se crea con email y contraseña", async () => {
    const { default: Register } = await import("./Register");
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter>
          <Register />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.queryByTestId("google-button-label")).not.toBeInTheDocument();
  });
});
