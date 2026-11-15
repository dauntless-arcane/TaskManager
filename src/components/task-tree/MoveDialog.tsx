import { useMemo, useState } from 'react';
import { getDescendants } from '../../domain/tasks/tree';
import type { Task } from '../../domain/tasks/types';
import { useApp } from '../../stores/appStore';

interface Props {
  task: Task;
  onMove(parentId: string | null): void;
  onCancel(): void;
}

/** Keyboard-accessible alternative to drag-and-drop. Lists every valid destination (excludes the task's own subtree). */
export function MoveDialog({ task, onMove, onCancel }: Props) {
  const tasks = useApp((s) => s.tasks);
  const children = useApp((s) => s.children);
  const [target, setTarget] = useState<string>(task.parent_id ?? '');

  const options = useMemo(() => {
    const banned = new Set([task.id, ...getDescendants(tasks, task.id).map((d) => d.id)]);
    const out: { id: string; label: string }[] = [];
    const stack = [...(children.get(null) ?? [])].reverse().map((t) => ({ t, depth: 0 }));
    while (stack.length) {
      const { t, depth } = stack.pop()!;
      if (banned.has(t.id)) continue;
      out.push({ id: t.id, label: `${' '.repeat(depth)}${t.title}` });
      for (const k of [...(children.get(t.id) ?? [])].reverse()) stack.push({ t: k, depth: depth + 1 });
    }
    return out;
  }, [tasks, children, task]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl"
      >
        <h2 id="move-title" className="font-semibold">Move “{task.title}”</h2>
        <p className="mt-1 text-sm text-[var(--text-dim)]">Its subtasks move with it.</p>
        <label className="mt-3 block text-xs text-[var(--text-dim)]">New parent
          <select
            autoFocus
            size={8}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] p-1 text-sm"
          >
            <option value="">(Top level)</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]">Cancel</button>
          <button onClick={() => onMove(target || null)} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white">Move</button>
        </div>
      </div>
    </div>
  );
}
