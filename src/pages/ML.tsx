import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, CheckCircle, XCircle, RefreshCw, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { Card, PageHeader, Spinner } from "@/components/ui";

interface ModelVersion {
  id: string;
  trained_at: string;
  mae: number;
  mape: number;
  n_samples: number;
  n_products: number;
  status: "active" | "inactive" | "rejected";
  model_file: string;
}

function StatusBadge({ status }: { status: ModelVersion["status"] }) {
  if (status === "active")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle size={12} /> Activo
      </span>
    );
  if (status === "rejected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        <XCircle size={12} /> Rechazado
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
      Inactivo
    </span>
  );
}

function MapeBar({ mape }: { mape: number }) {
  const pct = Math.min(mape, 100);
  const color = mape <= 15 ? "bg-green-500" : mape <= 25 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm tabular-nums">{mape.toFixed(1)}%</span>
    </div>
  );
}

export default function ML() {
  const qc = useQueryClient();

  const { data: versions = [], isLoading } = useQuery<ModelVersion[]>({
    queryKey: ["ml-models"],
    queryFn: async () => (await api.get("/admin/ml/models")).data,
  });

  const trainMutation = useMutation({
    mutationFn: async () => (await api.post("/admin/ml/models/train")).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ml-models"] }),
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/ml/models/${id}/activate`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ml-models"] }),
  });

  const trainResult = trainMutation.data as any;

  return (
    <div>
      <PageHeader
        title="Machine Learning"
        subtitle="Versionado y métricas del modelo de predicción de consumo"
      />

      {/* Umbrales de aceptación */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "MAE máx", value: "2.0 u/sem", hint: "Mean Absolute Error" },
          { label: "MAPE óptimo", value: "≤ 15%", hint: "Mean Absolute Percentage Error" },
          { label: "MAPE máx", value: "25%", hint: "Umbral de producción" },
          { label: "Muestras mín", value: "5 productos", hint: "Para entrenar" },
        ].map((s) => (
          <Card key={s.label} className="text-center">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-xl font-bold text-primary">{s.value}</p>
            <p className="text-xs text-gray-400">{s.hint}</p>
          </Card>
        ))}
      </div>

      {/* Botón entrenar */}
      <Card className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Entrenar nuevo modelo</p>
            <p className="text-sm text-gray-500">
              Toma todos los eventos de consumo, entrena el GBM y evalúa MAE y MAPE.
              Si las métricas no pasan los umbrales, el modelo es rechazado.
            </p>
          </div>
          <button
            onClick={() => trainMutation.mutate()}
            disabled={trainMutation.isPending}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primaryDark disabled:opacity-50"
          >
            {trainMutation.isPending ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Brain size={16} />
            )}
            {trainMutation.isPending ? "Entrenando…" : "Iniciar entrenamiento"}
          </button>
        </div>

        {trainMutation.isSuccess && trainResult && (
          <div
            className={`mt-4 rounded-xl p-3 text-sm ${
              trainResult.status === "saved"
                ? "bg-green-50 text-green-800"
                : "bg-red-50 text-red-800"
            }`}
          >
            {trainResult.status === "saved" ? (
              <span>
                Modelo <strong>{trainResult.version?.id}</strong> guardado — MAE:{" "}
                {trainResult.version?.mae} u/sem · MAPE: {trainResult.version?.mape}%
              </span>
            ) : (
              <span>{trainResult.reason}</span>
            )}
          </div>
        )}

        {trainMutation.isError && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
            {(trainMutation.error as any)?.response?.data?.detail ?? "Error al entrenar"}
          </div>
        )}
      </Card>

      {/* Tabla de versiones */}
      <Card>
        <h2 className="mb-4 font-semibold">Versiones del modelo</h2>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : versions.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            Aún no hay modelos entrenados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pr-4">Versión</th>
                  <th className="pb-2 pr-4">Fecha</th>
                  <th className="pb-2 pr-4">MAE (u/sem)</th>
                  <th className="pb-2 pr-4">MAPE</th>
                  <th className="pb-2 pr-4">Muestras</th>
                  <th className="pb-2 pr-4">Productos</th>
                  <th className="pb-2 pr-4">Estado</th>
                  <th className="pb-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {[...versions].reverse().map((v) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-mono font-semibold">{v.id}</td>
                    <td className="py-3 pr-4 text-gray-500">
                      {new Date(v.trained_at).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      <span className={v.mae <= 2 ? "text-green-700" : "text-red-600"}>
                        {v.mae.toFixed(3)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <MapeBar mape={v.mape} />
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{v.n_samples}</td>
                    <td className="py-3 pr-4 tabular-nums">{v.n_products}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={v.status} />
                    </td>
                    <td className="py-3">
                      {v.status !== "active" && v.status !== "rejected" && (
                        <button
                          onClick={() => activateMutation.mutate(v.id)}
                          disabled={activateMutation.isPending}
                          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primaryDark disabled:opacity-50"
                        >
                          <Zap size={12} />
                          Activar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
