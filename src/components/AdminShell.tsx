import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Package, LogOut, UserPlus, ArrowLeftRight, Eye, ShieldCheck, Bell, ClipboardList, UserCircle, Brain, LineChart, ScanLine } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import logo from "../../assets/logo.png";

const ADMIN_NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/usuarios", label: "Usuarios", icon: Users },
  { to: "/productos", label: "Productos", icon: Package },
  { to: "/auditoria", label: "Auditoría", icon: ClipboardList },
  { to: "/ocr", label: "OCR", icon: ScanLine },
  { to: "/ml", label: "ML", icon: Brain },
];

const USER_NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/productos", label: "Productos", icon: Package },
  { to: "/cargar", label: "Flujo de producto", icon: ArrowLeftRight },
  { to: "/metricas", label: "Métricas", icon: LineChart },
  { to: "/alertas", label: "Alertas", icon: Bell },
  { to: "/perfil", label: "Mi perfil", icon: UserCircle },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { admin, logout, viewAsUser, setViewAsUser, effectiveIsAdmin } = useAuth();
  const [showLogout, setShowLogout] = useState(false);
  const NAV = effectiveIsAdmin ? ADMIN_NAV : USER_NAV;

  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addOk, setAddOk] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  const resetAddForm = () => {
    setNewEmail("");
    setNewName("");
    setAddError(null);
    setAddOk(null);
  };

  const onAddAdmin = async (e: FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAddOk(null);
    setAdding(true);
    try {
      await api.post("/admin/auth/admins", { email: newEmail, full_name: newName || null });
      setAddOk("Administrador agregado. Definirá su contraseña al iniciar sesión por primera vez.");
      setNewEmail("");
      setNewName("");
    } catch (err: any) {
      setAddError(err?.response?.data?.detail ?? "No se pudo agregar el administrador.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-line bg-white p-5 md:flex">
        <div className="mb-8 flex flex-col items-center px-2 text-center">
          <img src={logo} alt="Smart Inventory" className="mb-2 h-28 w-auto object-contain" />
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
            {admin?.is_admin && viewAsUser && (
              <p className="mt-1 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
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

      <main className="min-w-0 flex-1 px-4 py-6 pt-16 md:ml-64 md:px-10 md:py-10 md:pt-10">
        {children}
      </main>

      {showAddAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Agregar administrador</h3>
            <p className="mt-1 text-sm text-muted">
              Ingresá el email y el nombre. El nuevo administrador definirá su contraseña
              al iniciar sesión por primera vez.
            </p>
            <form onSubmit={onAddAdmin} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                  placeholder="nuevo@admin.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Nombre</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                  placeholder="Nombre Apellido"
                />
              </div>

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
                  type="submit"
                  disabled={adding || !newEmail.trim()}
                  className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {adding ? "Agregando…" : "Agregar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
