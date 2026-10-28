import { Modal } from "@/components/ui";
import TrendsPanel from "@/components/TrendsPanel";

/** «Tendencias de Consumo» como ventana que sube sobre el inicio, igual que en la app. */
export default function TrendsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Tendencias de Consumo" onClose={onClose} testId="trends-modal">
      <TrendsPanel />
    </Modal>
  );
}
