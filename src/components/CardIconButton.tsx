import type { LucideIcon } from "lucide-react";

/**
 * The small circular corner-action button on a poster card — used by
 * FavoriteCard (heart, list-plus), HistoryCard (remove), and
 * /list/[id]'s item grid (remove). All four used to reimplement this
 * identically; this is that button as one component.
 */
export default function CardIconButton({
  icon: Icon,
  onClick,
  label,
  position = "right",
  tone = "neutral",
  filled = false,
}: {
  icon: LucideIcon;
  onClick: () => void;
  label: string;
  position?: "left" | "right";
  tone?: "neutral" | "brand";
  filled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`absolute top-2 ${position === "left" ? "left-2" : "right-2"} flex h-8 w-8 items-center justify-center rounded-full bg-bg-base/70 backdrop-blur transition-colors hover:bg-bg-base ${
        tone === "brand" ? "text-brand-pink" : "text-ink-primary"
      }`}
    >
      <Icon className={`h-4 w-4 ${filled ? "fill-current" : ""}`} />
    </button>
  );
}
