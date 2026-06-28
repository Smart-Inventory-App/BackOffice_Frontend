import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import type { AuditEntry } from "@/lib/types";
import { Badge, Spinner } from "@/components/ui";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuditModal({
  userId,
  userEmail,
  onClose,
}: {
  userId: string;
  userEmail: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit", userId],
    queryFn: async () => (await api.get<AuditEntry[]>(`/admin/users/${userId}/audit`)).data,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">Registro de auditoría</h3>
            <p className="mt-0.5 truncate text-sm text-muted" title={userEmail ?? userId}>
              {userEmail ?? userId}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-canvas">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto">
          {isLoading ? (
            <Spinner />
          ) : isError ? (
            <p className="py-8 text-center text-sm text-danger">No se pudo cargar la auditoría.</p>
          ) : !data || data.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              Este usuario no tiene cambios de estado registrados.
            </p>
          ) : (
            <ul className="space-y-3">
              {data.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between">
                    {entry.is_active ? (
                      <Badge tone="ok">Habilitado</Badge>
                    ) : (
                      <Badge tone="off">Deshabilitado</Badge>
                    )}
                    <span className="text-xs text-muted">{formatDateTime(entry.created_at)}</span>
                  </div>
                  {entry.reason && (
                    <p className="mt-2 text-sm text-ink">
                      <span className="font-medium">Motivo:</span> {entry.reason}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted">Por: {entry.changed_by}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
