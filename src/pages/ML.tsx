import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, CheckCircle, XCircle, RefreshCw, Zap, BarChart2, BellRing } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { api } from "@/lib/api";
import { Card, PageHeader, Spinner } from "@/components/ui";

type ModelType = "gbm" | "xgboost" | "lightgbm" | "svr";
type DataSource = "real" | "test";

interface ModelVersion {
  id: string;
  model_type?: ModelType;
  data_source?: DataSource;
  trained_at: string;
  mae: number;
  mape: number;
  n_samples: number;
  n_products: number;
  status: "active" | "inactive" | "rejected";
  model_file: string;
}

interface FeatureImportancesResponse {
  version_id: string;
  model_type: ModelType;
  feature_importances: Record<string, number>;
}

const MODEL_OPTIONS: { value: ModelType; label: string; description: string }[] = [
  { value: "gbm", label: "GBM", description: "Gradient Boosting (sklearn)" },
  { value: "xgboost", label: "XGBoost", description: "Extreme Gradient Boosting" },
  { value: "lightgbm", label: "LightGBM", description: "Light Gradient Boosting" },
  { value: "svr", label: "SVR", description: "Support Vector Regression" },
];

const DATA_SOURCE_OPTIONS: { value: DataSource; label: string; description: string }[] = [
  { value: "real", label: "Datos reales", description: "Eventos de consumo de los usuarios en producción" },
  { value: "test", label: "Dataset de prueba", description: "Dataset sintético para evaluar el modelo de forma reproducible" },
];

