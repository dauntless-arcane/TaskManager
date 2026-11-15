import { Check, ListTodo, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../stores/appStore';

interface Props {
  onError(message: string): void;
}

export function ListSidebar({ onError }: Props) {
  const lists = useApp((s) => s.lists);
  const activeId = useApp((s) => s.activeListId);
  const membership = useApp((s) => s.membership);
  const tasks = useApp((s) => s.tasks);
  const setActive = useApp((s) => s.setActiveList);
  const createList = useApp((s) => s.createList);
  const renameList = useApp((s) => s.renameList);
  const deleteList = useApp((s) => s.deleteList);
  // 'new' = adding a list; otherwise the id of the list being renamed.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const rootIds = tasks.filter((t) => t.parent_id === null).map((t) => t.id);
  const countIn = (listId: string) => rootIds.filter((id) => membership[id] === listId).length;

  const start = (id: string, name = '') => {
    setEditing(id);
    setDraft(name);
  };

  const save = async () => {
    const name = draft.trim();
    const target = editing;
    setEditing(null);
    if (!name || !target) return;
    try {
      if (target === 'new') await createList(name);
      else await renameList(target, name);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete list "${name}"? Its projects are kept and move to All Tasks.`)) return;
    try {
      await deleteList(id);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const item = (active: boolean) =>
    `group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${active ? 'bg-[var(--muted)] font-medium' : 'hover:bg-[var(--muted)]'}`;

  return (
    <aside aria-label="Lists" className="hidden w-52 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] p-2 sm:flex">
      <div className="mb-1 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)]">
        Lists
        <button aria-label="New list" title="New list" onClick={() => start('new')} className="rounded p-1 hover:bg-[var(--muted)]">
          <Plus size={14} />
        </button>
      </div>
      <div role="listbox" className="flex flex-col gap-px overflow-y-auto">
        <div role="option" aria-selected={activeId === null} onClick={() => setActive(null)} className={item(activeId === null)}>
          <ListTodo size={14} />
          <span className="flex-1 truncate">All Tasks</span>
          <span className="text-xs text-[var(--text-dim)]">{rootIds.length}</span>
        </div>
        {lists.map((l) =>
          editing === l.id ? (
            <NameInput key={l.id} value={draft} onChange={setDraft} onSave={save} onCancel={() => setEditing(null)} />
          ) : (
            <div key={l.id} role="option" aria-selected={activeId === l.id} onClick={() => setActive(l.id)} className={item(activeId === l.id)}>
              <span className="flex-1 truncate">{l.name}</span>
              <span className="text-xs text-[var(--text-dim)] group-hover:hidden">{countIn(l.id)}</span>
              <button
                aria-label={`Rename ${l.name}`}
                title="Rename"
                onClick={(e) => {
                  e.stopPropagation();
                  start(l.id, l.name);
                }}
                className="hidden rounded p-0.5 hover:bg-[var(--border)] group-hover:block"
              >
                <Pencil size={12} />
              </button>
              <button
                aria-label={`Delete ${l.name}`}
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(l.id, l.name);
                }}
                className="hidden rounded p-0.5 text-[var(--danger)] hover:bg-[var(--border)] group-hover:block"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ),
        )}
        {editing === 'new' && <NameInput value={draft} onChange={setDraft} onSave={save} onCancel={() => setEditing(null)} />}
      </div>
    </aside>
  );
}

function NameInput(p: { value: string; onChange(v: string): void; onSave(): void; onCancel(): void }) {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      <input
        autoFocus
        aria-label="List name"
        value={p.value}
        placeholder="List name"
        onChange={(e) => p.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') p.onSave();
          if (e.key === 'Escape') p.onCancel();
        }}
        className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-sm"
      />
      <button aria-label="Save list" onClick={p.onSave} className="rounded p-1 hover:bg-[var(--muted)]">
        <Check size={13} />
      </button>
      <button aria-label="Cancel" onClick={p.onCancel} className="rounded p-1 hover:bg-[var(--muted)]">
        <X size={13} />
      </button>
    </div>
  );
}
