import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, PageHeader } from "@/components/ui";
import type { MyProfile } from "@/lib/types";
import { apiErrorMessage } from "@/lib/errors";

export default function Perfil() {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => (await api.get<MyProfile>("/me/profile")).data,
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [stockMinimo, setStockMinimo] = useState("");
  const [diasAlerta, setDiasAlerta] = useState("");
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setUsername(profile.username ?? "");
    setStockMinimo(String(profile.stock_minimo));
    setDiasAlerta(String(profile.dias_alerta_vencimiento));
  }, [profile]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put<MyProfile>("/me/profile", {
          first_name: firstName || null,
          last_name: lastName || null,
          username: username || null,
          stock_minimo: Number(stockMinimo),
          dias_alerta_vencimiento: Number(diasAlerta),
        })
      ).data,
    onSuccess: (data) => {
      qc.setQueryData(["my-profile"], data);
      qc.invalidateQueries({ queryKey: ["my-stats"] });
      qc.invalidateQueries({ queryKey: ["alertas-bajo-stock"] });
      qc.invalidateQueries({ queryKey: ["alertas-por-vencer"] });
      qc.invalidateQueries({ queryKey: ["alertas-vencidos"] });
      setOkMessage("Guardado.");
      setError(null);
    },
    onError: (err: any) => {
      setError(apiErrorMessage(err, "No se pudo guardar."));
      setOkMessage(null);
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setOkMessage(null);
    save.mutate();
  };

  if (isLoading) return null;

  return (
    <div>
      <PageHeader title="Mi perfil" subtitle="Tus datos y reglas de alerta de stock y vencimiento" />

      <Card className="max-w-lg">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Email</label>
            <input
              value={profile?.email ?? ""}
              disabled
              className="w-full rounded-xl border border-line bg-canvas px-4 py-2 text-sm text-muted"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Nombre</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Apellido</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Usuario</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Reglas de alerta
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Stock mínimo</label>
                <input
                  type="number"
                  min={1}
                  value={stockMinimo}
                  onChange={(e) => setStockMinimo(e.target.value)}
                  className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                />
                <p className="mt-1 text-xs text-muted">Debajo de esto, se avisa "bajo stock".</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Días de anticipación</label>
                <input
                  type="number"
                  min={1}
                  value={diasAlerta}
                  onChange={(e) => setDiasAlerta(e.target.value)}
                  className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                />
                <p className="mt-1 text-xs text-muted">Con cuántos días de anticipación avisar un vencimiento.</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
              {error}
            </div>
          )}
          {okMessage && (
            <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primaryDark">
              {okMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={save.isPending}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {save.isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </form>
      </Card>
    </div>
  );
}
