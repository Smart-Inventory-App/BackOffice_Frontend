import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeftRight,
  Bell,
  Brain,
  ClipboardList,
  Eye,
  Home,
  LineChart,
  LogOut,
  Package,
  ScanLine,
  ShieldCheck,
  UserCircle,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { AlertSummary } from "@/lib/types";
import AddAdminModal from "@/components/AddAdminModal";
import logo from "../../assets/logo_sidebar.png";

const ADMIN_NAV = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/usuarios", label: "Usuarios", icon: Users },
  { to: "/productos", label: "Productos", icon: Package },
  { to: "/metricas", label: "Tendencias", icon: LineChart },
  { to: "/auditoria", label: "Auditoría", icon: ClipboardList },
  { to: "/ocr", label: "OCR", icon: ScanLine },
  { to: "/ml", label: "ML", icon: Brain },
];

const USER_NAV = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/productos", label: "Inventario", icon: Package },
  { to: "/cargar", label: "Flujo de producto", icon: ArrowLeftRight },
  { to: "/alertas", label: "Alertas", icon: Bell },
  { to: "/metricas", label: "Tendencias", icon: LineChart },
  { to: "/perfil", label: "Mi perfil", icon: UserCircle },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { admin, logout, viewAsUser, setViewAsUser, effectiveIsAdmin } = useAuth();
  const [showLogout, setShowLogout] = useState(false);
  const NAV = effectiveIsAdmin ? ADMIN_NAV : USER_NAV;

  const [showAddAdmin, setShowAddAdmin] = useState(false);
  // Cuántas alertas críticas tiene el usuario: se muestra junto a «Alertas» para verlas desde cualquier pantalla
  const [criticalAlerts, setCriticalAlerts] = useState(0);

  useEffect(() => {
    if (!admin || effectiveIsAdmin) return;
    let cancelled = false;
    Promise.resolve(api.get<AlertSummary>("/me/alerts/summary"))
      .then((res) => {
        if (!cancelled) setCriticalAlerts(res?.data?.critical ?? 0);
      })
      .catch(() => {
        if (!cancelled) setCriticalAlerts(0);
      });
    return () => {
      cancelled = true;
    };
  }, [admin, effectiveIsAdmin, pathname]);

  // Al cambiar de vista se recarga la página y se vuelve al dashboard de la vista elegida, estuviera donde estuviera
  const switchView = () => {
    setViewAsUser(!viewAsUser); // queda guardado: al recargar sigue la vista elegida
    window.location.assign("/");
  };

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-line/70 bg-white p-5 md:flex">
        <div className="mb-7 flex flex-col items-center px-1 text-center">
          <img src={logo} alt="Smart Inventory" className="mx-auto h-auto w-44 object-contain" />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = isActive(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-primary text-white shadow-card"
                    : "text-muted hover:bg-primary/10 hover:text-primaryDark"
                }`}
              >
                <Icon size={18} />
                <span className="flex-1">{label}</span>
                {to === "/alertas" && criticalAlerts > 0 && (
                  <span
                    data-testid="nav-alert-count"
                    className="rounded-full bg-critical px-2 py-0.5 text-[11px] font-bold leading-none text-white"
                  >
                    {criticalAlerts}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Por encima de la línea de la sesión, y solo para un administrador en su vista de administrador */}
        {admin?.is_admin && effectiveIsAdmin && (
          <button
            onClick={() => setShowAddAdmin(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 px-3 py-2 text-sm font-medium text-primaryDark transition hover:bg-primary/10"
          >
            <UserPlus size={16} /> Agregar administrador
          </button>
        )}

        <div className="mt-3 border-t border-line/70 pt-4">
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
            {admin?.is_admin && (
              <p
                data-testid="view-badge"
                className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  viewAsUser ? "bg-warn/25 text-warnInk" : "bg-primary/15 text-tealInk"
                }`}
              >
                {viewAsUser ? "Viendo como usuario" : "Viendo como administrador"}
              </p>
            )}
          </div>
          {admin?.is_admin && (
            <button
              onClick={switchView}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-primaryDark"
            >
              {viewAsUser ? (
                <>
                  <ShieldCheck size={16} /> Ver como admin
                </>
              ) : (
                <>
                  <Eye size={16} /> Ver como usuario
                </>
              )}
            </button>
          )}
          <button
            onClick={() => setShowLogout(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-critical/40 px-3 py-2 text-sm font-medium text-critical transition hover:bg-critical/10"
          >
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* mobile top nav */}
      <div className="fixed inset-x-0 top-0 z-10 flex gap-2 overflow-x-auto border-b border-line/70 bg-white px-3 py-2 md:hidden">
        {NAV.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className={`shrink-0 rounded-full px-3 py-1.5 text-center text-xs font-medium ${
              isActive(to) ? "bg-primary text-white" : "bg-canvas text-muted"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <main className="min-w-0 flex-1 px-4 py-6 pt-16 md:ml-64 md:px-10 md:py-9 md:pt-9">
        {children}
      </main>

      {showAddAdmin && admin?.is_admin && <AddAdminModal onClose={() => setShowAddAdmin(false)} />}

      {showLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-lift">
            <h3 className="text-lg font-semibold">Cerrar sesión</h3>
            <p className="mt-2 text-sm text-muted">¿Seguro que querés salir del dashboard?</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowLogout(false)}
                className="flex-1 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
              >
                Cancelar
              </button>
              <button
                onClick={logout}
                className="flex-1 rounded-xl bg-critical px-4 py-2 text-sm font-medium text-white hover:opacity-90"
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
