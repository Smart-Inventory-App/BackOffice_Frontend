import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Camera, CheckCircle2, FileText, RotateCcw, Tag } from "lucide-react";
import { api } from "@/lib/api";
import { limpiarCodigo } from "@/lib/barcode";
import { Card } from "@/components/ui";
import { Picklist, addIfMissing } from "@/components/Picklist";
import ProductoExistente from "@/components/ExistingProduct";
import { BotonProcesar, ErrorScan, FotoInput, Progreso, detalle, unidades, useScan } from "@/components/scanTools";
import type {
  BulkCommitResult,
  BulkProductRow,
  ProductDraft,
  ProductMatch,
  ProductSuggestion,
  SalidaOCRResult,
  ScanResult,
} from "@/lib/types";
import { invalidateInventory } from "@/lib/queries";

/** El mismo motivo que asienta el backend para una salida por comprobante. */
const MOTIVO_COMPROBANTE = "Documento Comercial";

export type Prefill = {
  codigo_barras?: string;
  nombre?: string;
  marca?: string;
  categoria?: string;
  ubicacion?: string;
  vencimiento?: string;
  descripcion?: string;
};

/**
 * Lo que llega a la salida manual: el producto ya elegido (de una etiqueta o un código leídos) o, desde un renglón que no
 * se pudo identificar, el texto a buscar.
 */
export type SalidaPrefill = { busqueda?: string; nota?: string; producto?: ProductSuggestion };

type Opciones = { categorias: string[]; ubicaciones: string[]; marcas: string[] };

/**
 * Lo que cambia en otras pantallas cuando entra o sale stock.
 */
function refrescarInventario(qc: ReturnType<typeof useQueryClient>) {
  invalidateInventory(qc);
  qc.invalidateQueries({ queryKey: ["my-products-filter-options"] });
}

/* ── elegir a qué producto se refiere lo leído ──────────────────────────── */

function MatchPicker({
  draft,
  elegido,
  onElegir,
  contexto,
}: {
  draft: ProductDraft;
  elegido: number | null;
  onElegir: (match: ProductMatch | null) => void;
  contexto: "entrada" | "salida";
}) {
  if (draft.coincidencias.length === 0) {
    return (
      <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
        {contexto === "entrada" ? (
          <>
            No encontramos ningún producto tuyo parecido a{" "}
            <span className="font-medium text-ink">«{draft.texto_leido}»</span>. Revisá el nombre y
            se va a cargar como producto nuevo.
          </>
        ) : (
          <>
            No encontramos ningún producto tuyo parecido a{" "}
            <span className="font-medium text-ink">«{draft.texto_leido}»</span>, así que este
            renglón no se puede descargar.
          </>
        )}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {contexto === "entrada" ? "¿Es alguno de estos?" : "¿De cuál se descarga?"}
      </p>
      {draft.coincidencias.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onElegir(m)}
          className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left text-sm transition ${
            elegido === m.id
              ? "border-primary bg-primary/5"
              : "border-line hover:border-primary/50 hover:bg-canvas"
          }`}
        >
          <span>
            <span className="font-medium text-ink">{m.nombre}</span>
            {m.marca && <span className="text-muted"> · {m.marca}</span>}
            <span className="block text-xs text-muted">
              stock {m.stock}
              {m.vencimiento ? ` · vence ${m.vencimiento}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-xs text-muted">
            {m.por_codigo ? "por código" : `${Math.round(m.score * 100)} % parecido`}
          </span>
        </button>
      ))}
      {contexto === "entrada" && (
        <button
          type="button"
          onClick={() => onElegir(null)}
          className={`w-full rounded-xl border px-4 py-2 text-left text-sm transition ${
            elegido === null
              ? "border-primary bg-primary/5"
              : "border-line hover:border-primary/50 hover:bg-canvas"
          }`}
        >
          <span className="font-medium text-ink">Ninguno: es un producto nuevo</span>
        </button>
      )}
    </div>
  );
}

function Aviso({ resultado }: { resultado: ScanResult }) {
  if (!resultado.needs_review && resultado.advertencias.length === 0) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>
        La lectura salió con {Math.round(resultado.confianza * 100)} % de confianza: revisá los
        campos antes de confirmar.
      </span>
    </p>
  );
}

