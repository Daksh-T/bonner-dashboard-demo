import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { createPortal } from "react-dom";

const EXIT_MS = 180;

export function Dialog({
  open,
  onOpenChange,
  children,
  label = "Dialog",
}: PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void; label?: string }>) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
      return;
    }
    setVisible(false);
    const timeout = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(timeout);
  }, [open]);

  // Move focus into the dialog on open and restore it to the trigger on close.
  useEffect(() => {
    if (!mounted) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => contentRef.current?.focus());
    return () => {
      lastFocused.current?.focus?.();
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mounted, onOpenChange]);

  if (!mounted) return null;
  return createPortal(
    <div className="dialog-root fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className={`dialog-overlay absolute inset-0 bg-black/65 backdrop-blur-sm ${visible ? "dialog-overlay-open" : "dialog-overlay-close"}`}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`dialog-content relative z-10 w-full max-w-5xl outline-none ${visible ? "dialog-content-open" : "dialog-content-close"}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DialogContent({ children }: PropsWithChildren) {
  return (
    <div
      className="max-h-[90vh] overflow-auto rounded-2xl p-6"
      style={{ background: "var(--bg-1)", border: "1px solid var(--border-2)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}
    >
      {children}
    </div>
  );
}

export function DialogHeader({ children }: PropsWithChildren) {
  return <div className="mb-4 flex items-start justify-between gap-4">{children}</div>;
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-2xl font-semibold">{children}</h2>;
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-400">{children}</p>;
}
