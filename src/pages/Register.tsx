import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import AuthLayout, { PasswordField, validatePassword } from "@/components/AuthLayout";
import { Button, Field, Notice } from "@/components/ui";

// Si el email ya tiene cuenta, o es una cuenta creada con Google que todavía no tiene contraseña (como en la app)
type EmailStatus = "idle" | "available" | "taken" | "google";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Register() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefillEmail = (location.state as { email?: string } | null)?.email ?? "";

  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");

  // Se mira si el email ya tiene cuenta cuando se deja de escribir
  useEffect(() => {
    const wanted = email.trim();
    setEmailStatus("idle");
    if (!EMAIL_SHAPE.test(wanted)) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const res = await api.post<{ exists: boolean; google_only?: boolean }>("/admin/auth/check", { email: wanted });
        if (cancelled || !res?.data) return;
        setEmailStatus(!res.data.exists ? "available" : res.data.google_only ? "google" : "taken");
      } catch {
        // si no se pudo consultar, el alta dirá si algo está mal
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [email]);

  const emailBlocked = emailStatus === "taken" || emailStatus === "google";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const rule = validatePassword(password);
    if (rule) return setError(rule);
    if (password !== confirm) return setError("Las contraseñas no coinciden.");

    setLoading(true);
    try {
      await api.post("/admin/auth/register", { email: email.trim(), password });
      navigate("/login", { replace: true, state: { email: email.trim(), registered: true } });
    } catch (err: any) {
      setError(apiErrorMessage(err, "No se pudo crear la cuenta."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      subtitle="Creá tu cuenta"
      footer={
        <span className="text-muted">
          ¿Ya tenés cuenta?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Iniciar sesión
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus={!prefillEmail}
          placeholder="email@example.com"
          error={
            emailStatus === "taken"
              ? "Ya existe una cuenta con ese email."
              : emailStatus === "google"
                ? "Cuenta de Google: ese email ya tiene una cuenta creada con Google."
                : null
          }
          help={emailStatus === "available" ? "Email disponible" : undefined}
        />
        {emailStatus === "google" && (
          <p data-testid="register-google-hint" className="-mt-2 text-xs text-muted">
            Ingresá con Google o creá una contraseña desde{" "}
            <Link to="/forgot-password" state={{ email: email.trim() }} className="font-semibold text-primary hover:underline">
              «Olvidé mi contraseña»
            </Link>
            .
          </p>
        )}
        <PasswordField
          label="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus={Boolean(prefillEmail)}
          placeholder="Tu contraseña"
          help="Mínimo 8 caracteres, con una mayúscula, una minúscula y un número."
        />
        <PasswordField
          label="Repetir contraseña"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          placeholder="Repetí la contraseña"
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" className="w-full" disabled={loading || emailBlocked}>
          {loading ? "Creando cuenta…" : "Crear cuenta"}
        </Button>
      </form>
    </AuthLayout>
  );
}
