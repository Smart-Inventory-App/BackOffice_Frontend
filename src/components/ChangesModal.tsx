import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { StockChange } from "@/lib/types";
import { Button, EmptyState, Modal, Spinner } from "@/components/ui";
import ChangeRow from "@/components/ChangeRow";

const PAGE = 10;

/** «Historial de Cambios»: todos los cambios de stock, de a 10 con «Cargar más», como en la app. */
export default function ChangesModal({ onClose }: { onClose: () => void }) {
  const [changes, setChanges] = useState<StockChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const load = async (offset: number) => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get<StockChange[]>("/me/changes", { params: { limit: PAGE, offset } });
      setChanges((current) => (offset === 0 ? data : [...current, ...data]));
      setHasMore(data.length === PAGE);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(0);
  }, []);

  return (
    <Modal title="Historial de Cambios" onClose={onClose} testId="changes-modal" width="max-w-xl">
      {changes.length === 0 && loading ? (
        <Spinner />
      ) : changes.length === 0 && !error ? (
        <EmptyState>Todavía no hay cambios de stock.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {changes.map((change) => (
            <ChangeRow key={change.id} change={change} />
          ))}
        </ul>
      )}
      {error && <p className="py-4 text-center text-sm text-danger">No se pudieron cargar los cambios.</p>}
      {hasMore && !loading && (
        <div className="mt-4 text-center">
          <Button tone="outline" onClick={() => load(changes.length)}>
            Cargar más
          </Button>
        </div>
      )}
      {loading && changes.length > 0 && <p className="mt-3 text-center text-sm text-muted">Cargando…</p>}
    </Modal>
  );
}
