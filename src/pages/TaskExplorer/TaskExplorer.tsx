import { FolderPlus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { ContextMenu, type MenuItem } from '../../components/common/ContextMenu';
import { ListSidebar } from '../../components/lists/ListSidebar';
import { DetailPanel } from '../../components/task-details/DetailPanel';
import { FilterBar } from '../../components/task-tree/FilterBar';
import { MoveDialog } from '../../components/task-tree/MoveDialog';
import { TaskTree } from '../../components/task-tree/TaskTree';
import { PRIORITIES, type Priority, type Status, type Task } from '../../domain/tasks/types';
import { ConfirmationRequiredError } from '../../services/taskService';
import { useApp } from '../../stores/appStore';

type Pending =
  | { kind: 'complete'; task: Task; count: number }
  | { kind: 'delete'; task: Task; count: number }
  | { kind: 'move'; task: Task };

export function TaskExplorer({ onError }: { onError(message: string): void }) {
  const run = useApp((s) => s.run);
  const select = useApp((s) => s.select);
  const expand = useApp((s) => s.expand);
  const selected = useApp((s) => (s.selectedId ? s.tasks.find((t) => t.id === s.selectedId) ?? null : null));
  const taskCount = useApp((s) => s.tasks.length);
  const activeListId = useApp((s) => s.activeListId);
  const activeList = useApp((s) => s.lists.find((l) => l.id === s.activeListId) ?? null);
  const lists = useApp((s) => s.lists);
  const assignToList = useApp((s) => s.assignToList);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; task: Task } | null>(null);

  const guard = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn();
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
        return undefined;
      }
    },
    [onError],
  );

  /** Creates a task under parentId and opens it for inline renaming. */
  const add = useCallback(
    (parentId: string | null) =>
      guard(async () => {
        const t = await run((s) => s.create({ title: 'New task', parent_id: parentId }));
        if (!parentId && activeListId) await assignToList(t.id, activeListId);
        if (parentId) expand(parentId);
        select(t.id);
        setEditingId(t.id);
      }),
    [guard, run, expand, select, activeListId, assignToList],
  );

  const setStatus = useCallback(
    async (task: Task, status: Status) => {
      try {
        await run((s) => s.setStatus(task.id, status));
      } catch (e) {
        if (e instanceof ConfirmationRequiredError) setPending({ kind: 'complete', task, count: e.incompleteCount });
        else onError(e instanceof Error ? e.message : String(e));
      }
    },
    [run, onError],
  );

  const toggleDone = useCallback((task: Task) => setStatus(task, task.status === 'completed' ? 'todo' : 'completed'), [setStatus]);

  const commitEdit = useCallback(
    (id: string, title: string | null) => {
      setEditingId(null);
      if (title === null) return;
      const current = useApp.getState().tasks.find((t) => t.id === id);
      if (!current || title.trim() === current.title) return;
      void guard(() => run((s) => s.update(id, { title })));
    },
    [guard, run],
  );

  const move = useCallback(
    (id: string, parentId: string | null, index?: number) =>
      guard(async () => {
        await run((s) => s.move(id, parentId, index));
        // A task dropped at the top level while viewing a list joins that list.
        if (parentId === null && activeListId) await assignToList(id, activeListId);
      }),
    [guard, run, activeListId, assignToList],
  );

  const requestDelete = (task: Task) => {
    const count = useApp.getState().tasks.filter((t) => t.parent_id === task.id).length;
    setPending({ kind: 'delete', task, count });
  };

  const confirm = async () => {
    if (!pending || pending.kind === 'move') return;
    const { kind, task } = pending;
    setPending(null);
    await guard(() =>
      run(async (s) => {
        if (kind === 'delete') await s.remove(task.id);
        else await s.setStatus(task.id, 'completed', { confirmIncomplete: true });
      }),
    );
  };

  const openMenu = useCallback((e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    select(task.id);
    setMenu({ x: e.clientX, y: e.clientY, task });
  }, [select]);

  const menuItems = (t: Task): MenuItem[] => [
    { kind: 'item', label: 'Add child', onSelect: () => void add(t.id) },
    { kind: 'item', label: 'Add sibling', onSelect: () => void add(t.parent_id) },
    { kind: 'item', label: 'Edit', onSelect: () => setEditingId(t.id) },
    { kind: 'item', label: 'Move…', onSelect: () => setPending({ kind: 'move', task: t }) },
    { kind: 'item', label: 'Duplicate', onSelect: () => void guard(() => run((s) => s.duplicate(t.id))) },
    { kind: 'item', label: t.status === 'completed' ? 'Reopen' : 'Mark completed', onSelect: () => void toggleDone(t) },
    { kind: 'heading', label: 'Priority' },
    ...PRIORITIES.map<MenuItem>((p: Priority) => ({
      kind: 'item',
      label: p[0].toUpperCase() + p.slice(1),
      checked: t.priority === p,
      onSelect: () => void guard(() => run((s) => s.update(t.id, { priority: p }))),
    })),
    ...(t.parent_id === null && lists.length > 0
      ? ([
          { kind: 'heading', label: 'List' },
          {
            kind: 'item',
            label: 'None',
            checked: !useApp.getState().membership[t.id],
            onSelect: () => void guard(() => assignToList(t.id, null)),
          },
          ...lists.map<MenuItem>((l) => ({
            kind: 'item',
            label: l.name,
            checked: useApp.getState().membership[t.id] === l.id,
            onSelect: () => void guard(() => assignToList(t.id, l.id)),
          })),
        ] as MenuItem[])
      : []),
    { kind: 'separator' },
    { kind: 'item', label: 'Delete…', destructive: true, onSelect: () => requestDelete(t) },
  ];

  return (
    <div className="flex h-full min-h-0">
      <ListSidebar onError={onError} />
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h1 className="text-lg font-semibold">{activeList?.name ?? 'All Tasks'}</h1>
          <button onClick={() => add(null)} className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white">
            <FolderPlus size={15} /> New project
          </button>
        </header>
        {taskCount > 0 && <FilterBar />}
        <div className="flex-1 overflow-y-auto p-3">
          {taskCount === 0 ? (
            <div className="mx-auto mt-24 max-w-xs text-center text-sm text-[var(--text-dim)]">
              <p className="font-medium text-[var(--text)]">No projects yet</p>
              <p className="mt-1">Create a project, then nest tasks inside it to any depth.</p>
            </div>
          ) : (
            <TaskTree
              editingId={editingId}
              onToggleDone={toggleDone}
              onAddChild={add}
              onStartEdit={setEditingId}
              onCommitEdit={commitEdit}
              onContextMenu={openMenu}
              onMove={move}
            />
          )}
        </div>
      </section>

      {selected && (
        <div className="hidden min-h-0 flex-col md:flex">
          <div className="min-h-0 flex-1">
            <DetailPanel task={selected} onClose={() => select(null)} onStatus={setStatus} onError={onError} />
          </div>
          <div className="border-t border-[var(--border)] bg-[var(--surface)] p-3 md:w-96">
            <button onClick={() => requestDelete(selected)} className="text-sm text-[var(--danger)] hover:underline">
              Delete task…
            </button>
          </div>
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.task)} onClose={() => setMenu(null)} />}

      {pending?.kind === 'move' && (
        <MoveDialog
          task={pending.task}
          onCancel={() => setPending(null)}
          onMove={(parentId) => {
            const id = pending.task.id;
            setPending(null);
            if (parentId) expand(parentId);
            void move(id, parentId);
          }}
        />
      )}
      {pending?.kind === 'complete' && (
        <ConfirmDialog
          title="Complete with unfinished subtasks?"
          message={`"${pending.task.title}" has ${pending.count} incomplete descendant task(s). Completing it will not complete them.`}
          confirmLabel="Complete anyway"
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === 'delete' && (
        <ConfirmDialog
          title="Delete task?"
          message={
            pending.count > 0
              ? `"${pending.task.title}" and all of its descendants will be permanently deleted.`
              : `"${pending.task.title}" will be permanently deleted.`
          }
          confirmLabel="Delete"
          destructive
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
