import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import AuthLayout, { PasswordEye, validatePassword } from "@/components/AuthLayout";
import { Button, Field, Notice } from "@/components/ui";

export default function Register() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefillEmail = (location.state as { email?: string } | null)?.email ?? "";

  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          placeholder="tu@email.com"
        />
        <Field
          label="Contraseña"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus={Boolean(prefillEmail)}
          placeholder="Tu contraseña"
          help="Mínimo 8 caracteres, con una mayúscula, una minúscula y un número."
          right={<PasswordEye shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
        />
        <Field
          label="Repetir contraseña"
          type={showPassword ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          placeholder="Repetí la contraseña"
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creando cuenta…" : "Crear cuenta"}
        </Button>
      </form>
    </AuthLayout>
  );
}
