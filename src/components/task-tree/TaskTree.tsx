import { DndContext, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core';
import { useMemo, useState } from 'react';
import { visibleIdsFor } from '../../domain/tasks/filter';
import { indexTasks, wouldCreateCycle } from '../../domain/tasks/tree';
import type { Task } from '../../domain/tasks/types';
import { useApp } from '../../stores/appStore';
import { TaskRow, type DropZone } from './TaskRow';

interface Props {
  editingId: string | null;
  onToggleDone(task: Task): void;
  onAddChild(id: string): void;
  onStartEdit(id: string): void;
  onCommitEdit(id: string, title: string | null): void;
  onContextMenu(e: React.MouseEvent, task: Task): void;
  onMove(id: string, parentId: string | null, index?: number): void;
}

const ROOT_ID = '__root__';
/** Horizontal drag distance (px) that outdents one level when dropping below a row. */
const OUTDENT_PX = 28;

interface Flat {
  task: Task;
  depth: number;
  hasChildren: boolean;
}

/**
 * Only expanded branches are flattened, so collapsed subtrees cost nothing to render.
 * While filtering, `visible` restricts rows to matches and their ancestors, and everything shown is expanded.
 */
function flatten(
  children: ReadonlyMap<string | null, Task[]>,
  expanded: ReadonlySet<string>,
  visible: ReadonlySet<string> | null,
  inList: (root: Task) => boolean,
): Flat[] {
  const out: Flat[] = [];
  const kidsOf = (id: string | null) => (children.get(id) ?? []).filter((t) => !visible || visible.has(t.id));
  const stack: { task: Task; depth: number }[] = [];
  const roots = kidsOf(null).filter(inList);
  for (let i = roots.length - 1; i >= 0; i--) stack.push({ task: roots[i], depth: 0 });
  while (stack.length) {
    const { task, depth } = stack.pop()!;
    const kids = kidsOf(task.id);
    out.push({ task, depth, hasChildren: kids.length > 0 });
    if (visible || expanded.has(task.id)) for (let i = kids.length - 1; i >= 0; i--) stack.push({ task: kids[i], depth: depth + 1 });
  }
  return out;
}

export function TaskTree(p: Props) {
  const children = useApp((s) => s.children);
  const tasks = useApp((s) => s.tasks);
  const expanded = useApp((s) => s.expanded);
  const selectedId = useApp((s) => s.selectedId);
  const progress = useApp((s) => s.progress);
  const filters = useApp((s) => s.filters);
  const activeListId = useApp((s) => s.activeListId);
  const membership = useApp((s) => s.membership);
  const select = useApp((s) => s.select);
  const toggle = useApp((s) => s.toggle);
  const expand = useApp((s) => s.expand);
  const [hint, setHint] = useState<{ overId: string; zone: DropZone } | null>(null);

  // Drag starts only after 6px of movement so plain clicks and double-clicks still work.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const filtered = useMemo(() => visibleIdsFor(tasks, filters), [tasks, filters]);
  const rows = useMemo(
    () => flatten(children, expanded, filtered?.visible ?? null, (root) => activeListId === null || membership[root.id] === activeListId),
    [children, expanded, filtered, activeListId, membership],
  );
  const index = useMemo(() => indexTasks(tasks), [tasks]);

  const zoneFor = (e: DragMoveEvent): { overId: string; zone: DropZone } | null => {
    const { over, active, activatorEvent, delta } = e;
    if (!over || over.id === active.id || !(activatorEvent instanceof PointerEvent)) return null;
    const ratio = (activatorEvent.clientY + delta.y - over.rect.top) / over.rect.height;
    const zone: DropZone = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside';
    if (over.id === ROOT_ID) return { overId: ROOT_ID, zone: 'after' };
    const overTask = index.get(String(over.id));
    if (!overTask) return null;
    if (zone === 'after' && delta.x <= -OUTDENT_PX) {
      // Dragging left while dropping below a row climbs out of its parent(s), one level per OUTDENT_PX.
      let anchor = overTask;
      for (let n = Math.floor(-delta.x / OUTDENT_PX); n > 0 && anchor.parent_id; n--) anchor = index.get(anchor.parent_id) ?? anchor;
      return wouldCreateCycle(index, String(active.id), anchor.parent_id) ? null : { overId: anchor.id, zone: 'after' };
    }
    const newParent = zone === 'inside' ? overTask.id : overTask.parent_id;
    return wouldCreateCycle(index, String(active.id), newParent) ? null : { overId: overTask.id, zone };
  };

  const onDragEnd = (e: DragEndEvent) => {
    const target = zoneFor(e as DragMoveEvent);
    setHint(null);
    if (!target) return;
    const dragId = String(e.active.id);
    if (target.overId === ROOT_ID) {
      p.onMove(dragId, null);
      return;
    }
    const over = index.get(target.overId)!;
    if (target.zone === 'inside') {
      expand(over.id);
      p.onMove(dragId, over.id);
      return;
    }
    const siblings = (children.get(over.parent_id) ?? []).filter((t) => t.id !== dragId);
    p.onMove(dragId, over.parent_id, siblings.findIndex((t) => t.id === over.id) + (target.zone === 'after' ? 1 : 0));
  };

  if (rows.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-[var(--text-dim)]">
        {filtered ? 'No tasks match these filters.' : 'No projects in this list yet.'}
      </p>
    );
  }

  return (
    <DndContext sensors={sensors} onDragMove={(e) => setHint(zoneFor(e))} onDragEnd={onDragEnd} onDragCancel={() => setHint(null)}>
      <div role="tree" aria-label="Tasks" className="flex flex-col gap-px">
        {rows.map(({ task, depth, hasChildren }) => (
          <TaskRow
            key={task.id}
            task={task}
            depth={depth}
            hasChildren={hasChildren}
            expanded={filtered ? true : expanded.has(task.id)}
            selected={selectedId === task.id}
            progress={progress.get(task.id) ?? 0}
            editing={p.editingId === task.id}
            hint={hint?.overId === task.id ? hint.zone : null}
            onSelect={select}
            onToggle={toggle}
            onToggleDone={p.onToggleDone}
            onAddChild={p.onAddChild}
            onStartEdit={p.onStartEdit}
            onCommitEdit={p.onCommitEdit}
            onContextMenu={p.onContextMenu}
          />
        ))}
        <RootDropZone active={hint?.overId === ROOT_ID} />
      </div>
    </DndContext>
  );
}

/** Drop target below the tree: releasing a task here makes it a top-level project. */
function RootDropZone({ active }: { active: boolean }) {
  const { setNodeRef, active: dragging } = useDroppable({ id: ROOT_ID });
  return (
    <div
      ref={setNodeRef}
      className={`mt-1 flex min-h-16 items-center justify-center rounded-md text-xs ${
        active ? 'ring-2 ring-inset ring-[var(--accent)]' : dragging ? 'border border-dashed border-[var(--border)]' : ''
      } text-[var(--text-dim)]`}
    >
      {dragging ? 'Drop here to make top-level' : ''}
    </div>
  );
}
