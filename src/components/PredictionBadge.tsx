import { Sparkles } from "lucide-react";

/** La marca «Predicción» de las alertas que calcula el modelo, con el mismo símbolo (destellos) que en la app. */
export default function PredictionBadge({ className = "", testId, size = "sm" }: { className?: string; testId?: string; size?: "sm" | "md" }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded-full bg-primaryDark px-2.5 py-0.5 font-semibold text-white ${size === "sm" ? "text-[10px]" : "text-[11px]"} ${className}`}
    >
      <Sparkles size={11} aria-hidden data-testid="prediction-icon" />
      Predicción
    </span>
  );
}
