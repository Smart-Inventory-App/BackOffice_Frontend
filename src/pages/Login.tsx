import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import AuthLayout, { PasswordEye } from "@/components/AuthLayout";
import { Button, Field, Notice } from "@/components/ui";

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
  const [showPassword, setShowPassword] = useState(false);
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
          {notice && <Notice tone="ok">{notice}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          {googleOnly && (
            <Notice tone="info">
              Esta cuenta se creó con Google y todavía no tiene contraseña.{" "}
              <Link to="/forgot-password" state={{ email: email.trim() }} className="font-semibold underline">
                Crear una contraseña
              </Link>
            </Notice>
          )}
          <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
            {loading ? "Verificando…" : "Continuar"}
          </Button>
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
          <Field
            label="Contraseña"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            required
            autoFocus
            placeholder="Tu contraseña"
            error={error}
            right={<PasswordEye shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
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
    </AuthLayout>
  );
}
