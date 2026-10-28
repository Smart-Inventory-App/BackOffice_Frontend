import type { CategoryCount } from "@/lib/types";
import { formatThousands, truncate } from "@/lib/format";
import { EmptyState, Modal } from "@/components/ui";

/** «Stock por categoría»: todas las categorías, de la que más unidades tiene a la que menos. Tocar una lleva a sus productos. */
export default function CategoriesModal({
  categories,
  colors,
  onSelect,
  onClose,
}: {
  categories: CategoryCount[];
  colors: string[];
  onSelect: (label: string) => void;
  onClose: () => void;
}) {
  const sorted = [...categories].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...sorted.map((c) => c.count));
  return (
    <Modal title="Stock por categoría" onClose={onClose} testId="categories-modal" width="max-w-lg">
      {sorted.length === 0 ? (
        <EmptyState>Todavía no hay productos cargados.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {sorted.map((category, i) => (
            <li key={category.label}>
              <button
                type="button"
                data-testid={`categories-modal-item-${i}`}
                onClick={() => onSelect(category.label)}
                className="block w-full text-left"
              >
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-ink" title={category.label}>
                    {truncate(category.label)}
                  </span>
                  <span className="shrink-0 text-muted">{formatThousands(category.count)} u.</span>
                </div>
                <div className="mt-1 h-2.5 rounded-full bg-canvas">
                  <div
                    className="h-2.5 rounded-full"
                    style={{ width: `${Math.max(4, Math.round((category.count / max) * 100))}%`, backgroundColor: colors[i % colors.length] }}
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
