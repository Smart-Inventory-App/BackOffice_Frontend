import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiErrorMessage } from "@/lib/errors";
import { googleClientId, loadGoogleIdentity, type GoogleCredentialResponse } from "@/lib/google";

/** La «G» de Google en un solo color (el del botón), como el ícono de la app. */
function GoogleG({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.64 4.1-5.35 4.1a5.9 5.9 0 0 1 0-11.8c1.87 0 3.12.8 3.84 1.48l2.62-2.52C17.45 3.8 15 2.78 12 2.78a9.22 9.22 0 1 0 0 18.44c5.32 0 8.85-3.74 8.85-9 0-.6-.07-1.06-.15-1.12z" />
    </svg>
  );
}

/**
 * «Continuar con Google», igual que en la app: un botón blanco con el ícono de Google que muestra «Conectando...» mientras
 * entra. Sirve para ingresar y también para crear la cuenta: si es la primera vez, el servicio de cuentas la crea. Si la
 * persona cierra la ventana de Google no pasa nada; si falla, el error sale debajo del formulario con el mismo texto que en la app.
 *
 * Google solo permite su propio botón para pedir el idToken, así que se dibuja el oficial (invisible) encima de este: el
 * clic llega a Google y lo que se ve es el botón del dashboard.
 */
export default function GoogleButton({ onError }: { onError: (message: string) => void }) {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const handler = useRef<(response: GoogleCredentialResponse) => void>(() => {});

  handler.current = async ({ credential }) => {
    if (!credential) return;
    setLoading(true);
    try {
      await loginWithGoogle(credential);
      navigate("/", { replace: true });
    } catch (err: any) {
      onError(apiErrorMessage(err, "Error al iniciar sesión con Google"));
      setLoading(false);
    }
  };

  useEffect(() => {
    const clientId = googleClientId();
    if (!clientId) return;
    let cancelled = false;
    loadGoogleIdentity()
      .then((google) => {
        if (cancelled || !overlay.current) return;
        google.accounts.id.initialize({ client_id: clientId, callback: (response) => handler.current(response) });
        google.accounts.id.renderButton(overlay.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          locale: "es",
          width: Math.min(400, overlay.current.offsetWidth || 320),
        });
      })
      .catch(() => {
        if (!cancelled) onError("No se pudo contactar a Google");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <div
        aria-hidden
        className={`flex w-full items-center justify-center gap-2 rounded-xl border border-[#D1D1D1] bg-white px-4 py-2.5 text-[15px] font-semibold text-ink ${
          loading ? "opacity-60" : ""
        }`}
      >
        <GoogleG className={`h-[18px] w-[18px] ${loading ? "text-muted" : "text-primary"}`} />
        <span data-testid="google-button-label">{loading ? "Conectando..." : "Continuar con Google"}</span>
      </div>
      <div
        ref={overlay}
        data-testid="google-button-overlay"
        className={`absolute inset-0 overflow-hidden opacity-[0.01] ${loading ? "pointer-events-none" : ""}`}
      />
    </div>
  );
}
