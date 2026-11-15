import type { HistoryEvent, HistoryEventType, ProgressSnapshot } from '../domain/history/types';
import { createProgressCalculator } from '../domain/progress/engine';
import { getAncestorIds, getDescendants, indexTasks, wouldCreateCycle } from '../domain/tasks/tree';
import type { Priority, ProgressMethod, Status, Task, TaskType } from '../domain/tasks/types';
import type { CommitBatch, Repository } from '../storage/interfaces/repository';

export class TaskServiceError extends Error {}

/** Thrown when completing a parent that still has incomplete descendants; retry with confirmIncomplete. */
export class ConfirmationRequiredError extends TaskServiceError {
  readonly incompleteCount: number;
  constructor(incompleteCount: number) {
    super(`${incompleteCount} descendant task(s) are not completed`);
    this.incompleteCount = incompleteCount;
  }
}

export interface CreateTaskInput {
  title: string;
  parent_id?: string | null;
  task_type?: TaskType;
  description?: string;
  priority?: Priority;
  due_date?: string | null;
  weight?: number;
  progress_method?: ProgressMethod;
}

export type UpdateTaskInput = Partial<
  Pick<Task, 'title' | 'description' | 'priority' | 'due_date' | 'weight' | 'progress_percent' | 'progress_method'>
>;

const newId = () => crypto.randomUUID();
const EPS = 1e-9;

