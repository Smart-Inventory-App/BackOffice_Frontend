import { useEffect, useState } from "react";
import { X, Pencil, Trash2, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import type { ConsumptionEvent, MyProduct } from "@/lib/types";
import { apiErrorMessage } from "@/lib/errors";

interface Props {
  product: MyProduct | null;
  onClose: () => void;
  onChanged: () => void;
}

const motivoLabel = (type: ConsumptionEvent["event_type"]) => {
  if (type === "restocked") return "Entrada";
  if (type === "expired") return "Vencido";
  if (type === "sold") return "Vendido";
  if (type === "rented") return "Alquilado";
  return "Consumido";
};

export default function HistorialModal({ product, onClose, onChanged }: Props) {
  const [events, setEvents] = useState<ConsumptionEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editMotivo, setEditMotivo] = useState<ConsumptionEvent["event_type"]>("consumed");
  const [editNote, setEditNote] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<ConsumptionEvent | null>(null);

  const load = () => {
    if (!product) return;
    setLoading(true);
    setLoadError(null);
    api
      .get<ConsumptionEvent[]>(`/me/products/${product.id}/consumption`)
      .then(({ data }) => setEvents([...data].reverse()))
      .catch(() => setLoadError("No se pudo cargar el historial"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (product) {
      load();
      setEditingId(null);
      setRowError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  if (!product) return null;

  const startEdit = (event: ConsumptionEvent) => {
    setEditingId(event.id);
    setEditQuantity(String(event.quantity));
    setEditMotivo(event.event_type);
    setEditNote("");
    setRowError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setRowError(null);
  };

  const saveEdit = async (event: ConsumptionEvent) => {
    const n = Number(editQuantity);
    if (!editQuantity || isNaN(n) || n <= 0) return;
    setSaving(true);
    setRowError(null);
    try {
      await api.put(`/me/products/${product.id}/events/${event.id}`, {
        quantity: n,
        event_type: editMotivo,
        note: editNote || undefined,
      });
      setEditingId(null);
      load();
      onChanged();
    } catch (err: any) {
      setRowError(apiErrorMessage(err, "No se pudo corregir el registro"));
    } finally {
      setSaving(false);
    }
  };

  // La confirmación es un diálogo propio: confirm() puede estar bloqueado por el navegador y entonces no pasa nada.
  const deleteEvent = (event: ConsumptionEvent) => setEventToDelete(event);

  const confirmDeleteEvent = async () => {
    const event = eventToDelete;
    setEventToDelete(null);
    if (!event) return;
    setRowError(null);
    try {
      await api.delete(`/me/products/${product.id}/events/${event.id}`);
      load();
      onChanged();
    } catch (err: any) {
      setRowError(apiErrorMessage(err, "No se pudo borrar el registro"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Historial de consumo</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">{product.nombre}</p>

        {loadError && (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
            {loadError}
          </div>
        )}
        {rowError && (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
            {rowError}
          </div>
        )}

        <div className="mt-4 max-h-[50vh] overflow-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted">Cargando…</p>
          ) : events.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Todavía no hay movimientos para este producto</p>
          ) : (
            <div className="divide-y divide-line">
              {events.map((event) => {
                const isEditing = editingId === event.id;
                return (
                  <div key={event.id} className="flex items-center justify-between gap-3 py-3">
                    {isEditing ? (
                      <div className="flex-1 space-y-2">
                        <input
                          type="number"
                          min={1}
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                          className="w-full rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:border-primary"
                        />
                        <div className="flex gap-2">
                          {(["consumed", "expired", "sold", "rented", "restocked"] as const).map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setEditMotivo(type)}
                              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                editMotivo === type
                                  ? "border-primary bg-primary text-white"
                                  : "border-line bg-white text-muted"
                              }`}
                            >
                              {motivoLabel(type)}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder="Motivo (opcional)"
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          className="w-full rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:border-primary"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-canvas"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(event)}
                            disabled={saving}
                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <span className="min-w-[40px] text-sm font-bold text-ink">
                            {event.event_type === "restocked" ? "+" : "-"}
                            {event.quantity}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              {event.reverses_event_id != null && <Undo2 size={12} className="text-muted" />}
                              <p className="text-sm font-medium text-ink">{motivoLabel(event.event_type)}</p>
                              {event.reversed && (
                                <span className="rounded-md bg-canvas px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                                  Corregido
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted">
                              {new Date(event.consumed_at).toLocaleString()}
                              {event.actor_email ? ` · ${event.actor_email}` : ""}
                            </p>
                            {event.note && <p className="text-xs italic text-muted">{event.note}</p>}
                          </div>
                        </div>
                        {event.reverses_event_id == null && !event.reversed && (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(event)}
                              className="rounded-lg p-1.5 text-primary hover:bg-canvas"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteEvent(event)}
                              className="rounded-lg p-1.5 text-danger hover:bg-canvas"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {eventToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div role="alertdialog" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Borrar registro</h3>
            <p className="mt-2 text-sm text-muted">
              <span className="block">¿Borrar este registro de consumo?</span>
              <span className="block">El stock se va a ajustar automáticamente.</span>
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setEventToDelete(null)}
                className="flex-1 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteEvent}
                className="flex-1 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