function Confirmado({ texto, onSeguir }: { texto: string; onSeguir: () => void }) {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primaryDark">
        <CheckCircle2 size={16} /> {texto}
      </p>
      <button
        type="button"
        onClick={onSeguir}
        className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
      >
        <RotateCcw size={14} /> Escanear otra foto
      </button>
    </div>
  );
}

/* ── entrada · etiqueta del producto (siempre un producto nuevo) ───────── */

type Borrador = { nombre: string; marca: string; vencimiento: string; codigo_barras: string; descripcion: string };

/**
 * Se escanea la etiqueta de un producto NUEVO: lo leído se muestra para corregirlo y, cuando la persona lo valida, pasa
 * todo al formulario de entrada del flujo de producto, donde se completa lo que falte (categoría, stock...) y se guarda.
 * Los productos que ya están cargados se buscan en «Producto existente».
 */
function EntradaEtiqueta({ irAManual }: { irAManual: (p: Prefill) => void }) {
  const etiqueta = useScan("product_label");
  const [foto, setFoto] = useState<File | null>(null);
  const [form, setForm] = useState<Borrador | null>(null);

  const resultado = etiqueta.resultado;
  // El borrador se arma una sola vez, cuando termina la lectura: a partir de ahí es de la persona y no se lo pisa.
  useEffect(() => {
    const draft = resultado?.draft;
    if (!draft || form) return;
    setForm({
      nombre: draft.nombre ?? "",
      marca: draft.marca ?? "",
      vencimiento: draft.vencimiento ?? "",
      codigo_barras: draft.codigo_barras ?? "",
      descripcion: draft.descripcion ?? "",
    });
  }, [resultado, form]);

  const reiniciar = () => {
    etiqueta.reiniciar();
    setFoto(null);
    setForm(null);
  };

  const set = (campo: keyof Borrador) => (e: { target: { value: string } }) =>
    setForm((f) => (f ? { ...f, [campo]: e.target.value } : f));

  return (
    <div className="space-y-4">
      {!form && (
        <>
          <div className="max-w-sm">
            <FotoInput label="Foto de la etiqueta del producto" hint="El envase o su etiqueta, de frente" file={foto} disabled={etiqueta.procesando} onChange={setFoto} />
          </div>
          <BotonProcesar onClick={() => foto && etiqueta.subir(foto)} disabled={!foto} procesando={etiqueta.procesando}>
            Leer etiqueta
          </BotonProcesar>
          <Progreso scan={etiqueta} etiqueta="Etiqueta" />
          <ErrorScan scan={etiqueta} />
        </>
      )}

      {form && resultado && (
        <div className="space-y-4">
          <Aviso resultado={resultado} />
          <p className="text-sm font-semibold text-ink">Revisá lo que se leyó</p>
          {resultado.draft?.texto_leido && <p className="text-xs text-muted">Texto leído: {resultado.draft.texto_leido}</p>}
          <div className="space-y-4 rounded-xl border border-line p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Nombre</label>
                <input placeholder="ej. Leche entera 1L" value={form.nombre} onChange={set("nombre")} className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Marca</label>
                <input placeholder="Opcional" value={form.marca} onChange={set("marca")} className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Fecha de vencimiento</label>
                <input type="date" value={form.vencimiento} onChange={set("vencimiento")} className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Código de barras</label>
                <input inputMode="numeric" placeholder="Opcional" value={form.codigo_barras} onChange={(e) => setForm((f) => (f ? { ...f, codigo_barras: e.target.value.replace(/\D/g, "").slice(0, 14) } : f))} className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Descripción</label>
              <textarea placeholder="Opcional" value={form.descripcion} onChange={set("descripcion")} rows={3} className="w-full resize-none rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="etiqueta-confirmar"
              onClick={() => irAManual({ ...form })}
              disabled={!form.nombre.trim()}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              Confirmar y pasar al formulario
            </button>
            <button type="button" onClick={reiniciar} className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas">
              Descartar y escanear otra
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── comprobante: renglones editables ───────────────────────────────────── */

type Renglon = {
  draft: ProductDraft;
  incluir: boolean;
  nombre: string;
  marca: string;
  categoria: string;
  cantidad: string;
  vencimiento: string;
  codigo_barras: string;
  elegido: number | null;
};

function aRenglon(draft: ProductDraft): Renglon {
  const match = draft.coincidencias.find((m) => m.id === draft.coincidencia_id) ?? null;
  return {
    draft,
    incluir: true,
    nombre: match?.nombre ?? draft.nombre ?? "",
    marca: match?.marca ?? "",
    categoria: match?.categoria ?? "",
    cantidad: String(draft.stock ?? 1),
    vencimiento: match?.vencimiento ?? "",
    codigo_barras: match?.codigo_barras ?? "",
    elegido: draft.coincidencia_id,
  };
}

function CabeceraComprobante({ resultado }: { resultado: ScanResult }) {
  const c = resultado.comprobante;
  if (!c) return null;
  return (
    <div className="rounded-xl border border-line p-4 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Comprobante</p>
      <p className="mt-1 font-medium text-ink">{c.comercio ?? "Comercio no reconocido"}</p>
      <p className="text-muted">
        {c.fecha_compra ? `Fecha ${c.fecha_compra}` : "Sin fecha"}
        {c.total !== null ? ` · total ${c.total}` : ""} · {resultado.items.length} renglones leídos
      </p>
    </div>
  );
}

/* ── entrada · comprobante ──────────────────────────────────────────────── */

function EntradaComprobante({ opciones, setOpciones }: { opciones: Opciones; setOpciones: (o: Opciones) => void }) {
  const qc = useQueryClient();
  const scan = useScan("receipt");
  const [foto, setFoto] = useState<File | null>(null);
  const [renglones, setRenglones] = useState<Renglon[] | null>(null);
  const [hecho, setHecho] = useState<BulkCommitResult | null>(null);

  useEffect(() => {
    if (scan.resultado && !renglones) setRenglones(scan.resultado.items.map(aRenglon));
  }, [scan.resultado, renglones]);

  const incluidos = (renglones ?? []).filter((r) => r.incluir && r.nombre && r.categoria);
  const sinCategoria = (renglones ?? []).filter((r) => r.incluir && r.nombre && !r.categoria).length;

  const confirmar = useMutation({
    mutationFn: async () => {
      const rows: BulkProductRow[] = incluidos.map((r, i) => ({
        row_number: i + 1,
        nombre: r.nombre,
        marca: r.marca || null,
        categoria: r.categoria,
        stock: Number(r.cantidad) || 1,
        vencimiento: r.vencimiento || null,
        codigo_barras: r.codigo_barras || null,
        descripcion: null,
        imagen_url: null,
        ubicacion: null,
        stock_minimo: null,
        dias_alerta_vencimiento: null,
      }));
      const { data } = await api.post<BulkCommitResult>("/me/products/bulk/commit", {
        rows,
        mode: "entrada",
        origen: MOTIVO_COMPROBANTE,
      });
      return data;
    },
    onSuccess: (data) => {
      refrescarInventario(qc);
      setHecho(data);
    },
  });

  const reiniciar = () => {
    scan.reiniciar();
    setFoto(null);
    setRenglones(null);
    setHecho(null);
    confirmar.reset();
  };

  const editar = (i: number, cambio: Partial<Renglon>) =>
    setRenglones((rs) => (rs ? rs.map((r, j) => (j === i ? { ...r, ...cambio } : r)) : rs));

  if (hecho) {
    return (
      <div className="space-y-3">
        <Confirmado
          texto={`${
            hecho.created === 1 ? "1 producto nuevo" : `${hecho.created} productos nuevos`
          } y ${
            hecho.merged === 1 ? "1 actualizado" : `${hecho.merged} actualizados`
          } desde el comprobante.${
            hecho.failed
              ? ` ${hecho.failed === 1 ? "1 renglón no se pudo cargar" : `${hecho.failed} renglones no se pudieron cargar`}.`
              : ""
          }`}
          onSeguir={reiniciar}
        />
        {hecho.errors.length > 0 && (
          <ul className="list-inside list-disc rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {hecho.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!renglones && (
        <>
          <div className="max-w-sm">
            <FotoInput
              label="Foto del ticket, remito o factura"
              hint="Entera y sin doblar. Es el documento que más tarda: cerca de un minuto"
              file={foto}
              disabled={scan.procesando}
              onChange={setFoto}
            />
          </div>
          <BotonProcesar
            onClick={() => foto && scan.subir(foto)}
            disabled={!foto}
            procesando={scan.procesando}
          >
            Leer comprobante
          </BotonProcesar>
          <Progreso scan={scan} etiqueta="Comprobante" />
          <ErrorScan scan={scan} />
        </>
      )}

      {renglones && scan.resultado && (
        <>
          <CabeceraComprobante resultado={scan.resultado} />
          {renglones.length === 0 && (
            <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
              No se reconoció ningún renglón en esta foto. Probá con una toma más nítida o cargá los
              productos a mano.
            </p>
          )}

          {renglones.map((r, i) => (
            <Card key={i} className={r.incluir ? "" : "opacity-50"}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Renglón leído
                  </p>
                  <p className="font-mono text-sm text-ink">«{r.draft.texto_leido}»</p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={r.incluir}
                    onChange={(e) => editar(i, { incluir: e.target.checked })}
                    className="h-4 w-4 accent-[var(--color-primary,#14b8a6)]"
                  />
                  Cargar
                </label>
              </div>

              <div className="mb-3">
                <MatchPicker
                  draft={r.draft}
                  elegido={r.elegido}
                  contexto="entrada"
                  onElegir={(m) =>
                    editar(i, {
                      elegido: m?.id ?? null,
                      ...(m
                        ? {
                            nombre: m.nombre,
                            marca: m.marca ?? "",
                            categoria: m.categoria ?? r.categoria,
                            codigo_barras: r.codigo_barras || m.codigo_barras || "",
                          }
                        : {}),
                    })
                  }
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Nombre</label>
                  <input
                    placeholder="ej. Leche entera 1L"
                    value={r.nombre}
                    onChange={(e) => editar(i, { nombre: e.target.value })}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <Picklist
                  label="Categoría"
                  addPlaceholder="Ej. Lácteos"
                  value={r.categoria}
                  options={opciones.categorias}
                  required
                  onChange={(v) => {
                    editar(i, { categoria: v });
                    setOpciones({ ...opciones, categorias: addIfMissing(opciones.categorias, v) });
                  }}
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Cantidad</label>
                  <input
                    placeholder="0"
                    type="number"
                    min={1}
                    value={r.cantidad}
                    onChange={(e) => editar(i, { cantidad: e.target.value })}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Vencimiento</label>
                  <input
                    type="date"
                    value={r.vencimiento}
                    onChange={(e) => editar(i, { vencimiento: e.target.value })}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Código de barras</label>
                  <input
                    inputMode="numeric"
                    value={r.codigo_barras}
                    onChange={(e) => editar(i, { codigo_barras: limpiarCodigo(e.target.value) })}
                    placeholder="Opcional"
                    className="w-full rounded-xl border border-line px-3 py-2 font-mono text-sm outline-none focus:border-primary"
                  />
                </div>
                <Picklist
                  label="Marca"
                  value={r.marca}
                  options={opciones.marcas}
                  emptyLabel="Sin marca"
                  addPlaceholder="Opcional"
                  onChange={(v) => {
                    editar(i, { marca: v });
                    setOpciones({ ...opciones, marcas: addIfMissing(opciones.marcas, v) });
                  }}
                />
              </div>
            </Card>
          ))}

          {sinCategoria > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              {sinCategoria === 1
                ? "Falta elegir la categoría de un renglón para poder cargarlo."
                : `Faltan las categorías de ${sinCategoria} renglones para poder cargarlos.`}
            </p>
          )}

          {confirmar.isError && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
              {detalle(confirmar.error, "No se pudo cargar el comprobante.")}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => confirmar.mutate()}
              disabled={confirmar.isPending || incluidos.length === 0}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {confirmar.isPending
                ? "Cargando…"
                : `Confirmar carga (${incluidos.length} ${incluidos.length === 1 ? "producto" : "productos"})`}
            </button>
            <button
              type="button"
              onClick={reiniciar}
              className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
            >
              Descartar y escanear otro
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── salida · comprobante ───────────────────────────────────────────────── */

function SalidaComprobante({ irASalidaManual }: { irASalidaManual: (p: SalidaPrefill) => void }) {
  const qc = useQueryClient();
  const scan = useScan("receipt");
  const [foto, setFoto] = useState<File | null>(null);
  const [renglones, setRenglones] = useState<Renglon[] | null>(null);
  const [hecho, setHecho] = useState<SalidaOCRResult | null>(null);

  useEffect(() => {
    if (scan.resultado && !renglones) setRenglones(scan.resultado.items.map(aRenglon));
  }, [scan.resultado, renglones]);

  // Sólo se puede descargar de un producto que existe: un renglón sin
  // coincidencia no tiene de dónde restar.
  const descargables = (renglones ?? []).filter((r) => r.incluir && r.elegido !== null);
  const sinIdentificar = (renglones ?? []).filter((r) => r.elegido === null).length;

  const confirmar = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<SalidaOCRResult>("/me/products/ocr/salida", {
        items: descargables.map((r) => ({
          product_id: r.elegido,
          quantity: Number(r.cantidad) || 1,
        })),
        comercio: scan.resultado?.comprobante?.comercio ?? null,
      });
      return data;
    },
    onSuccess: (data) => {
      refrescarInventario(qc);
      setHecho(data);
    },
  });

  const reiniciar = () => {
    scan.reiniciar();
    setFoto(null);
    setRenglones(null);
    setHecho(null);
    confirmar.reset();
  };

  const editar = (i: number, cambio: Partial<Renglon>) =>
    setRenglones((rs) => (rs ? rs.map((r, j) => (j === i ? { ...r, ...cambio } : r)) : rs));

  if (hecho) {
    return (
      <div className="space-y-3">
        <Confirmado
          texto={
            hecho.procesados === 1
              ? `Salió 1 producto por ${MOTIVO_COMPROBANTE}.`
              : `Salieron ${hecho.procesados} productos por ${MOTIVO_COMPROBANTE}.`
          }
          onSeguir={reiniciar}
        />
        {hecho.errores.length > 0 && (
          <ul className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {hecho.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!renglones && (
        <>
          <div className="max-w-sm">
            <FotoInput
              label="Foto del ticket, remito o factura"
              hint="Entera y sin doblar. Es el documento que más tarda: cerca de un minuto"
              file={foto}
              disabled={scan.procesando}
              onChange={setFoto}
            />
          </div>
          <BotonProcesar
            onClick={() => foto && scan.subir(foto)}
            disabled={!foto}
            procesando={scan.procesando}
          >
            Leer comprobante
          </BotonProcesar>
          <Progreso scan={scan} etiqueta="Comprobante" />
          <ErrorScan scan={scan} />
        </>
      )}

      {renglones && scan.resultado && (
        <>
          <CabeceraComprobante resultado={scan.resultado} />

          <p className="rounded-xl bg-canvas px-4 py-2.5 text-sm text-muted">
            El motivo de estas salidas queda asentado como{" "}
            <span className="font-medium text-ink">{MOTIVO_COMPROBANTE}</span>.
          </p>

          {sinIdentificar > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                No se pudo cargar {sinIdentificar}{" "}
                {sinIdentificar === 1 ? "producto" : "productos"}: no encontramos en tu inventario
                ningún producto con ese nombre. Podés cargar{" "}
                {sinIdentificar === 1 ? "esa salida" : "cada una"} a mano con el botón de su renglón.
              </span>
            </p>
          )}

          {renglones.map((r, i) => (
            <Card key={i} className={r.elegido === null ? "opacity-60" : ""}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Renglón leído
                  </p>
                  <p className="font-mono text-sm text-ink">«{r.draft.texto_leido}»</p>
                </div>
                {r.elegido !== null && (
                  <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={r.incluir}
                      onChange={(e) => editar(i, { incluir: e.target.checked })}
                      className="h-4 w-4"
                    />
                    Descargar
                  </label>
                )}
              </div>

              <MatchPicker
                draft={r.draft}
                elegido={r.elegido}
                contexto="salida"
                onElegir={(m) => editar(i, { elegido: m?.id ?? null, nombre: m?.nombre ?? r.nombre })}
              />

              {r.elegido === null && (
                <button
                  type="button"
                  onClick={() =>
                    irASalidaManual({
                      busqueda: r.draft.texto_leido ?? r.nombre,
                      nota: scan.resultado?.comprobante?.comercio
                        ? `${MOTIVO_COMPROBANTE} - ${scan.resultado.comprobante.comercio}`
                        : MOTIVO_COMPROBANTE,
                    })
                  }
                  className="mt-3 rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-canvas"
                >
                  Cargar esta salida a mano
                </button>
              )}

              {r.elegido !== null && (
                <div className="mt-3 max-w-xs">
                  <label className="mb-1 block text-sm font-medium text-ink">Unidades a sacar</label>
                  <input
                    placeholder="0"
                    type="number"
                    min={1}
                    value={r.cantidad}
                    onChange={(e) => editar(i, { cantidad: e.target.value })}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              )}
            </Card>
          ))}

          {confirmar.isError && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
              {detalle(confirmar.error, "No se pudieron registrar las salidas.")}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => confirmar.mutate()}
              disabled={confirmar.isPending || descargables.length === 0}
              className="rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {confirmar.isPending
                ? "Registrando…"
                : `Confirmar salida (${descargables.length} ${
                    descargables.length === 1 ? "producto" : "productos"
                  })`}
            </button>
            <button
              type="button"
              onClick={reiniciar}
              className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
            >
              Descartar y escanear otro
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── selector de subflujo ───────────────────────────────────────────────── */

type Modo = "producto" | "comprobante" | "codigo";

// Una entrada por imagen es siempre de productos nuevos: solo se escanea la etiqueta (el código de barras y el vencimiento
// se escanean desde su campo del formulario) o un comprobante con muchos productos. La salida, como en la app, se arma con el
// código de barras, la etiqueta o un comprobante.
const MODOS: Record<"entrada" | "salida", { value: Modo; label: string; hint: string; icon: typeof Camera }[]> = {
  entrada: [
    {
      value: "producto",
      label: "Etiqueta de producto",
      hint: "El envase o su etiqueta: lo leído pasa al formulario de un producto nuevo",
      icon: Tag,
    },
    {
      value: "comprobante",
      label: "Ticket, remito o factura",
      hint: "Carga todos los productos de una compra de una sola vez",
      icon: FileText,
    },
  ],
  salida: [
    {
      value: "codigo",
      label: "Código de barras",
      hint: "Escaneás el envase y elegís el producto que sale",
      icon: Camera,
    },
    {
      value: "producto",
      label: "Etiqueta de producto",
      hint: "Se busca el producto con la etiqueta y se indica cuántas unidades salen",
      icon: Tag,
    },
    {
      value: "comprobante",
      label: "Ticket, remito o factura",
      hint: "Descarga lo que figura en el documento, con motivo Documento Comercial",
      icon: FileText,
    },
  ],
};

export default function Procesamiento({
  direction,
  irAManual,
  irASalidaManual,
}: {
  direction: "entrada" | "salida";
  irAManual: (p: Prefill) => void;
  irASalidaManual: (p: SalidaPrefill) => void;
}) {
  const modos = MODOS[direction];
  const [modo, setModo] = useState<Modo>(modos[0].value);
  const [opciones, setOpciones] = useState<Opciones>({ categorias: [], ubicaciones: [], marcas: [] });

  // Si se cambia de entrada a salida, el subflujo elegido puede no existir del otro lado
  useEffect(() => {
    if (!modos.some((m) => m.value === modo)) setModo(modos[0].value);
  }, [modos, modo]);

  useEffect(() => {
    api
      .get<Opciones>("/me/products/filters/options")
      .then(({ data }) => setOpciones(data))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <div className={`grid gap-3 ${modos.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        {modos.map((m) => {
          const Icon = m.icon;
          const activo = modo === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => setModo(m.value)}
              className={`rounded-xl border p-4 text-left transition ${
                activo ? "border-primary bg-primary/5" : "border-line hover:border-primary/50 hover:bg-canvas"
              }`}
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                <Icon size={16} className={activo ? "text-primary" : "text-muted"} />
                {m.label}
              </span>
              <span className="mt-1 block text-xs text-muted">{m.hint}</span>
            </button>
          );
        })}
      </div>

      <Card>
        {direction === "entrada" ? (
          modo === "producto" ? (
            <EntradaEtiqueta irAManual={irAManual} />
          ) : (
            <EntradaComprobante opciones={opciones} setOpciones={setOpciones} />
          )
        ) : modo === "codigo" ? (
          <ProductoExistente key="codigo" mode="exit" method="codigo" onSelectProduct={(producto) => irASalidaManual({ producto })} />
        ) : modo === "producto" ? (
          <ProductoExistente key="etiqueta" mode="exit" method="etiqueta" onSelectProduct={(producto) => irASalidaManual({ producto })} />
        ) : (
          <SalidaComprobante irASalidaManual={irASalidaManual} />
        )}
      </Card>
    </div>
  );
}