export function createTaskService(repo: Repository, now: () => Date = () => new Date()) {
  const ts = () => now().toISOString();

  const event = (task: Task, type: HistoryEventType, oldV: unknown, newV: unknown): HistoryEvent => ({
    id: newId(),
    task_id: task.id,
    task_title: task.title,
    event_type: type,
    old_value: oldV == null ? null : String(oldV),
    new_value: newV == null ? null : String(newV),
    created_at: ts(),
  });

  /**
   * Adds snapshots for the given tasks and their ancestors, but only where derived progress
   * differs from the last recorded value (deduplication). `tasks` must be the post-change set.
   */
  async function snapshotsFor(tasks: Task[], touchedIds: string[]): Promise<ProgressSnapshot[]> {
    const index = indexTasks(tasks);
    const ids = new Set<string>();
    for (const id of touchedIds) {
      if (index.has(id)) ids.add(id);
      for (const a of getAncestorIds(index, id)) ids.add(a);
    }
    const calc = createProgressCalculator(tasks);
    const out: ProgressSnapshot[] = [];
    for (const id of ids) {
      const progress = calc.calculate(id);
      const last = (await repo.getSnapshots(id)).at(-1);
      if (!last || Math.abs(last.progress - progress) > EPS) {
        out.push({ id: newId(), task_id: id, progress, created_at: ts() });
      }
    }
    return out;
  }

  /** Apply a batch and the snapshots implied by it atomically. `after` computes the post-change task set. */
  async function commitWithSnapshots(batch: CommitBatch, touchedIds: string[]): Promise<void> {
    const all = await repo.getAllTasks();
    const removed = new Set(batch.deleteTaskIds ?? []);
    const put = new Map((batch.putTasks ?? []).map((t) => [t.id, t]));
    const after = all.filter((t) => !removed.has(t.id)).map((t) => put.get(t.id) ?? t);
    for (const t of put.values()) if (!all.some((x) => x.id === t.id)) after.push(t);
    // Deleted tasks' ancestors still need a snapshot, so touch their former parents.
    const touched = [...touchedIds];
    await repo.commit({ ...batch, snapshots: [...(batch.snapshots ?? []), ...(await snapshotsFor(after, touched))] });
  }

  async function mustGet(id: string): Promise<Task> {
    const t = await repo.getTask(id);
    if (!t) throw new TaskServiceError(`Task ${id} not found`);
    return t;
  }

  async function nextPosition(parentId: string | null): Promise<number> {
    const sibs = await repo.getChildren(parentId);
    return sibs.length ? Math.max(...sibs.map((s) => s.position)) + 1 : 0;
  }

  /** New children get the mean of existing sibling weights so existing weights are never altered. */
  async function defaultWeight(parentId: string | null): Promise<number> {
    const sibs = await repo.getChildren(parentId);
    return sibs.length ? sibs.reduce((s, x) => s + x.weight, 0) / sibs.length : 1;
  }

  async function create(input: CreateTaskInput): Promise<Task> {
    const title = input.title.trim();
    if (!title) throw new TaskServiceError('Title is required');
    const parentId = input.parent_id ?? null;
    if (parentId) await mustGet(parentId);
    const stamp = ts();
    const task: Task = {
      id: newId(),
      parent_id: parentId,
      task_type: input.task_type ?? (parentId ? 'task' : 'project'),
      title,
      description: input.description ?? '',
      status: 'todo',
      priority: input.priority ?? 'medium',
      progress_percent: 0,
      weight: input.weight ?? (await defaultWeight(parentId)),
      position: await nextPosition(parentId),
      progress_method: input.progress_method ?? 'equal',
      due_date: input.due_date ?? null,
      created_at: stamp,
      updated_at: stamp,
      completed_at: null,
    };
    await commitWithSnapshots({ putTasks: [task], history: [event(task, 'created', null, title)] }, [task.id]);
    return task;
  }

  async function update(id: string, patch: UpdateTaskInput): Promise<Task> {
    const cur = await mustGet(id);
    if (patch.title !== undefined && !patch.title.trim()) throw new TaskServiceError('Title is required');
    if (patch.progress_percent !== undefined) {
      if ((await repo.getChildren(id)).length) throw new TaskServiceError('Parent progress is derived and cannot be edited');
      if (patch.progress_percent < 0 || patch.progress_percent > 100) throw new TaskServiceError('Progress must be 0-100');
    }
    if (patch.weight !== undefined && (!Number.isFinite(patch.weight) || patch.weight < 0)) {
      throw new TaskServiceError('Weight must be a non-negative number');
    }
    const next: Task = { ...cur, ...patch, title: patch.title?.trim() ?? cur.title, updated_at: ts() };
    const history: HistoryEvent[] = [];
    if (next.priority !== cur.priority) history.push(event(next, 'priority_changed', cur.priority, next.priority));
    if (next.due_date !== cur.due_date) history.push(event(next, 'deadline_changed', cur.due_date, next.due_date));
    if (next.weight !== cur.weight) history.push(event(next, 'weight_changed', cur.weight, next.weight));
    if (
      next.title !== cur.title ||
      next.description !== cur.description ||
      next.progress_percent !== cur.progress_percent ||
      next.progress_method !== cur.progress_method
    ) {
      history.push(event(next, 'edited', cur.title, next.title));
    }
    if (!history.length) return cur;
    await commitWithSnapshots({ putTasks: [next], history }, [id]);
    return next;
  }

  /** Status is always changed manually; never cascades to ancestors or descendants. */
  async function setStatus(id: string, status: Status, opts: { confirmIncomplete?: boolean } = {}): Promise<Task> {
    const cur = await mustGet(id);
    if (cur.status === status) return cur;
    if (status === 'completed' && !opts.confirmIncomplete) {
      const incomplete = getDescendants(await repo.getAllTasks(), id).filter((d) => d.status !== 'completed').length;
      if (incomplete > 0) throw new ConfirmationRequiredError(incomplete);
    }
    const stamp = ts();
    const next: Task = {
      ...cur,
      status,
      updated_at: stamp,
      completed_at: status === 'completed' ? stamp : null,
    };
    const history = [event(next, 'status_changed', cur.status, status)];
    if (status === 'completed') history.push(event(next, 'completed', null, null));
    if (cur.status === 'completed') history.push(event(next, 'reopened', null, null));
    await commitWithSnapshots({ putTasks: [next], history }, [id]);
    return next;
  }

  /** Move to newParentId at index (default: end). Subtree is untouched because only parent_id changes. */
  async function move(id: string, newParentId: string | null, index?: number): Promise<Task> {
    const cur = await mustGet(id);
    if (newParentId) await mustGet(newParentId);
    if (wouldCreateCycle(indexTasks(await repo.getAllTasks()), id, newParentId)) {
      throw new TaskServiceError('Cannot move a task into itself or its own descendant');
    }
    const oldParent = cur.parent_id;
    const target = (await repo.getChildren(newParentId)).filter((t) => t.id !== id);
    const at = Math.min(Math.max(index ?? target.length, 0), target.length);
    const moved: Task = { ...cur, parent_id: newParentId, updated_at: ts() };
    target.splice(at, 0, moved);
    const puts: Task[] = target.map((t, i) => (t.position === i && t.id !== id ? t : { ...t, position: i }));
    if (oldParent !== newParentId) {
      const old = (await repo.getChildren(oldParent)).filter((t) => t.id !== id);
      old.forEach((t, i) => t.position !== i && puts.push({ ...t, position: i }));
    }
    const history = oldParent !== newParentId ? [event(moved, 'moved', oldParent, newParentId)] : [];
    const touched = [id, ...(oldParent ? [oldParent] : [])];
    await commitWithSnapshots({ putTasks: puts, history }, touched);
    return puts.find((t) => t.id === id)!;
  }

  /** Reorder siblings under one parent; orderedIds must be exactly the current children. */
  async function reorder(parentId: string | null, orderedIds: string[]): Promise<void> {
    const sibs = await repo.getChildren(parentId);
    const same = sibs.length === orderedIds.length && sibs.every((s) => orderedIds.includes(s.id));
    if (!same) throw new TaskServiceError('Reorder list must contain exactly the current siblings');
    const byId = new Map(sibs.map((s) => [s.id, s]));
    const puts = orderedIds.map((id, i) => ({ ...byId.get(id)!, position: i })).filter((t) => t.position !== byId.get(t.id)!.position);
    if (puts.length) await repo.commit({ putTasks: puts });
  }

  /** Deletes the task and all descendants atomically. Callers must have confirmed with the user. */
  async function remove(id: string): Promise<{ deleted: number }> {
    const cur = await mustGet(id);
    const subtree = await repo.getSubtree(id);
    const history = [event(cur, 'deleted', subtree.length - 1, null)];
    await commitWithSnapshots({ deleteTaskIds: subtree.map((t) => t.id), history }, cur.parent_id ? [cur.parent_id] : []);
    return { deleted: subtree.length };
  }

  /**
   * Deep-copies a subtree. Copies start as 'todo' with fresh ids.
   * Without `to` the copy sits next to the original; with `to` it becomes a child of `to.parentId` (null = top level).
   */
  async function duplicate(id: string, to?: { parentId: string | null }): Promise<Task> {
    const subtree = await repo.getSubtree(id);
    const ids = new Map(subtree.map((t) => [t.id, newId()]));
    const stamp = ts();
    const copies = subtree.map<Task>((t) => ({
      ...t,
      id: ids.get(t.id)!,
      parent_id: t.id === id ? t.parent_id : ids.get(t.parent_id!)!,
      title: t.id === id && !to ? `${t.title} (copy)` : t.title,
      status: 'todo',
      completed_at: null,
      created_at: stamp,
      updated_at: stamp,
    }));
    const copyRoot = copies[0];
    if (to) {
      if (to.parentId) await mustGet(to.parentId);
      copyRoot.parent_id = to.parentId;
    }
    copyRoot.position = await nextPosition(copyRoot.parent_id);
    await commitWithSnapshots(
      { putTasks: copies, history: copies.map((c) => event(c, 'created', null, c.title)) },
      copies.map((c) => c.id),
    );
    return copyRoot;
  }

  /** Rescale a parent's children weights to sum to 100 (explicit user action; ratios preserved). */
  async function normalizeChildWeights(parentId: string | null): Promise<void> {
    const kids = await repo.getChildren(parentId);
    const total = kids.reduce((s, k) => s + k.weight, 0);
    const scaled = kids.map((k) => ({ ...k, weight: total > 0 ? (k.weight / total) * 100 : 100 / kids.length, updated_at: ts() }));
    const history = scaled.flatMap((k, i) =>
      Math.abs(k.weight - kids[i].weight) > EPS ? [event(k, 'weight_changed', kids[i].weight, k.weight)] : [],
    );
    await commitWithSnapshots({ putTasks: scaled, history }, parentId ? [parentId] : kids.map((k) => k.id));
  }

  return { create, update, setStatus, move, reorder, remove, duplicate, normalizeChildWeights };
}

export type TaskService = ReturnType<typeof createTaskService>;
