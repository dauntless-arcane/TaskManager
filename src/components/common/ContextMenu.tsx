import { useEffect, useRef } from 'react';

export type MenuItem =
  | { kind: 'item'; label: string; onSelect(): void; destructive?: boolean; checked?: boolean }
  | { kind: 'separator' }
  | { kind: 'heading'; label: string };

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose(): void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  };

  // Keep the menu on screen.
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 40 - items.length * 30);

  return (
    <div
      ref={ref}
      role="menu"
      onKeyDown={onKeyDown}
      style={{ left, top }}
      className="fixed z-50 w-52 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 text-sm shadow-xl"
    >
      {items.map((it, i) =>
        it.kind === 'separator' ? (
          <div key={i} className="my-1 h-px bg-[var(--border)]" />
        ) : it.kind === 'heading' ? (
          <div key={i} className="px-2 pb-0.5 pt-1.5 text-xs text-[var(--text-dim)]">{it.label}</div>
        ) : (
          <button
            key={i}
            role="menuitem"
            onClick={() => {
              onClose();
              it.onSelect();
            }}
            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-[var(--muted)] focus-visible:bg-[var(--muted)] ${
              it.destructive ? 'text-[var(--danger)]' : ''
            }`}
          >
            {it.label}
            {it.checked && <span aria-hidden>✓</span>}
          </button>
        ),
      )}
    </div>
  );
}
