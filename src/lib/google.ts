/**
 * Ingreso con Google en el navegador, con Google Identity Services. Es el equivalente web de lo que hace la app del celular
 * con `@react-native-google-signin`: se le pide a Google un **idToken**, se manda al servicio de cuentas y este lo verifica y
 * comprueba que lo haya emitido Google **para nuestro cliente Web** (el mismo ID que usa la app).
 */

const SCRIPT_URL = "https://accounts.google.com/gsi/client";

export interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
      disableAutoSelect: () => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

/** El ID del cliente Web de Google Cloud (`VITE_GOOGLE_CLIENT_ID`). Sin él, el botón de Google no aparece, igual que en la app. */
export function googleClientId(): string | undefined {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  return id && id.trim() ? id.trim() : undefined;
}

export const googleEnabled = (): boolean => googleClientId() !== undefined;

let loading: Promise<GoogleIdentity> | null = null;

/** Carga la librería de Google una sola vez. */
export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (loading) return loading;
  loading = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error("google_unavailable")));
    script.onerror = () => {
      loading = null; // se puede volver a intentar
      reject(new Error("google_unreachable"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Al cerrar sesión, Google no tiene que volver a entrar solo con la misma cuenta: la próxima vez se elige. Si no se cargó
 * la librería o falla, no pasa nada: la sesión del dashboard ya se cerró.
 */
export function signOutFromGoogle(): void {
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    // nada que hacer
  }
}
