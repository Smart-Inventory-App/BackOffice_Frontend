import type { CategoryCount } from "@/lib/types";
import { formatThousands, truncate } from "@/lib/format";
import { EmptyState, Modal } from "@/components/ui";

/**
 * Lista completa de un ranking del dashboard («Stock por categoría», «Dónde tenés tus productos»), de mayor a menor.
 * Cada fila es una barra proporcional a la primera; tocarla lleva a los productos de esa categoría o ubicación.
 */
export default function RankingModal({
  title,
  testId,
  items,
  unit,
  empty,
  colors,
  onSelect,
  onClose,
}: {
  title: string;
  /** Prefijo de los `data-testid` de la ventana y de sus filas. */
  testId: string;
  items: CategoryCount[];
  /** Lo que se cuenta, escrito después del número («u.», «productos»). */
  unit: string;
  empty: string;
  colors: string[];
  onSelect: (label: string) => void;
  onClose: () => void;
}) {
  const sorted = [...items].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...sorted.map((c) => c.count));
  return (
    <Modal title={title} onClose={onClose} testId={testId} width="max-w-lg">
      {sorted.length === 0 ? (
        <EmptyState>{empty}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {sorted.map((item, i) => (
            <li key={item.label}>
              <button type="button" data-testid={`${testId}-item-${i}`} onClick={() => onSelect(item.label)} className="block w-full text-left">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-ink" title={item.label}>
                    {truncate(item.label)}
                  </span>
                  <span className="shrink-0 text-muted">
                    {formatThousands(item.count)} {unit}
                  </span>
                </div>
                <div className="mt-1 h-2.5 rounded-full bg-canvas">
                  <div
                    className="h-2.5 rounded-full"
                    style={{ width: `${Math.max(4, Math.round((item.count / max) * 100))}%`, backgroundColor: colors[i % colors.length] }}
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
