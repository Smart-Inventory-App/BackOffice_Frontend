import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { LogIn, ShieldCheck, Trash2, ToggleLeft, PackagePlus, PackageCheck, UserPlus2, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { ActivityEntry, Paginated } from "@/lib/types";
import { Badge, Card, PageHeader, Spinner } from "@/components/ui";
import { PAGE_SIZE } from "@/lib/constants";
import Pagination from "@/components/Pagination";
import { formatDateTime } from "@/lib/format";

const KIND_LABELS: Record<ActivityEntry["kind"], string> = {
  status: "Habilitación",
  role: "Rol de admin",
  login: "Inicio de sesión",
  registered: "Usuario nuevo",
  product_created: "Producto cargado",
  product_updated: "Producto editado",
  product_deleted: "Producto eliminado",
};

const KIND_ICONS: Record<ActivityEntry["kind"], LucideIcon> = {
  status: ToggleLeft,
  role: ShieldCheck,
  login: LogIn,
  registered: UserPlus2,
  product_created: PackagePlus,
  product_updated: PackageCheck,
  product_deleted: Trash2,
};

const KIND_TONES: Record<ActivityEntry["kind"], "ok" | "off" | "warn" | "neutral"> = {
  status: "warn",
  role: "ok",
  login: "neutral",
  registered: "ok",
  product_created: "ok",
  product_updated: "neutral",
  product_deleted: "off",
};


export default function Auditoria() {
  const [kind, setKind] = useState<"" | ActivityEntry["kind"]>("");
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [kind]);

  const { data, isLoading } = useQuery({
    queryKey: ["activity", kind, page],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (kind) params.kind = kind;
      return (await api.get<Paginated<ActivityEntry>>("/admin/activity/", { params })).data;
    },
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Auditoría de Eventos"
        subtitle="Actividad de usuarios de la plataforma: altas, productos cargados/editados/eliminados, logins y cambios de rol desde la app y el dashboard."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          ["", "registered", "login", "product_created", "product_updated", "product_deleted", "status", "role"] as const
        ).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
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
        <Card className="p-0">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
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
