"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertCircle, Check, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

type ToastOptions = {
  /** "success" (a tick) unless said otherwise. */
  type?: ToastType;
  /** A button in the toast, such as Undo; pressing it closes the toast. */
  action?: { label: string; onClick: () => void };
};

type Toast = { id: string; message: string; type: ToastType; action?: ToastOptions["action"] };

type ToastContextValue = {
  showToast: (message: string, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Long enough to read; longer when there's something to press or fix.
const DISMISS_MS = 4000;
const LONG_DISMISS_MS = 7000;

const ICONS = {
  success: { Icon: Check, className: "text-status-success" },
  error: { Icon: AlertCircle, className: "text-status-error" },
  info: { Icon: Info, className: "text-ink-secondary" },
};

/**
 * Simple, app-wide "pop up notif" — used by list create/delete/rename,
 * add-to-list, share-link-copied, etc. Just an in-memory stack, no
 * persistence needed (toasts are inherently ephemeral).
 *
 * Each says what kind it is (a tick, a warning for errors, an "i" for
 * hints like "Log in to save favorites"), can carry one action, and has
 * a close button. Errors are announced at once (role="alert"), the rest
 * politely.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, { type = "success", action }: ToastOptions = {}) => {
      const id = `t${counterRef.current++}`;
      setToasts((prev) => [...prev, { id, message, type, action }]);
      setTimeout(() => dismiss(id), action || type === "error" ? LONG_DISMISS_MS : DISMISS_MS);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Fixed stack, bottom-center — clear of Header/NavMenu (top) and
          works the same on mobile and desktop without a separate layout. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => {
          const { Icon, className } = ICONS[toast.type];
          return (
            <div
              key={toast.id}
              role={toast.type === "error" ? "alert" : "status"}
              className="pointer-events-auto flex max-w-md items-center gap-2 rounded-card border border-border-subtle bg-bg-surface py-1.5 pl-4 pr-1.5 text-sm font-medium text-ink-primary shadow-xl"
            >
              <Icon className={`h-4 w-4 shrink-0 ${className}`} aria-hidden />
              <span className="py-1">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    dismiss(toast.id);
                    toast.action?.onClick();
                  }}
                  className="ml-1 shrink-0 rounded-md px-2.5 py-1 font-bold text-ink-brand transition-colors hover:bg-bg-elevated"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-bg-elevated hover:text-ink-primary"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