function ModelTypeBadge({ modelType }: { modelType?: ModelType }) {
  const colors: Record<ModelType, string> = {
    gbm: "bg-blue-100 text-blue-700",
    xgboost: "bg-orange-100 text-orange-700",
    lightgbm: "bg-purple-100 text-purple-700",
    svr: "bg-gray-100 text-gray-700",
  };
  const type = modelType ?? "gbm";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[type]}`}>
      {type.toUpperCase()}
    </span>
  );
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

// Paleta degradada para las barras (de más a menos importante)
const BAR_COLORS = [
  "#0ea5e9", "#38bdf8", "#7dd3fc", "#bae6fd",
  "#a5f3fc", "#67e8f9", "#22d3ee", "#06b6d4",
];

function FeatureImportancesChart({ versionId }: { versionId: string }) {
  const { data, isLoading, isError } = useQuery<FeatureImportancesResponse>({
    queryKey: ["feature-importances", versionId],
    queryFn: async () =>
      (await api.get(`/admin/ml/models/${versionId}/feature-importances`)).data,
  });

  if (isLoading)
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );

  if (isError)
    return (
      <p className="py-4 text-center text-sm text-red-500">
        Error al cargar importancias.
      </p>
    );

  const importances = data?.feature_importances ?? {};
  const entries = Object.entries(importances);

  if (entries.length === 0)
    return (
      <p className="py-4 text-center text-sm text-gray-400">
        Este modelo no soporta importancia de features (SVR).
      </p>
    );

  // Recharts espera un array de objetos; las barras son horizontales
  const chartData = entries.map(([name, value]) => ({ name, value }));

  return (
    <div className="mt-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
        Importancia de features — {versionId}{" "}
        <ModelTypeBadge modelType={data?.model_type} />
      </p>
      <ResponsiveContainer width="100%" height={chartData.length * 32 + 20}>
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
        >
          <XAxis
            type="number"
            domain={[0, "dataMax"]}
            tickFormatter={(v) => v.toFixed(3)}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            formatter={(v: number) => [v.toFixed(5), "Importancia"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ML() {
  const qc = useQueryClient();
  const [selectedModel, setSelectedModel] = useState<ModelType>("gbm");
  const [dataSource, setDataSource] = useState<DataSource>("real");
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  const { data: versions = [], isLoading } = useQuery<ModelVersion[]>({
    queryKey: ["ml-models"],
    queryFn: async () => (await api.get("/admin/ml/models")).data,
  });

  // Las versiones viejas no guardaban model_type ni data_source; se asumen
  // GBM (igual que ModelTypeBadge) y entrenadas con datos reales.
  const visibleVersions = versions.filter(
    (v) =>
      (v.model_type ?? "gbm") === selectedModel &&
      (v.data_source ?? "real") === dataSource,
  );

  const trainMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post("/admin/ml/models/train", {
          model_type: selectedModel,
          data_source: dataSource,
        })
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ml-models"] }),
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/ml/models/${id}/activate`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ml-models"] }),
  });

  const trainResult = trainMutation.data as any;

  const runAllAlertsMutation = useMutation({
    mutationFn: async () => (await api.post("/admin/alerts/run")).data,
  });

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

      {/* Entrenar */}
      <Card className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <p className="font-semibold">Entrenar nuevo modelo</p>
            <p className="mb-4 text-sm text-gray-500">
              Toma todos los eventos de consumo, entrena el modelo seleccionado y evalúa MAE y
              MAPE. Si las métricas no pasan los umbrales, el modelo es rechazado.
            </p>

            {/* Selector de algoritmo */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                Algoritmo
              </p>
              <div className="flex flex-wrap gap-2">
                {MODEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedModel(opt.value)}
                    title={opt.description}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      selectedModel === opt.value
                        ? "border-primary bg-primary text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-primary hover:text-primary"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                {MODEL_OPTIONS.find((o) => o.value === selectedModel)?.description}
              </p>
            </div>

            {/* Fuente de datos */}
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                Fuente de datos
              </p>
              <div className="flex flex-wrap gap-2">
                {DATA_SOURCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDataSource(opt.value)}
                    title={opt.description}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      dataSource === opt.value
                        ? "border-primary bg-primary text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-primary hover:text-primary"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                {DATA_SOURCE_OPTIONS.find((o) => o.value === dataSource)?.description}
              </p>
            </div>
          </div>

          <button
            onClick={() => trainMutation.mutate()}
            disabled={trainMutation.isPending}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primaryDark disabled:opacity-50"
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
                Modelo <strong>{trainResult.version?.id}</strong> (
                {trainResult.model_type?.toUpperCase() ?? "GBM"}) guardado — MAE:{" "}
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

      {/* Lanzar predicciones */}
      <Card className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Lanzar predicciones a usuarios</p>
            <p className="text-sm text-gray-500">
              Ejecuta el chequeo de alertas ML para todos los usuarios de forma inmediata,
              ignorando la hora configurada.
            </p>
          </div>
          <button
            onClick={() => runAllAlertsMutation.mutate()}
            disabled={runAllAlertsMutation.isPending}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primaryDark disabled:opacity-50"
          >
            {runAllAlertsMutation.isPending
              ? <RefreshCw size={16} className="animate-spin" />
              : <BellRing size={16} />}
            {runAllAlertsMutation.isPending ? "Enviando…" : "Lanzar a todos"}
          </button>
        </div>

        {runAllAlertsMutation.isSuccess && (
          <div className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">
            ✓ {(runAllAlertsMutation.data as any).alerts_sent} alertas enviadas
            a {(runAllAlertsMutation.data as any).users_processed} usuario
            {(runAllAlertsMutation.data as any).users_processed !== 1 ? "s" : ""}
          </div>
        )}
        {runAllAlertsMutation.isError && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
            {(runAllAlertsMutation.error as any)?.response?.data?.detail ?? "Error al lanzar alertas"}
          </div>
        )}
      </Card>

      {/* Tabla de versiones */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="font-semibold">Versiones del modelo</h2>
          <ModelTypeBadge modelType={selectedModel} />
          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {DATA_SOURCE_OPTIONS.find((o) => o.value === dataSource)?.label}
          </span>
          <span className="text-sm text-gray-400">
            {visibleVersions.length} de {versions.length}
          </span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : visibleVersions.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            {versions.length === 0
              ? "Aún no hay modelos entrenados."
              : `No hay versiones de ${selectedModel.toUpperCase()} entrenadas con ` +
                `${DATA_SOURCE_OPTIONS.find((o) => o.value === dataSource)?.label.toLowerCase()}.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pr-4">Versión</th>
                  <th className="pb-2 pr-4">Modelo</th>
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
                {[...visibleVersions].reverse().map((v) => (
                  <>
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-mono font-semibold">{v.id}</td>
                      <td className="py-3 pr-4">
                        <ModelTypeBadge modelType={v.model_type} />
                      </td>
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
                        <div className="flex items-center gap-2">
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
                          <button
                            onClick={() =>
                              setExpandedVersion(expandedVersion === v.id ? null : v.id)
                            }
                            title="Ver importancia de features"
                            className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                              expandedVersion === v.id
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-gray-200 text-gray-500 hover:border-primary hover:text-primary"
                            }`}
                          >
                            <BarChart2 size={12} />
                            Features
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Fila expandible con el gráfico */}
                    {expandedVersion === v.id && (
                      <tr key={`${v.id}-chart`}>
                        <td colSpan={9} className="bg-gray-50 px-4 pb-4">
                          <FeatureImportancesChart versionId={v.id} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
