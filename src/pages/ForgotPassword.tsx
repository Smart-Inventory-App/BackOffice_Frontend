import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import AuthLayout, { PasswordEye, validatePassword } from "@/components/AuthLayout";
import { Button, Field, Notice } from "@/components/ui";

type Step = "email" | "code" | "password";

/**
 * Recuperar la contraseña (o crear una, en las cuentas que se hicieron con Google) en tres pasos: el mail, el código de
 * seis dígitos que llega por correo y la contraseña nueva. El servicio de cuentas hace todo; acá solo se muestra.
 */
export default function ForgotPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? "");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setError(null);
    setLoading(true);
    try {
      await action();
    } catch (err: any) {
      setError(apiErrorMessage(err, fallback));
    } finally {
      setLoading(false);
    }
  };

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault();
    return run(async () => {
      await api.post("/admin/auth/forgot-password", { email: email.trim() });
      setNotice(`Si ${email.trim()} tiene una cuenta, le enviamos un código.`);
      setStep("code");
    }, "No se pudo enviar el código.");
  };

  const verifyCode = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { data } = await api.post<{ reset_token: string }>("/admin/auth/verify-code", {
        email: email.trim(),
        code: code.trim(),
      });
      setResetToken(data.reset_token);
      setNotice(null);
      setStep("password");
    }, "No se pudo verificar el código.");
  };

  const savePassword = (e: FormEvent) => {
    e.preventDefault();
    const rule = validatePassword(password);
    if (rule) return setError(rule);
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    return run(async () => {
      await api.post("/admin/auth/reset-password", { reset_token: resetToken, new_password: password });
      navigate("/login", { replace: true, state: { email: email.trim(), passwordChanged: true } });
    }, "No se pudo cambiar la contraseña.");
  };

  return (
    <AuthLayout
      subtitle={step === "password" ? "Elegí tu contraseña nueva" : "Recuperá el acceso a tu cuenta"}
      footer={
        <Link to="/login" state={{ email }} className="font-semibold text-primary hover:underline">
          Volver a iniciar sesión
        </Link>
      }
    >
      {step === "email" && (
        <form onSubmit={sendCode} className="space-y-4">
          <p className="text-sm text-muted">Te mandamos un código por mail para crear o cambiar tu contraseña.</p>
          <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="tu@email.com" />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
            {loading ? "Enviando…" : "Enviar código"}
          </Button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verifyCode} className="space-y-4">
          {notice && <Notice tone="ok">{notice}</Notice>}
          <Field
            label="Código de 6 dígitos"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
            placeholder="123456"
            inputClassName="text-center text-lg tracking-[0.4em]"
          />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
            {loading ? "Verificando…" : "Continuar"}
          </Button>
          <button
            type="button"
            onClick={() => sendCode()}
            disabled={loading}
            className="w-full text-center text-sm font-medium text-primary hover:underline"
          >
            Enviar un código nuevo
          </button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={savePassword} className="space-y-4">
          <Field
            label="Contraseña nueva"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            placeholder="Tu contraseña nueva"
            help="Mínimo 8 caracteres, con una mayúscula, una minúscula y un número."
            right={<PasswordEye shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
          />
          <Field
            label="Repetir contraseña"
            type={showPassword ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repetí la contraseña"
          />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Guardando…" : "Guardar contraseña"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
