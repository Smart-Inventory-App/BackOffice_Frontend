import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Package, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import logo from "../../assets/logo.png";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/usuarios", label: "Usuarios", icon: Users },
  { to: "/productos", label: "Productos", icon: Package },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { admin, logout } = useAuth();
  const [showLogout, setShowLogout] = useState(false);

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-line bg-white p-5 md:flex">
        <div className="mb-8 flex flex-col items-center px-2 text-center">
          <img src={logo} alt="Smart Inventory" className="mb-2 h-14 w-auto object-contain" />
          <div className="text-xl font-bold">
            <span className="text-primary">Smart</span>
            <span className="text-primaryDark">Inventory</span>
          </div>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted">
            Backoffice
          </p>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = isActive(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted hover:bg-primary/10 hover:text-primaryDark"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 border-t border-line pt-4">
          <div className="px-2 pb-3 text-center">
            <p className="text-xs uppercase tracking-wide text-muted">Sesión</p>
            <p className="mt-1 truncate text-sm font-medium" title={admin?.email}>
              {admin?.email}
            </p>
            {admin?.full_name && (
              <p className="truncate text-xs text-muted" title={admin.full_name}>
                {admin.full_name}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowLogout(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/40 px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
          >
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* mobile top nav */}
      <div className="fixed inset-x-0 top-0 z-10 flex gap-2 border-b border-line bg-white px-3 py-2 md:hidden">
        {NAV.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className={`flex-1 rounded-full px-3 py-1.5 text-center text-xs font-medium ${
              isActive(to) ? "bg-primary text-white" : "bg-canvas text-muted"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <main className="flex-1 px-4 py-6 pt-16 md:ml-64 md:px-10 md:py-10 md:pt-10">
        {children}
      </main>

      {showLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Cerrar sesión</h3>
            <p className="mt-2 text-sm text-muted">¿Seguro que querés salir del backoffice?</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowLogout(false)}
                className="flex-1 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
              >
                Cancelar
              </button>
              <button
                onClick={logout}
                className="flex-1 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
