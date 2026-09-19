import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

interface ToastOptions {
  kind?: ToastKind;
  action?: ToastAction;
  /** Milliseconds before it dismisses itself. Errors stay longer by default. */
  duration?: number;
}

interface ToastApi {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi["show"]>(
    (message, { kind = "info", action, duration } = {}) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, kind, message, action }]);
      window.setTimeout(() => dismiss(id), duration ?? (kind === "error" ? 7000 : 4000));
    },
    [dismiss]
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span className="toast-message">{t.message}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
