import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { History, ShieldOff } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { AppUser, Paginated } from "@/lib/types";
import { Badge, Card, PageHeader, Spinner } from "@/components/ui";
import { formatDateTime, truncate } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/constants";
import Pagination from "@/components/Pagination";
import AuditModal from "@/components/AuditModal";
import FilterDropdown from "@/components/FilterDropdown";
import { apiErrorMessage } from "@/lib/errors";

export default function Users() {
  const qc = useQueryClient();
  const { admin } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive" | "admin">("");
  const [page, setPage] = useState(0);
  const [toDisable, setToDisable] = useState<AppUser | null>(null);
  const [reason, setReason] = useState("");
  const [auditUser, setAuditUser] = useState<AppUser | null>(null);
  const [toRemoveAdmin, setToRemoveAdmin] = useState<AppUser | null>(null);
  const [removeAdminError, setRemoveAdminError] = useState<string | null>(null);

  useEffect(() => setPage(0), [search, status]);

  const { data, isLoading } = useQuery({
    queryKey: ["users", search, status, page],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (search) params.search = search;
      if (status) params.status_filter = status;
      return (await api.get<Paginated<AppUser>>("/admin/users/", { params })).data;
    },
    placeholderData: keepPreviousData,
  });

  const setStatusMutation = useMutation({
    mutationFn: async ({ user, isActive, reason }: { user: AppUser; isActive: boolean; reason?: string }) =>
      (await api.patch(`/admin/users/${user.id}/status`, { is_active: isActive, reason: reason ?? null })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setToDisable(null);
      setReason("");
    },
  });

  const removeAdminMutation = useMutation({
    mutationFn: async (user: AppUser) => (await api.delete(`/admin/users/${user.id}/admin`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setToRemoveAdmin(null);
      setRemoveAdminError(null);
    },
    onError: (err: any) => {
      setRemoveAdminError(apiErrorMessage(err, "No se pudo quitar el rol de administrador."));
    },
  });

  const onToggle = (u: AppUser) => {
    if (u.is_active) {
      setReason("");
      setToDisable(u); // deshabilitar → pedir motivo
    } else {
      setStatusMutation.mutate({ user: u, isActive: true }); // habilitar → directo
    }
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    // En pantallas anchas todo entra sin desplazar la página: solo se desplaza la lista, que ocupa el alto que queda (como en Productos)
    <div className="md:flex md:h-[calc(100vh-4.5rem)] md:flex-col">
      <PageHeader title="Usuarios de la Plataforma" subtitle="Monitoreo y habilitación de cuentas de la aplicación" />

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por mail o nombre de usuario…"
          className="h-10 min-w-0 flex-1 basis-60 rounded-xl border border-line bg-white px-4 text-sm outline-none focus:border-primary"
        />
        <div className="w-56">
          <FilterDropdown
            label="Estado"
            allLabel="Todos los usuarios"
            value={status}
            options={[
              { value: "active", label: "Habilitados" },
              { value: "inactive", label: "Deshabilitados" },
              { value: "admin", label: "Administradores" },
            ]}
            onChange={(v) => setStatus(v as "" | "active" | "inactive" | "admin")}
          />
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <Card className="flex min-h-0 flex-col p-0 md:flex-1">
          <div className="max-h-[60vh] min-h-0 overflow-auto md:max-h-none md:flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3 text-center">Nombre</th>
                  <th className="px-3 py-3 text-center">Usuario</th>
                  <th className="px-3 py-3 text-center">Productos</th>
                  <th className="px-3 py-3 text-center">Registrado</th>
                  <th className="px-3 py-3 text-center">Estado</th>
                  <th className="px-3 py-3 text-center">Acciones</th>
                  <th className="px-3 py-3 text-center">Auditoría</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id} className="border-b border-line/60 last:border-0 hover:bg-canvas/60">
                    <td className="px-3 py-3 font-medium">
                      <Link
                        to={`/usuarios/${u.id}`}
                        className="text-primaryDark hover:underline"
                        title={u.email ?? u.id}
                      >
                        {truncate(u.email ?? u.id)}
                      </Link>
                      {u.is_admin && (
                        <span className="ml-2 inline-block">
                          <Badge tone="ok">Admin</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-muted" title={[u.first_name, u.last_name].filter(Boolean).join(" ")}>
                      {truncate([u.first_name, u.last_name].filter(Boolean).join(" ") || "")}
                    </td>
                    <td className="px-3 py-3 text-center text-muted" title={u.username ?? ""}>
                      {truncate(u.username)}
                    </td>
                    <td className="px-3 py-3 text-center">{u.product_count}</td>
                    <td className="px-3 py-3 text-center text-muted">
                      {formatDateTime(u.created_at)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {u.is_active ? <Badge tone="ok">Activo</Badge> : <Badge tone="off">Deshabilitado</Badge>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => onToggle(u)}
                          disabled={setStatusMutation.isPending}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                            u.is_active
                              ? "border border-danger/40 text-danger hover:bg-danger/10"
                              : "border border-primary/40 text-primaryDark hover:bg-primary/10"
                          }`}
                        >
                          {u.is_active ? "Deshabilitar" : "Habilitar"}
                        </button>
                        {u.is_admin && u.email !== admin?.email && (
                          <button
                            onClick={() => { setRemoveAdminError(null); setToRemoveAdmin(u); }}
                            title="Quitar rol de administrador"
                            className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-canvas hover:text-danger"
                          >
                            <ShieldOff size={14} /> Quitar admin
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => setAuditUser(u)}
                        title="Ver registro de auditoría"
                        className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-canvas hover:text-primaryDark"
                      >
                        <History size={14} /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-muted">
                      No se encontraron usuarios.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </Card>
      )}

      {toDisable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-lift">
            <h3 className="text-lg font-semibold">Deshabilitar usuario</h3>
            <p className="mt-1 text-sm text-muted" title={toDisable.email ?? toDisable.id}>
              {truncate(toDisable.email ?? toDisable.id)}
            </p>
            <label className="mb-1 mt-4 block text-sm font-medium text-ink">Motivo (opcional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Ej: actividad sospechosa, cuenta duplicada, etc."
              className="w-full resize-none rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setToDisable(null); setReason(""); }}
                className="flex-1 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
              >
                Cancelar
              </button>
              <button
                onClick={() => setStatusMutation.mutate({ user: toDisable, isActive: false, reason })}
                disabled={setStatusMutation.isPending}
                className="flex-1 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {setStatusMutation.isPending ? "Deshabilitando…" : "Deshabilitar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toRemoveAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-lift">
            <h3 className="text-lg font-semibold">Quitar administrador</h3>
            <p className="mt-2 text-sm text-muted">
              ¿Seguro que querés quitarle el rol de administrador a{" "}
              <span className="font-medium text-ink" title={toRemoveAdmin.email ?? toRemoveAdmin.id}>
                {truncate(toRemoveAdmin.email ?? toRemoveAdmin.id)}
              </span>
              ? Va a seguir teniendo su cuenta de usuario normal.
            </p>
            {removeAdminError && (
              <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
                {removeAdminError}
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setToRemoveAdmin(null); setRemoveAdminError(null); }}
                className="flex-1 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
              >
                Cancelar
              </button>
              <button
                onClick={() => removeAdminMutation.mutate(toRemoveAdmin)}
                disabled={removeAdminMutation.isPending}
                className="flex-1 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {removeAdminMutation.isPending ? "Quitando…" : "Quitar admin"}
              </button>
            </div>
          </div>
        </div>
      )}

      {auditUser && (
        <AuditModal
          userId={auditUser.id}
          userEmail={auditUser.email}
          onClose={() => setAuditUser(null)}
        />
      )}
    </div>
  );
}
