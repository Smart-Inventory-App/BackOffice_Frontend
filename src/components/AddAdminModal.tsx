import { useState, type FormEvent } from "react";
import { Check, Copy, Dices } from "lucide-react";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { generatePassword } from "@/lib/password";
import { validatePassword } from "@/components/AuthLayout";
import { Button, Field, Notice } from "@/components/ui";

interface AddedAdmin {
  email: string;
  account_created: boolean;
}

/**
 * «Agregar administrador»: se escribe el email de quien va a ser administrador (no se sugieren usuarios).
 *
 * - Si ese email ya tiene cuenta, pasa a ser administrador y sigue entrando con la contraseña que ya tenía.
 * - Si no tiene cuenta, el dashboard pide una **contraseña inicial** (se puede generar una): se crea la cuenta con ella, se
 *   le pasa a la persona y, cuando ingresa por primera vez, el dashboard le pide cambiarla por una propia.
 */
export default function AddAdminModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<(AddedAdmin & { password: string }) | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const wanted = email.trim();
    if (needsPassword) {
      const rule = validatePassword(password);
      if (rule) return setError(rule);
    }
    setAdding(true);
    try {
      const { data } = await api.post<AddedAdmin>("/admin/auth/admins", {
        email: wanted,
        ...(needsPassword ? { initial_password: password } : {}),
      });
      setAdded({ email: wanted, account_created: data.account_created, password });
    } catch (err: any) {
      if (err?.response?.status === 404 && !needsPassword) {
        // Sin cuenta: hace falta la contraseña inicial
        setNeedsPassword(true);
        setPassword(generatePassword());
      } else {
        setError(apiErrorMessage(err, "No se pudo agregar al administrador."));
      }
    } finally {
      setAdding(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(added?.password ?? "");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div data-testid="add-admin-backdrop" className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div role="dialog" aria-label="Agregar administrador" className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-lift">
        <h3 className="text-lg font-semibold">Agregar administrador</h3>

        {added ? (
          <div className="mt-3 space-y-4" data-testid="add-admin-done">
            {added.account_created ? (
              <>
                <Notice tone="ok">
                  Creamos la cuenta de <strong>{added.email}</strong> y ya es administrador.
                </Notice>
                <div>
                  <p className="text-sm text-muted">
                    Pasale esta contraseña inicial. Cuando ingrese por primera vez, el dashboard le va a pedir que la cambie por una nueva.
                  </p>
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2">
                    <code data-testid="add-admin-password" className="flex-1 select-all break-all font-mono text-sm text-ink">
                      {added.password}
                    </code>
                    <Button tone="outline" className="!px-3 !py-1.5" onClick={copy}>
                      {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiada" : "Copiar"}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <Notice tone="ok">
                <strong>{added.email}</strong> ya es administrador. Puede iniciar sesión con la contraseña que ya tiene.
              </Notice>
            )}
            <Button className="w-full" onClick={onClose}>
              Listo
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-3 space-y-4" noValidate>
            <p className="text-sm text-muted">
              Escribí el email de la persona que va a ser administradora. Si ya tiene cuenta, sigue entrando con su contraseña;
              si no, vas a poder definirle una contraseña inicial.
            </p>
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setNeedsPassword(false);
                setError(null);
              }}
              autoFocus
              autoComplete="off"
              placeholder="nuevo.admin@email.com"
            />

            {needsPassword && (
              <div className="space-y-3" data-testid="add-admin-initial">
                <Notice tone="info">
                  Ese email todavía no tiene cuenta. Definí una contraseña inicial para pasársela: al ingresar por primera vez le
                  va a pedir cambiarla.
                </Notice>
                <Field
                  label="Contraseña inicial"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  inputClassName="font-mono"
                  help="Mínimo 8 caracteres, con una mayúscula, una minúscula y un número."
                />
                <Button tone="outline" className="!px-3 !py-1.5" onClick={() => setPassword(generatePassword())}>
                  <Dices size={14} /> Generar otra
                </Button>
              </div>
            )}

            {error && <Notice tone="error">{error}</Notice>}

            <div className="flex gap-3">
              <Button tone="outline" className="flex-1" onClick={onClose}>
                Cerrar
              </Button>
              <Button type="submit" className="flex-1" disabled={adding || !email.trim()}>
                {adding ? "Agregando…" : needsPassword ? "Crear administrador" : "Hacer administrador"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
