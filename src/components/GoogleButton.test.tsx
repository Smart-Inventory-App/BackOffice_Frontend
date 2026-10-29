import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GoogleButton from "./GoogleButton";

const google = vi.hoisted(() => ({
  clientId: "cliente-web.apps.googleusercontent.com" as string | undefined,
  load: vi.fn(),
}));
vi.mock("@/lib/google", () => ({
  googleClientId: () => google.clientId,
  loadGoogleIdentity: () => google.load(),
}));

const auth = vi.hoisted(() => ({ loginWithGoogle: vi.fn() }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));

interface Fake {
  initialize: ReturnType<typeof vi.fn>;
  renderButton: ReturnType<typeof vi.fn>;
  callback?: (response: { credential?: string }) => void;
}

function fakeGoogle(): Fake {
  const fake: Fake = {
    initialize: vi.fn((config: { callback: Fake["callback"] }) => {
      fake.callback = config.callback;
    }),
    renderButton: vi.fn(),
  };
  google.load.mockResolvedValue({ accounts: { id: { initialize: fake.initialize, renderButton: fake.renderButton, disableAutoSelect: vi.fn() } } });
  return fake;
}

function renderButton(onError = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<GoogleButton onError={onError} />} />
        <Route path="/" element={<p>HOME</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return onError;
}

describe("GoogleButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    google.clientId = "cliente-web.apps.googleusercontent.com";
  });

  it("se ve como en la app: «Continuar con Google»", async () => {
    fakeGoogle();
    renderButton();

    expect(screen.getByTestId("google-button-label")).toHaveTextContent("Continuar con Google");
    await waitFor(() => expect(google.load).toHaveBeenCalled());
  });

  it("le pide a Google el cliente Web y dibuja su botón, en castellano, encima del propio", async () => {
    const fake = fakeGoogle();
    renderButton();

    await waitFor(() => expect(fake.renderButton).toHaveBeenCalled());
    expect(fake.initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: "cliente-web.apps.googleusercontent.com" }));
    const [parent, options] = fake.renderButton.mock.calls[0];
    expect(parent).toBe(screen.getByTestId("google-button-overlay"));
    expect(options).toMatchObject({ text: "continue_with", locale: "es", theme: "outline" });
    expect(screen.getByTestId("google-button-overlay").className).toContain("absolute");
  });

  it("al elegir una cuenta, muestra «Conectando...», manda el idToken y va al dashboard", async () => {
    const fake = fakeGoogle();
    let release: () => void = () => {};
    auth.loginWithGoogle.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    renderButton();
    await waitFor(() => expect(fake.callback).toBeDefined());

    act(() => { void fake.callback!({ credential: "id-token-de-google" }); });

    expect(await screen.findByText("Conectando...")).toBeInTheDocument();
    expect(auth.loginWithGoogle).toHaveBeenCalledWith("id-token-de-google");
    expect(screen.getByTestId("google-button-overlay").className).toContain("pointer-events-none");
    await act(async () => release());
    expect(await screen.findByText("HOME")).toBeInTheDocument();
  });

  it("si Google cierra sin elegir cuenta (sin credencial) no pasa nada", async () => {
    const fake = fakeGoogle();
    const onError = renderButton();
    await waitFor(() => expect(fake.callback).toBeDefined());

    act(() => { void fake.callback!({}); });

    expect(auth.loginWithGoogle).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByTestId("google-button-label")).toHaveTextContent("Continuar con Google");
  });

  it("si el servicio rechaza el ingreso, informa el motivo y vuelve a «Continuar con Google»", async () => {
    const fake = fakeGoogle();
    auth.loginWithGoogle.mockRejectedValue({ response: { data: { detail: "El email de Google no está verificado" } } });
    const onError = renderButton();
    await waitFor(() => expect(fake.callback).toBeDefined());

    act(() => { void fake.callback!({ credential: "t" }); });

    await waitFor(() => expect(onError).toHaveBeenCalledWith("El email de Google no está verificado"));
    expect(screen.getByTestId("google-button-label")).toHaveTextContent("Continuar con Google");
  });

  it("si falla sin detalle, usa «Error al iniciar sesión con Google»", async () => {
    const fake = fakeGoogle();
    auth.loginWithGoogle.mockRejectedValue(new Error("boom"));
    const onError = renderButton();
    await waitFor(() => expect(fake.callback).toBeDefined());

    act(() => { void fake.callback!({ credential: "t" }); });

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Error al iniciar sesión con Google"));
  });

  it("si no se puede cargar la librería de Google, lo avisa", async () => {
    google.load.mockRejectedValue(new Error("google_unreachable"));
    const onError = renderButton();

    await waitFor(() => expect(onError).toHaveBeenCalledWith("No se pudo contactar a Google"));
  });

  it("sin ID de cliente no intenta cargar nada", () => {
    google.clientId = undefined;
    renderButton();

    expect(google.load).not.toHaveBeenCalled();
  });

  it("si se desmonta antes de que cargue Google, no dibuja nada", async () => {
    let resolve: (value: unknown) => void = () => {};
    google.load.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { unmount } = render(
      <MemoryRouter>
        <GoogleButton onError={vi.fn()} />
      </MemoryRouter>,
    );
    unmount();
    const renderButtonSpy = vi.fn();

    await act(async () => resolve({ accounts: { id: { initialize: vi.fn(), renderButton: renderButtonSpy, disableAutoSelect: vi.fn() } } }));

    expect(renderButtonSpy).not.toHaveBeenCalled();
  });
});
