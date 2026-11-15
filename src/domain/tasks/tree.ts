import type { Task } from './types';

export type TaskIndex = ReadonlyMap<string, Task>;

export function indexTasks(tasks: readonly Task[]): TaskIndex {
  return new Map(tasks.map((t) => [t.id, t]));
}

export function childrenMap(tasks: readonly Task[]): Map<string | null, Task[]> {
  const map = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const list = map.get(t.parent_id);
    if (list) list.push(t);
    else map.set(t.parent_id, [t]);
  }
  for (const list of map.values()) list.sort((a, b) => a.position - b.position);
  return map;
}

/** All descendants of rootId (excluding root). Iterative so depth is unbounded. */
export function getDescendants(tasks: readonly Task[], rootId: string): Task[] {
  const kids = childrenMap(tasks);
  const out: Task[] = [];
  const stack = [...(kids.get(rootId) ?? [])];
  while (stack.length) {
    const t = stack.pop()!;
    out.push(t);
    stack.push(...(kids.get(t.id) ?? []));
  }
  return out;
}

/** Ancestor ids from nearest parent up to the root. Stops if a cycle is detected. */
export function getAncestorIds(index: TaskIndex, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let cur = index.get(id)?.parent_id ?? null;
  while (cur && !seen.has(cur)) {
    out.push(cur);
    seen.add(cur);
    cur = index.get(cur)?.parent_id ?? null;
  }
  return out;
}

/** True if moving taskId under newParentId would create a cycle. */
export function wouldCreateCycle(index: TaskIndex, taskId: string, newParentId: string | null): boolean {
  if (newParentId === null) return false;
  if (newParentId === taskId) return true;
  return getAncestorIds(index, newParentId).includes(taskId);
}

/** Detect duplicates, dangling parents and cycles (used to validate imports). */
export function findIntegrityErrors(tasks: readonly Task[]): string[] {
  const errors: string[] = [];
  const index = indexTasks(tasks);
  if (index.size !== tasks.length) errors.push('Duplicate task ids');
  for (const t of tasks) {
    if (t.parent_id !== null && !index.has(t.parent_id)) errors.push(`Task ${t.id} has missing parent ${t.parent_id}`);
    if (t.parent_id === t.id) errors.push(`Task ${t.id} is its own parent`);
  }
  for (const t of tasks) {
    const seen = new Set<string>();
    let cur: string | null = t.id;
    while (cur) {
      if (seen.has(cur)) {
        errors.push(`Cycle detected involving ${t.id}`);
        break;
      }
      seen.add(cur);
      cur = index.get(cur)?.parent_id ?? null;
    }
  }
  return errors;
}
