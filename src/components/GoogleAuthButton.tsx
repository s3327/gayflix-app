import GoogleIcon from "@/components/GoogleIcon";

/**
 * "Continue with Google" button shared by /login and /signup. No real
 * OAuth wired up yet — the parent page just passes whatever onClick it
 * wants (both currently just route straight to /home, same as the rest
 * of this scaffold's placeholder auth).
 */
export default function GoogleAuthButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2.5 rounded-card border border-border-strong bg-bg-elevated px-6 py-3 text-sm font-semibold text-ink-primary transition-colors hover:bg-bg-surface disabled:cursor-not-allowed disabled:opacity-50"
    >
      <GoogleIcon className="h-4 w-4" />
      {label}
    </button>
  );
}
