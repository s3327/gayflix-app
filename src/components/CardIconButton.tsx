import type { LucideIcon } from "lucide-react";

/**
 * The small circular corner-action button on a poster card — used by
 * FavoriteCard (heart, list-plus), HistoryCard (remove), and
 * /list/[id]'s item grid (remove). All four used to reimplement this
 * identically; this is that button as one component. It reacts to taps
 * 6px past its edge, a 44px target, without covering more of the poster.
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
      className={`absolute top-2 ${position === "left" ? "left-2" : "right-2"} flex h-8 w-8 items-center justify-center rounded-full bg-bg-base/70 backdrop-blur-sm transition-colors after:absolute after:-inset-1.5 hover:bg-bg-base ${
        tone === "brand" ? "text-ink-brand" : "text-ink-primary"
      }`}
    >
      <Icon className={`h-4 w-4 ${filled ? "fill-current" : ""}`} />
    </button>
  );
}
