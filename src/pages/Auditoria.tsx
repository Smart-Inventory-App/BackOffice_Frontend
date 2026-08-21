import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { LogIn, ShieldCheck, Trash2, ToggleLeft, PackagePlus, PackageCheck, UserPlus2 } from "lucide-react";
import { api } from "@/lib/api";
import type { ActivityEntry, Paginated } from "@/lib/types";
import { Badge, Card, PageHeader, Spinner } from "@/components/ui";
import { PAGE_SIZE } from "@/lib/constants";
import Pagination from "@/components/Pagination";

const KIND_LABELS: Record<ActivityEntry["kind"], string> = {
  status: "Habilitación",
  role: "Rol de admin",
  login: "Inicio de sesión",
  registered: "Usuario nuevo",
  product_created: "Producto cargado",
  product_updated: "Producto editado",
  product_deleted: "Producto eliminado",
};

function KindIcon({ kind }: { kind: ActivityEntry["kind"] }) {
  switch (kind) {
    case "login":
      return <LogIn size={14} />;
    case "role":
      return <ShieldCheck size={14} />;
    case "registered":
      return <UserPlus2 size={14} />;
    case "product_created":
      return <PackagePlus size={14} />;
    case "product_updated":
      return <PackageCheck size={14} />;
    case "product_deleted":
      return <Trash2 size={14} />;
    default:
      return <ToggleLeft size={14} />;
  }
}

function kindTone(kind: ActivityEntry["kind"]): "ok" | "off" | "warn" | "neutral" {
  if (kind === "product_deleted") return "off";
  if (kind === "role" || kind === "registered" || kind === "product_created") return "ok";
  if (kind === "login" || kind === "product_updated") return "neutral";
  return "warn";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
        title="Auditoría"
        subtitle="Actividad de usuarios: altas, productos cargados/editados/eliminados, logins y cambios de rol — desde la app y desde el backoffice"
      />

      <p className="mb-4 text-sm text-muted">
        Los productos y logins se registran desde que se activó este panel — no hay historial de
        antes de eso. Las altas de usuario sí se completan con la fecha real de registro, aunque
        se hayan dado antes.
      </p>

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
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">Evento</th>
                  <th className="px-5 py-3">Detalle</th>
                  <th className="px-5 py-3 text-center">Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} className="border-b border-line/60 last:border-0 hover:bg-canvas/60">
                    <td className="px-5 py-3">
                      <Badge tone={kindTone(e.kind)}>
                        <span className="inline-flex items-center gap-1">
                          <KindIcon kind={e.kind} /> {KIND_LABELS[e.kind]}
                        </span>
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-ink">{e.description}</td>
                    <td className="px-5 py-3 text-center text-muted whitespace-nowrap">
                      {formatDateTime(e.created_at)}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-10 text-center text-muted">
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
