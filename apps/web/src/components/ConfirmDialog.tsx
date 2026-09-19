import { useEffect, useRef } from "react";

/**
 * Modal confirmation. Cancel has focus when it opens, so pressing Enter or
 * Space right away can never confirm a destructive action by accident.
 * Esc and clicking the backdrop cancel; Tab stays inside the dialog.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Tab") {
        // Two focusable buttons: cycle between them.
        e.preventDefault();
        const active = document.activeElement;
        (active === cancelRef.current ? confirmRef.current : cancelRef.current)?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-message"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title" id="modal-title">
          {title}
        </h2>
        <p className="modal-message" id="modal-message">
          {message}
        </p>
        <div className="modal-actions">
          <button className="btn btn-ghost" ref={cancelRef} onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
