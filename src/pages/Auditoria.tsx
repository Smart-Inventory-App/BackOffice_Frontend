import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { LogIn, ShieldCheck, Trash2, ToggleLeft, PackagePlus, PackageMinus, PackageCheck, UserPlus2, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { ActivityEntry, Paginated } from "@/lib/types";
import { Badge, Card, Spinner } from "@/components/ui";
import FilterDropdown from "@/components/FilterDropdown";
import { PAGE_SIZE } from "@/lib/constants";
import Pagination from "@/components/Pagination";
import { formatDateTime } from "@/lib/format";

const KIND_LABELS: Record<ActivityEntry["kind"], string> = {
  status: "Habilitación",
  role: "Rol de admin",
  login: "Inicio de sesión",
  registered: "Usuario nuevo",
  product_created: "Entrada de producto",
  product_exit: "Salida de producto",
  product_updated: "Edición de producto",
  product_deleted: "Eliminación de producto",
};

const KIND_ICONS: Record<ActivityEntry["kind"], LucideIcon> = {
  status: ToggleLeft,
  role: ShieldCheck,
  login: LogIn,
  registered: UserPlus2,
  product_created: PackagePlus,
  product_exit: PackageMinus,
  product_updated: PackageCheck,
  product_deleted: Trash2,
};

const KIND_TONES: Record<ActivityEntry["kind"], "ok" | "off" | "warn" | "neutral"> = {
  status: "warn",
  role: "ok",
  login: "neutral",
  registered: "ok",
  product_created: "ok",
  product_exit: "warn",
  product_updated: "neutral",
  product_deleted: "off",
};


export default function Auditoria() {
  const [kind, setKind] = useState<"" | ActivityEntry["kind"]>("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [kind, userId]);

  // Los usuarios por los que se puede filtrar, como en Productos
  const { data: filterOptions } = useQuery({
    queryKey: ["activity-filter-options"],
    queryFn: async () =>
      (await api.get<{ users: { user_id: string; email: string | null }[] }>("/admin/activity/filters/options")).data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["activity", kind, userId, page],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (kind) params.kind = kind;
      if (userId) params.user_id = userId;
      return (await api.get<Paginated<ActivityEntry>>("/admin/activity/", { params })).data;
    },
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    // En pantallas anchas todo entra sin desplazar la página: solo se desplaza la lista, que ocupa el alto que queda (como en Productos)
    <div className="md:flex md:h-[calc(100vh-4.5rem)] md:flex-col">
      {/* El título y la descripción a la izquierda y, a la derecha, el filtro por usuario */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink">Auditoría de Eventos</h1>
          <p className="mt-1 text-sm text-muted">
            Actividad de usuarios de la plataforma: altas, productos cargados/editados/eliminados, logins y cambios de rol desde la app y el dashboard.
          </p>
        </div>
        <div data-testid="audit-user-filter" className="w-56 shrink-0">
          <FilterDropdown
            label="Usuario"
            allLabel="Todos los usuarios"
            value={userId}
            options={(filterOptions?.users ?? []).map((u) => ({ value: u.user_id, label: u.email ?? u.user_id }))}
            onChange={setUserId}
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {(
          ["", "registered", "login", "product_created", "product_exit", "product_updated", "product_deleted", "status", "role"] as const
        ).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              kind === k ? "bg-primary text-white" : "bg-canvas text-muted hover:text-primaryDark"
            }`}
          >
            {k === "" ? "Todos" : KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <Card className="flex min-h-0 flex-col p-0 md:flex-1">
          <div className="max-h-[60vh] min-h-0 overflow-auto md:max-h-none md:flex-1">
            <table className="w-full table-fixed text-sm">
              {/* Anchos fijos: la columna «Evento» mide lo mismo sea cual sea el tipo de evento que se filtre */}
              <colgroup>
                <col className="w-60" />
                <col className="w-64" />
                <col />
                <col className="w-48" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-line text-center text-xs uppercase tracking-wide text-muted whitespace-nowrap">
                  <th className="px-5 py-3">Evento</th>
                  <th className="px-5 py-3">Usuario</th>
                  <th className="px-5 py-3">Detalle</th>
                  <th className="px-5 py-3">Fecha del evento</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => {
                  const Icon = KIND_ICONS[e.kind];
                  return (
                  <tr key={e.id} className="border-b border-line/60 last:border-0 hover:bg-canvas/60">
                    <td className="px-5 py-3 text-center whitespace-nowrap">
                      <Badge tone={KIND_TONES[e.kind]}>
                        <span className="inline-flex items-center gap-1">
                          <Icon size={14} /> {KIND_LABELS[e.kind]}
                        </span>
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-center text-ink">{e.target_email ?? e.actor_email ?? "—"}</td>
                    <td className="px-5 py-3 text-left text-ink">{e.description}</td>
                    <td className="px-5 py-3 text-center text-muted whitespace-nowrap">
                      {formatDateTime(e.created_at)}
                    </td>
                  </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-muted">
                      No hay actividad registrada todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </Card>
      )}
    </div>
  );
}
