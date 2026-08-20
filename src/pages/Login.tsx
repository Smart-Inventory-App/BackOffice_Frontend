import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

export default function Login() {
  const { admin, login } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (admin) return <Navigate to="/" replace />;

  const onEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<{ exists: boolean; is_admin: boolean; password_set: boolean }>(
        "/admin/auth/check",
        { email },
      );
      if (!data.exists) {
        setError("No existe una cuenta con ese email.");
        return;
      }
      if (data.is_admin && !data.password_set) {
        navigate("/set-password", { state: { email } });
        return;
      }
      setStep("password");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "No se pudo verificar el email.");
    } finally {
      setLoading(false);
    }
  };

  const onPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "No se pudo iniciar sesión.");
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
          <p className="mt-1 text-sm text-muted">Panel de administración (Backoffice)</p>
        </div>

        {step === "email" ? (
          <form onSubmit={onEmailSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="admin@smartinventory.com"
              />
            </div>
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
              {loading ? "Verificando…" : "Continuar"}
            </button>
          </form>
        ) : (
          <form onSubmit={onPasswordSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Email</label>
              <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm">
                <span className="truncate text-muted" title={email}>{email}</span>
                <button
                  type="button"
                  onClick={() => { setStep("email"); setPassword(""); setError(null); }}
                  className="ml-2 shrink-0 text-xs font-medium text-primaryDark hover:underline"
                >
                  Cambiar
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="••••••••"
              />
            </div>
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
              {loading ? "Ingresando…" : "Iniciar sesión"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
