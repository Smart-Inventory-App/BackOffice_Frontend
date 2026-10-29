import { Fragment, useState } from "react";
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
import { apiErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";

type ModelType = "gbm" | "xgboost" | "lightgbm" | "svr";
type DataSource = "real" | "test";
type Segment = "individuo" | "comercio";

interface ModelVersion {
  id: string;
  model_type?: ModelType;
  data_source?: DataSource;
  segment?: Segment;
  trained_at: string;
  mae: number;
  mae_relative?: number;
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
  { value: "test", label: "Dataset de prueba", description: "Dataset simulado de escala comercial reproducible" },
];

const SEGMENT_OPTIONS: { value: Segment; label: string; description: string }[] = [
  { value: "individuo", label: "Individuos", description: "Consumo doméstico — se acepta con MAE ≤ 2 u/sem por producto" },
  { value: "comercio", label: "Comercios", description: "Escala comercial — se acepta por error relativo al volumen (≤ 25%)" },
];

/** Un grupo de botones para elegir una opción, con su título y, debajo, la descripción de la elegida. */
function OptionGroup<T extends string>({
  title,
  options,
  value,
  onChange,
  note,
  selectedClass = "border-primary bg-primary text-white",
  widthClass = "w-40",
}: {
  title: string;
  options: { value: T; label: string; description: string }[];
  value: T;
  onChange: (value: T) => void;
  note?: string;
  /** Los colores del botón elegido. */
  selectedClass?: string;
  /** El ancho de los botones del grupo: todos los de un mismo grupo miden lo mismo. */
  widthClass?: string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            title={opt.description}
            className={`${widthClass} rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              value === opt.value
                ? selectedClass
                : "border-gray-200 bg-white text-gray-600 hover:border-primary hover:text-primary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-gray-400">{note ?? options.find((o) => o.value === value)?.description}</p>
    </div>
  );
}

// «Activar» y «Features» miden lo mismo
const ACTION_BUTTON =
  "flex w-24 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors";

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

function PercentBar({ value }: { value: number }) {
  const pct = Math.min(value, 100);
  const color = value <= 15 ? "bg-green-500" : value <= 25 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm tabular-nums">{value.toFixed(1)}%</span>
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
  const [segment, setSegment] = useState<Segment>("individuo");
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  const testDatasetUnavailable = segment === "individuo" && dataSource === "test";

  const { data: versions = [], isLoading } = useQuery<ModelVersion[]>({
    queryKey: ["ml-models"],
    queryFn: async () => (await api.get("/admin/ml/models")).data,
  });

  const trainMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post("/admin/ml/models/train", {
          model_type: selectedModel,
          data_source: dataSource,
          segment,
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
          segment === "comercio"
            ? { label: "MAE relativo máx", value: "25%", hint: "Error ponderado por volumen (WAPE)" }
            : { label: "MAE máx", value: "2.0 u/sem", hint: "Error absoluto por producto" },
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
            {apiErrorMessage(runAllAlertsMutation.error, "Error al lanzar alertas")}
          </div>
        )}
      </Card>

      {/* Entrenar */}
      <Card className="mb-6">
        {/* El título y la descripción a la izquierda y el botón a su derecha; las opciones ocupan después todo el ancho */}
        <div data-testid="train-header" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Entrenar nuevo modelo</p>
            <p className="text-sm text-gray-500">
              Toma todos los eventos de consumo, entrena el modelo seleccionado y evalúa MAE y
              MAPE. Si las métricas no pasan los umbrales, el modelo es rechazado.
            </p>
          </div>
          <button
            onClick={() => trainMutation.mutate()}
            disabled={trainMutation.isPending || testDatasetUnavailable}
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

        {/* Segmento, algoritmo y fuente de datos: en una fila, separados por una línea gris tenue */}
        <div
          data-testid="train-options"
          className="grid grid-cols-1 divide-y divide-line/60 lg:grid-cols-3 lg:divide-x lg:divide-y-0"
        >
          <div className="pb-4 lg:pb-0 lg:pr-5">
            <OptionGroup
              title="Segmento"
              options={SEGMENT_OPTIONS}
              value={segment}
              onChange={setSegment}
              selectedClass="border-[#1B3A8F] bg-[#1B3A8F] text-white"
              widthClass="w-28"
            />
          </div>
          <div className="py-4 lg:px-5 lg:py-0">
            <OptionGroup title="Algoritmo" options={MODEL_OPTIONS} value={selectedModel} onChange={setSelectedModel} widthClass="w-24" />
          </div>
          <div className="pt-4 lg:pl-5 lg:pt-0">
            <OptionGroup
              title="Fuente de datos"
              options={DATA_SOURCE_OPTIONS}
              value={dataSource}
              onChange={setDataSource}
              note={
                testDatasetUnavailable
                  ? "El dataset de prueba es de escala comercial reproducible SOLO PARA COMERCIOS"
                  : undefined
              }
            />
          </div>
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
            {apiErrorMessage(trainMutation.error, "Error al entrenar")}
          </div>
        )}
      </Card>

      {/* Tabla de versiones: todas las que se generaron */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="font-semibold">Versiones del modelo</h2>
          <span className="text-sm text-gray-400" data-testid="versions-count">
            {versions.length} {versions.length === 1 ? "versión" : "versiones"}
          </span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : versions.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Aún no hay modelos entrenados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-center text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-gray-500">
                  <th className="px-3 pb-2">Versión</th>
                  <th className="px-3 pb-2">Fecha</th>
                  <th className="px-3 pb-2">Modelo</th>
                  <th className="px-3 pb-2">Segmento</th>
                  <th className="px-3 pb-2">Fuente de datos</th>
                  <th className="px-3 pb-2">Muestras</th>
                  <th className="px-3 pb-2">Productos</th>
                  <th className="px-3 pb-2">MAE (u/sem)</th>
                  <th className="px-3 pb-2">MAE rel.</th>
                  <th className="px-3 pb-2">MAPE</th>
                  <th className="px-3 pb-2">Estado</th>
                  <th className="px-3 pb-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {[...versions].reverse().map((v) => (
                  <Fragment key={v.id}>
                    <tr className="border-b last:border-0">
                      <td className="px-3 py-3 font-mono font-semibold">{v.id}</td>
                      <td className="px-3 py-3 text-gray-500">{formatDateTime(v.trained_at)}</td>
                      <td className="px-3 py-3">
                        <ModelTypeBadge modelType={v.model_type} />
                      </td>
                      <td className="px-3 py-3 text-gray-600">
                        {SEGMENT_OPTIONS.find((o) => o.value === (v.segment ?? "individuo"))?.label}
                      </td>
                      <td className="px-3 py-3 text-gray-600">
                        {DATA_SOURCE_OPTIONS.find((o) => o.value === (v.data_source ?? "real"))?.label}
                      </td>
                      <td className="px-3 py-3 tabular-nums">{v.n_samples}</td>
                      <td className="px-3 py-3 tabular-nums">{v.n_products}</td>
                      <td className="px-3 py-3 tabular-nums text-gray-500">{v.mae.toFixed(3)}</td>
                      <td className="px-3 py-3">
                        {v.mae_relative === undefined ? (
                          <span className="text-sm text-gray-300">—</span>
                        ) : (
                          <PercentBar value={v.mae_relative} />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <PercentBar value={v.mape} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={v.status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {v.status !== "active" && v.status !== "rejected" && (
                            <button
                              onClick={() => activateMutation.mutate(v.id)}
                              disabled={activateMutation.isPending}
                              className={`${ACTION_BUTTON} border-primary bg-primary text-white hover:bg-primaryDark disabled:opacity-50`}
                            >
                              <Zap size={12} />
                              Activar
                            </button>
                          )}
                          <button
                            onClick={() => setExpandedVersion(expandedVersion === v.id ? null : v.id)}
                            title="Ver importancia de features"
                            className={`${ACTION_BUTTON} ${
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
                      <tr>
                        <td colSpan={12} className="bg-gray-50 px-4 pb-4">
                          <FeatureImportancesChart versionId={v.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
