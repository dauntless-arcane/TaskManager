import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Check, ChevronRight, CircleDot, Plus } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import type { Task } from '../../domain/tasks/types';

interface Props {
  task: Task;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  progress: number;
  editing: boolean;
  onSelect(id: string): void;
  onToggle(id: string): void;
  onToggleDone(task: Task): void;
  onAddChild(id: string): void;
  onStartEdit(id: string): void;
  onCommitEdit(id: string, title: string | null): void;
  hint: DropZone | null;
  onContextMenu(e: React.MouseEvent, task: Task): void;
}

export type DropZone = 'before' | 'inside' | 'after';

const HINT_CLASS: Record<DropZone, string> = {
  before: 'shadow-[inset_0_2px_0_var(--accent)]',
  after: 'shadow-[inset_0_-2px_0_var(--accent)]',
  inside: 'ring-2 ring-inset ring-[var(--accent)]',
};

const PRIORITY_DOT: Record<Task['priority'], string> = {
  low: 'bg-stone-400',
  medium: 'bg-sky-500',
  high: 'bg-amber-500',
  critical: 'bg-red-500',
};

export const TaskRow = memo(function TaskRow(p: Props) {
  const { task } = p;
  const [draft, setDraft] = useState(task.title);
  const input = useRef<HTMLInputElement>(null);
  const drag = useDraggable({ id: task.id });
  const drop = useDroppable({ id: task.id });

  useEffect(() => {
    if (p.editing) {
      setDraft(task.title);
      input.current?.select();
    }
  }, [p.editing, task.title]);

  const done = task.status === 'completed';

  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...drag.listeners}
      onContextMenu={(e) => p.onContextMenu(e, task)}
      role="treeitem"
      aria-level={p.depth + 1}
      aria-expanded={p.hasChildren ? p.expanded : undefined}
      aria-selected={p.selected}
      tabIndex={0}
      onClick={() => p.onSelect(task.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') p.onSelect(task.id);
        else if (e.key === 'F2') p.onStartEdit(task.id);
        else if (e.key === 'ArrowRight' && p.hasChildren && !p.expanded) p.onToggle(task.id);
        else if (e.key === 'ArrowLeft' && p.expanded) p.onToggle(task.id);
      }}
      onDoubleClick={() => p.onStartEdit(task.id)}
      style={{ paddingLeft: 8 + p.depth * 18 }}
      className={`group flex h-9 cursor-pointer items-center gap-1.5 rounded-md pr-2 text-sm ${
        p.selected ? 'bg-[var(--muted)]' : 'hover:bg-[var(--muted)]/60'
      } ${drag.isDragging ? 'opacity-40' : ''} ${p.hint ? HINT_CLASS[p.hint] : ''}`}
    >
      <button
        aria-label={p.expanded ? 'Collapse' : 'Expand'}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          p.onToggle(task.id);
        }}
        className={`grid size-5 place-items-center rounded text-[var(--text-dim)] ${p.hasChildren ? '' : 'invisible'}`}
      >
        <ChevronRight size={14} className={`transition-transform ${p.expanded ? 'rotate-90' : ''}`} />
      </button>

      <button
        aria-label={done ? 'Reopen task' : 'Mark completed'}
        title={done ? 'Reopen' : 'Mark completed'}
        onClick={(e) => {
          e.stopPropagation();
          p.onToggleDone(task);
        }}
        className={`grid size-4 shrink-0 place-items-center rounded-full border ${
          done ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--text-dim)]'
        }`}
      >
        {done && <Check size={11} strokeWidth={3} />}
      </button>

      {p.editing ? (
        <input
          ref={input}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => p.onCommitEdit(task.id, draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') p.onCommitEdit(task.id, draft);
            if (e.key === 'Escape') p.onCommitEdit(task.id, null);
          }}
          className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-[var(--surface)] px-1.5 py-0.5"
        />
      ) : (
        <span className={`min-w-0 flex-1 truncate ${done ? 'text-[var(--text-dim)] line-through' : ''}`}>{task.title}</span>
      )}

      {task.status === 'blocked' && <CircleDot size={13} className="text-red-500" aria-label="Blocked" />}
      <span className={`size-1.5 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`} title={`${task.priority} priority`} />
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-[var(--text-dim)]">{Math.round(p.progress)}%</span>

      <button
        aria-label="Add child"
        title="Add child"
        onClick={(e) => {
          e.stopPropagation();
          p.onAddChild(task.id);
        }}
        className="grid size-5 place-items-center rounded text-[var(--text-dim)] opacity-0 hover:bg-[var(--border)] group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Plus size={14} />
      </button>
    </div>
  );
});
