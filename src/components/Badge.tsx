type BadgeTone = "brand" | "success" | "danger" | "neutral";
type BadgeSize = "sm" | "md";

const TONE_CLASSES: Record<BadgeTone, string> = {
  brand: "bg-brand-pink text-ink-onBrand",
  success: "bg-status-success/10 text-status-success",
  danger: "bg-status-error/10 text-status-error",
  neutral: "bg-bg-elevated text-ink-secondary",
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-xs",
};

/**
 * Generic pill badge. Deliberately doesn't force text casing — pass
 * "NEW" or "Published" as-is in children, whichever fits the usage —
 * since baking in e.g. `uppercase` would silently change the look of
 * every existing usage the moment a new one needed different casing.
 */
export default function Badge({
  children,
  tone = "neutral",
  size = "md",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  size?: BadgeSize;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-pill font-semibold ${TONE_CLASSES[tone]} ${SIZE_CLASSES[size]}`}
    >
      {children}
    </span>
  );
}
