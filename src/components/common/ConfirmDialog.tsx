import { useEffect, useRef } from 'react';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog(p: Props) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && p.onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={p.onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl"
      >
        <h2 id="dlg-title" className="font-semibold">{p.title}</h2>
        <p className="mt-2 text-sm text-[var(--text-dim)]">{p.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancel} onClick={p.onCancel} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]">
            Cancel
          </button>
          <button
            onClick={p.onConfirm}
            className={`rounded-md px-3 py-1.5 text-sm text-white ${p.destructive ? 'bg-[var(--danger)]' : 'bg-[var(--accent)]'}`}
          >
            {p.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
