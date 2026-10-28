import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import AuthLayout, { PasswordEye, validatePassword } from "@/components/AuthLayout";
import { Button, Field, Notice } from "@/components/ui";

export default function SetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = (location.state as { email?: string } | null)?.email;

  const [inviteCode, setInviteCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!email) return <Navigate to="/login" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const rule = validatePassword(password);
    if (rule) return setError(rule);
    if (password !== confirm) return setError("Las contraseñas no coinciden.");

    setLoading(true);
    try {
      await api.post("/admin/auth/set-password", { email, password, invite_token: inviteCode.trim() });
      navigate("/login", { replace: true, state: { email } });
    } catch (err: any) {
      setError(apiErrorMessage(err, "No se pudo definir la contraseña."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      subtitle="Definí tu contraseña de administrador"
      footer={
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Volver a iniciar sesión
        </Link>
      }
    >
      <p className="mb-4 truncate text-center text-sm font-medium text-ink" title={email}>
        {email}
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Código de invitación"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          required
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="Pegá el código que te enviaron"
        />
        <Field
          label="Nueva contraseña"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Tu contraseña nueva"
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
          {loading ? "Guardando…" : "Definir contraseña"}
        </Button>
      </form>
    </AuthLayout>
  );
}
