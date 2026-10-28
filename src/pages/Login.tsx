import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { clearSessionExpired, sessionExpired } from "@/lib/sessionExpired";
import { apiErrorMessage } from "@/lib/errors";
import AuthLayout, { PasswordField } from "@/components/AuthLayout";
import { Button, ConfirmDialog, Field, Notice } from "@/components/ui";
import GoogleButton from "@/components/GoogleButton";
import { googleEnabled } from "@/lib/google";

interface CheckResponse {
  exists: boolean;
  is_admin: boolean;
  password_set: boolean;
  google_only?: boolean;
}

export default function Login() {
  const { admin, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { email?: string; registered?: boolean; passwordChanged?: boolean } | null;

  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState(navState?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [googleOnly, setGoogleOnly] = useState(false);
  const [notice, setNotice] = useState<string | null>(
    navState?.registered
      ? "Cuenta creada. Iniciá sesión con tu contraseña."
      : navState?.passwordChanged
        ? "Contraseña actualizada. Iniciá sesión con la nueva."
        : null,
  );
  const [loading, setLoading] = useState(false);
  // La sesión se cerró porque expiró: se avisa en esta pantalla y el aviso no se repite al recargar
  const [expired] = useState(() => sessionExpired());
  useEffect(() => {
    clearSessionExpired();
  }, []);

  if (admin) return <Navigate to="/" replace />;

  const onEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setGoogleOnly(false);
    setLoading(true);
    try {
      const { data } = await api.post<CheckResponse>("/admin/auth/check", { email: email.trim() });
      if (!data.exists) {
        setError("No existe una cuenta con ese email.");
        return;
      }
      if (data.google_only) {
        setGoogleOnly(true);
        return;
      }
      if (data.is_admin && !data.password_set) {
        navigate("/set-password", { state: { email: email.trim() } });
        return;
      }
      setStep("password");
    } catch (err: any) {
      setError(apiErrorMessage(err, "No se pudo verificar el email."));
    } finally {
      setLoading(false);
    }
  };

  const onPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(apiErrorMessage(err, "No se pudo iniciar sesión."));
    } finally {
      setLoading(false);
    }
  };

  const backToEmail = () => {
    setStep("email");
    setPassword("");
    setError(null);
  };

  return (
    <AuthLayout
      subtitle="Panel de administración y gestión de tu inventario"
      footer={
        step === "email" ? (
          <span className="text-muted">
            ¿No tenés cuenta?{" "}
            <Link to="/register" state={{ email }} className="font-semibold text-primary hover:underline">
              Crear cuenta
            </Link>
          </span>
        ) : undefined
      }
    >
      {step === "email" ? (
        <form onSubmit={onEmailSubmit} className="space-y-4">
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setGoogleOnly(false);
            }}
            required
            autoFocus
            placeholder="tu@email.com"
          />
          {expired && !notice && <Notice tone="info">Tu sesión expiró. Volvé a iniciar sesión para seguir.</Notice>}
          {notice && <Notice tone="ok">{notice}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
            {loading ? "Verificando…" : "Continuar"}
          </Button>
          {googleEnabled() && (
            <>
              <div className="flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-line" />
                <span className="text-sm text-muted">o</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <GoogleButton onError={setError} />
            </>
          )}
        </form>
      ) : (
        <form onSubmit={onPasswordSubmit} className="space-y-4">
          <button
            type="button"
            onClick={backToEmail}
            className="flex w-full items-center gap-2 text-left text-sm text-primary hover:underline"
          >
            <ArrowLeft size={16} className="shrink-0" />
            <span className="truncate" title={email}>{email}</span>
          </button>
          <PasswordField
            label="Contraseña"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            required
            autoFocus
            placeholder="Tu contraseña"
            error={error}
          />
          <Button type="submit" className="w-full" disabled={loading || !password}>
            {loading ? "Ingresando…" : "Continuar"}
          </Button>
          <div className="text-center">
            <Link to="/forgot-password" state={{ email }} className="text-sm font-medium text-primary hover:underline">
              Olvidé mi contraseña
            </Link>
          </div>
        </form>
      )}
      {/* Cuenta creada con Google y sin contraseña: las dos salidas, como en la app */}
      {googleOnly && (
        <ConfirmDialog
          title="Cuenta de Google"
          message="Esta cuenta se creó con Google y todavía no tiene contraseña. Ingresá con Google o creá una contraseña."
          confirmLabel="Crear contraseña"
          cancelLabel="Volver al login"
          stacked
          onConfirm={() => navigate("/forgot-password", { state: { email: email.trim() } })}
          onCancel={() => setGoogleOnly(false)}
        />
      )}
    </AuthLayout>
  );
}
