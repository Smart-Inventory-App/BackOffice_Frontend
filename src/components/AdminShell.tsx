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
import type { AlertSummary, AppUser, Paginated } from "@/lib/types";
import { truncate } from "@/lib/format";
import logo from "../../assets/brand/logo_con_texto/logo_horizontal_color.png";
import { apiErrorMessage } from "@/lib/errors";

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
  { to: "/", label: "Inicio", icon: Home },
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
  const [adminSearch, setAdminSearch] = useState("");
  const [adminResults, setAdminResults] = useState<AppUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [addOk, setAddOk] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
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

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  const resetAddForm = () => {
    setAdminSearch("");
    setAdminResults([]);
    setSelectedUser(null);
    setAddError(null);
    setAddOk(null);
  };

  useEffect(() => {
    const q = adminSearch.trim();
    if (selectedUser || q.length < 2) {
      setAdminResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      api
        .get<Paginated<AppUser>>("/admin/users/", { params: { search: q, limit: 8 } })
        .then(({ data }) => setAdminResults(data.items.filter((u) => !u.is_admin)))
        .catch(() => setAdminResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [adminSearch, selectedUser]);

  const onGrantAdmin = async () => {
    if (!selectedUser) return;
    setAddError(null);
    setAdding(true);
    try {
      await api.post(`/admin/users/${selectedUser.id}/admin`);
      setAddOk(`${selectedUser.email} ya es administrador. Puede iniciar sesión con su contraseña actual.`);
      setSelectedUser(null);
      setAdminSearch("");
    } catch (err: any) {
      setAddError(apiErrorMessage(err, "No se pudo otorgar el rol de administrador."));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-line/70 bg-white p-5 md:flex">
        <div className="mb-7 flex flex-col items-center px-1 text-center">
          <img src={logo} alt="Smart Inventory" className="h-24 w-auto object-contain" />
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Backoffice</p>
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

        <div className="mt-4 border-t border-line/70 pt-4">
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
            {admin?.is_admin && viewAsUser && (
              <p className="mt-1 inline-block rounded-full bg-warn/25 px-2.5 py-0.5 text-xs font-medium text-warnInk">
                Viendo como usuario
              </p>
            )}
          </div>
          {admin?.is_admin && (
            <button
              onClick={() => setViewAsUser(!viewAsUser)}
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
          {effectiveIsAdmin && (
            <button
              onClick={() => { resetAddForm(); setShowAddAdmin(true); }}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 px-3 py-2 text-sm font-medium text-primaryDark transition hover:bg-primary/10"
            >
              <UserPlus size={16} /> Agregar administrador
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

      {showAddAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-lift">
            <h3 className="text-lg font-semibold">Agregar administrador</h3>
            <p className="mt-1 text-sm text-muted">
              Buscá un usuario ya registrado y hacelo administrador. Va a poder iniciar
              sesión con la contraseña que ya tiene — no hace falta que defina una nueva.
            </p>

            <div className="mt-4 space-y-3">
              {selectedUser ? (
                <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm">
                  <span className="truncate text-ink" title={selectedUser.email ?? selectedUser.id}>
                    {truncate(selectedUser.email ?? selectedUser.id)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedUser(null)}
                    className="ml-2 shrink-0 text-xs font-medium text-primaryDark hover:underline"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <label className="mb-1 block text-sm font-medium text-ink">Buscar usuario</label>
                  <input
                    type="text"
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    autoFocus
                    className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                    placeholder="Buscar por email…"
                  />
                  {adminSearch.trim().length >= 2 && (
                    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-line bg-white shadow-lg">
                      {searching ? (
                        <p className="px-4 py-2.5 text-sm text-muted">Buscando…</p>
                      ) : adminResults.length === 0 ? (
                        <p className="px-4 py-2.5 text-sm text-muted">Sin resultados.</p>
                      ) : (
                        adminResults.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => { setSelectedUser(u); setAddOk(null); setAddError(null); }}
                            className="block w-full truncate px-4 py-2.5 text-left text-sm hover:bg-canvas"
                            title={u.email ?? u.id}
                          >
                            {truncate(u.email ?? u.id)}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {addError && (
                <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
                  {addError}
                </div>
              )}
              {addOk && (
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primaryDark">
                  {addOk}
                </div>
              )}

              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddAdmin(false)}
                  className="flex-1 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={onGrantAdmin}
                  disabled={adding || !selectedUser}
                  className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {adding ? "Agregando…" : "Hacer administrador"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-lift">
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
