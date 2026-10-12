import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (!/[A-Z]/.test(pw)) return "Debe incluir al menos una mayúscula.";
  if (!/[a-z]/.test(pw)) return "Debe incluir al menos una minúscula.";
  if (!/[0-9]/.test(pw)) return "Debe incluir al menos un número.";
  return null;
}

export default function Register() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefillEmail = (location.state as { email?: string } | null)?.email ?? "";

  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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
      await api.post("/admin/auth/register", { email, password });
      navigate("/login", { replace: true, state: { email, registered: true } });
    } catch (err: any) {
      setError(apiErrorMessage(err, "No se pudo crear la cuenta."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold">
            <span className="text-primary">Smart</span>
            <span className="text-primaryDark">Inventory</span>
          </div>
          <p className="mt-1 text-sm text-muted">Creá tu cuenta</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus={!prefillEmail}
              className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-primary"
              placeholder="tu@email.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus={Boolean(prefillEmail)}
              className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-primary"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Repetir contraseña</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-primary"
              placeholder="••••••••"
            />
          </div>

          <p className="text-xs text-muted">
            Mínimo 8 caracteres, con una mayúscula, una minúscula y un número.
          </p>

          {error && (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Creando cuenta…" : "Crear cuenta"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className="w-full text-center text-xs font-medium text-primaryDark hover:underline"
          >
            Ya tengo cuenta — Iniciar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
