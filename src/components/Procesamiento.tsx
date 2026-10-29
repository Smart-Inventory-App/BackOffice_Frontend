import { useEffect, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, FileText, RotateCcw, Tag } from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";
import ProductoExistente from "@/components/ExistingProduct";
import ReceiptReview from "@/components/ReceiptReview";
import { BotonProcesar, ErrorScan, FotoInput, Progreso, useScan } from "@/components/scanTools";
import type { BulkCommitResult, ProductSuggestion, SalidaOCRResult, ScanResult } from "@/lib/types";

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
            <FotoInput label="Escanea la etiqueta de un producto" hint="El envase o su etiqueta, de frente" file={foto} disabled={etiqueta.procesando} onChange={setFoto} />
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

/* ── comprobante (entrada y salida): la foto y, al leerla, la revisión de sus productos ── */

function ComprobanteScan({
  direction,
  opciones,
  setOpciones,
}: {
  direction: "entrada" | "salida";
  opciones: Opciones;
  setOpciones: (o: Opciones) => void;
}) {
  const scan = useScan("receipt");
  const [foto, setFoto] = useState<File | null>(null);
  const [hecho, setHecho] = useState<BulkCommitResult | SalidaOCRResult | null>(null);
  const [revision, setRevision] = useState(0);

  const reiniciar = () => {
    scan.reiniciar();
    setFoto(null);
    setHecho(null);
    setRevision((n) => n + 1);
  };

  if (hecho) {
    const errores = "errors" in hecho ? hecho.errors : hecho.errores;
    return (
      <div className="space-y-3">
        <Confirmado
          texto={
            "errors" in hecho
              ? `${hecho.created === 1 ? "1 producto nuevo" : `${hecho.created} productos nuevos`} y ${
                  hecho.merged === 1 ? "1 actualizado" : `${hecho.merged} actualizados`
                } desde el comprobante.${
                  hecho.failed
                    ? ` ${hecho.failed === 1 ? "1 renglón no se pudo cargar" : `${hecho.failed} renglones no se pudieron cargar`}.`
                    : ""
                }`
              : hecho.procesados === 1
                ? `Salió 1 producto por ${MOTIVO_COMPROBANTE}.`
                : `Salieron ${hecho.procesados} productos por ${MOTIVO_COMPROBANTE}.`
          }
          onSeguir={reiniciar}
        />
        {errores.length > 0 && (
          <ul className="list-inside list-disc rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (scan.resultado) {
    return (
      <ReceiptReview
        key={revision}
        direction={direction}
        resultado={scan.resultado}
        opciones={opciones}
        setOpciones={setOpciones}
        origen={MOTIVO_COMPROBANTE}
        onDone={setHecho}
        onScanAnother={reiniciar}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <FotoInput
          label="Foto del ticket, remito o factura"
          hint="Entera y sin doblar. Es el documento que más tarda: cerca de un minuto"
          file={foto}
          disabled={scan.procesando}
          onChange={setFoto}
        />
      </div>
      <BotonProcesar onClick={() => foto && scan.subir(foto)} disabled={!foto} procesando={scan.procesando}>
        Leer comprobante
      </BotonProcesar>
      <Progreso scan={scan} etiqueta="Comprobante" />
      <ErrorScan scan={scan} />
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
            <ComprobanteScan direction="entrada" opciones={opciones} setOpciones={setOpciones} />
          )
        ) : modo === "codigo" ? (
          <ProductoExistente key="codigo" mode="exit" method="codigo" onSelectProduct={(producto) => irASalidaManual({ producto })} />
        ) : modo === "producto" ? (
          <ProductoExistente key="etiqueta" mode="exit" method="etiqueta" onSelectProduct={(producto) => irASalidaManual({ producto })} />
        ) : (
          <ComprobanteScan direction="salida" opciones={opciones} setOpciones={setOpciones} />
        )}
      </Card>
    </div>
  );
}
