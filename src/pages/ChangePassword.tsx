import { useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import AuthLayout, { PasswordField, validatePassword } from "@/components/AuthLayout";
import { Button, Notice } from "@/components/ui";

/**
 * Primer ingreso con la contraseña inicial que le dio un administrador: antes de usar el dashboard hay que cambiarla por
 * una propia. Mientras la cuenta tenga esa marca no se muestra otra cosa (ver `Protected` en `App.tsx`).
 */
export default function ChangePassword() {
  const { admin, refresh, logout } = useAuth();
  const [current, setCurrent] = useState("");
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
    if (password === current) return setError("La contraseña nueva no puede ser igual a la actual.");

    setLoading(true);
    try {
      await api.post("/admin/auth/change-password", { current_password: current, new_password: password });
      await refresh();
    } catch (err: any) {
      setError(apiErrorMessage(err, "No se pudo cambiar la contraseña."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      subtitle="Elegí tu contraseña"
      footer={
        <button type="button" onClick={logout} className="font-semibold text-primary hover:underline">
          Cerrar sesión
        </button>
      }
    >
      <p className="mb-1 truncate text-center text-sm font-medium text-ink" title={admin?.email}>
        {admin?.email}
      </p>
      <p className="mb-4 text-center text-sm text-muted">
        Ingresaste con una contraseña inicial que te dio un administrador. Para seguir, cambiala por una nueva que solo vos conozcas.
      </p>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <PasswordField
          label="Contraseña actual"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoFocus
          placeholder="La contraseña que te dieron"
        />
        <PasswordField
          label="Contraseña nueva"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Tu contraseña nueva"
          help="Mínimo 8 caracteres, con una mayúscula, una minúscula y un número."
        />
        <PasswordField
          label="Repetir contraseña"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repetí la contraseña"
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" className="w-full" disabled={loading || !current || !password}>
          {loading ? "Guardando…" : "Cambiar contraseña"}
        </Button>
      </form>
    </AuthLayout>
  );
}
