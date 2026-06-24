import { useState } from "react";
import { ImageOff } from "lucide-react";

export default function ProductImage({
  url,
  alt,
  className = "h-12 w-12",
}: {
  url: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div className={`flex items-center justify-center rounded-lg bg-canvas text-muted ${className}`}>
        <ImageOff size={18} />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
      className={`rounded-lg border border-line object-cover ${className}`}
    />
  );
}
