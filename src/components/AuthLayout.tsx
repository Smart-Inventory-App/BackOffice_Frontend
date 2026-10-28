import type { ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import logo from "../../assets/logo.png";

/**
 * Marco de las pantallas de acceso (ingreso, registro, recuperar contraseña): el logo, «Smart Inventory» en dos colores
 * y la tarjeta con el formulario, como la pantalla de ingreso de la app.
 */
export default function AuthLayout({
  subtitle,
  children,
  footer,
}: {
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-white to-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <img src={logo} alt="Smart Inventory" className="mx-auto mb-3 h-24 w-24 object-contain" />
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
            <span className="block text-primary">Smart</span>
            <span className="block text-primaryDark">Inventory</span>
          </h1>
          {subtitle && <p className="mt-3 text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="rounded-3xl border border-line/60 bg-white p-7 shadow-card">{children}</div>
        {footer && <div className="mt-5 text-center text-sm">{footer}</div>}
      </div>
    </div>
  );
}

/** El ojo para mostrar u ocultar lo que se escribe en un campo de contraseña. */
export function PasswordEye({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"}
      onClick={onToggle}
      className="text-muted transition hover:text-primaryDark"
    >
      {shown ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}

/** Las reglas de una contraseña nueva, las mismas que valida el servicio de cuentas. */
export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (!/[A-Z]/.test(pw)) return "Debe incluir al menos una mayúscula.";
  if (!/[a-z]/.test(pw)) return "Debe incluir al menos una minúscula.";
  if (!/[0-9]/.test(pw)) return "Debe incluir al menos un número.";
  return null;
}
