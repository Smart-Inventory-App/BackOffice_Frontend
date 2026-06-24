import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AppUser } from "@/lib/types";
import { Badge, Card, PageHeader, Spinner } from "@/components/ui";

export default function Users() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");

  const { data, isLoading } = useQuery({
    queryKey: ["users", search, status],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (status) params.status_filter = status;
      return (await api.get<AppUser[]>("/admin/users/", { params })).data;
    },
  });

  const toggle = useMutation({
    mutationFn: async (u: AppUser) =>
      (await api.patch(`/admin/users/${u.id}/status`, { is_active: !u.is_active })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div>
      <PageHeader title="Usuarios" subtitle="Monitoreo y habilitación de cuentas de la aplicación" />

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por email…"
          className="flex-1 rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          className="rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Deshabilitados</option>
        </select>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Nombre</th>
                <th className="px-5 py-3">Productos</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((u) => (
                <tr key={u.id} className="border-b border-line/60 last:border-0 hover:bg-canvas/60">
                  <td className="px-5 py-3 font-medium">
                    <Link to={`/usuarios/${u.id}`} className="text-primaryDark hover:underline">
                      {u.email ?? u.id}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "—"}
                  </td>
                  <td className="px-5 py-3">{u.product_count}</td>
                  <td className="px-5 py-3">
                    {u.is_active ? <Badge tone="ok">Activo</Badge> : <Badge tone="off">Deshabilitado</Badge>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => toggle.mutate(u)}
                      disabled={toggle.isPending}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                        u.is_active
                          ? "border border-danger/40 text-danger hover:bg-danger/10"
                          : "border border-primary/40 text-primaryDark hover:bg-primary/10"
                      }`}
                    >
                      {u.is_active ? "Deshabilitar" : "Habilitar"}
                    </button>
                  </td>
                </tr>
              ))}
              {data && data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted">
                    No se encontraron usuarios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
