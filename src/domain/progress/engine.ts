import { childrenMap } from '../tasks/tree';
import type { ProgressMethod, Task } from '../tasks/types';

/**
 * Progress rules (also documented in ARCHITECTURE.md):
 * - Leaf task: completed => 100; otherwise its manual progress_percent (default 0).
 * - Empty parent (no children) is treated as a leaf.
 * - Parents are always derived; their own progress_percent and status are ignored.
 * - 'equal':    mean of immediate children's progress.
 * - 'weighted': sum(w*p)/sum(w) over immediate children; all-zero weights fall back to equal.
 * - 'leaf':     mean of every leaf descendant's progress (each leaf counts once, depth is flattened).
 */
export interface ProgressOptions {
  /** Overrides every task's own method (dashboard mode switch). */
  methodOverride?: ProgressMethod;
}

export interface ProgressBreakdownItem {
  id: string;
  title: string;
  progress: number;
  weight: number;
  /** Share of the parent's progress (0-1) under the active method. */
  contribution: number;
}

export function createProgressCalculator(tasks: readonly Task[], opts: ProgressOptions = {}) {
  const kids = childrenMap(tasks);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const cache = new Map<string, number>();
  const leafCache = new Map<string, number[]>();

  const methodOf = (t: Task): ProgressMethod => opts.methodOverride ?? t.progress_method;
  const leafValue = (t: Task): number => (t.status === 'completed' ? 100 : clamp(t.progress_percent));

  /** Iterative post-order over the subtree so depth is unbounded. */
  function postOrder(rootId: string, skip: (id: string) => boolean): Task[] {
    const order: Task[] = [];
    const stack: Task[] = [byId.get(rootId)!];
    while (stack.length) {
      const t = stack.pop()!;
      if (skip(t.id)) continue;
      order.push(t);
      for (const c of kids.get(t.id) ?? []) stack.push(c);
    }
    return order.reverse();
  }

  function leaves(id: string): number[] {
    for (const t of postOrder(id, (x) => leafCache.has(x))) {
      const c = kids.get(t.id) ?? [];
      leafCache.set(t.id, c.length === 0 ? [leafValue(t)] : c.flatMap((k) => leafCache.get(k.id)!));
    }
    return leafCache.get(id)!;
  }

  function calculate(id: string): number {
    if (!byId.has(id)) throw new Error(`Unknown task ${id}`);
    for (const t of postOrder(id, (x) => cache.has(x))) {
      const c = kids.get(t.id) ?? [];
      let value: number;
      if (c.length === 0) value = leafValue(t);
      else {
        const m = methodOf(t);
        if (m === 'leaf') value = mean(leaves(t.id));
        else {
          const total = c.reduce((s, k) => s + Math.max(0, k.weight), 0);
          value =
            m === 'weighted' && total > 0
              ? c.reduce((s, k) => s + Math.max(0, k.weight) * cache.get(k.id)!, 0) / total
              : mean(c.map((k) => cache.get(k.id)!));
        }
      }
      cache.set(t.id, value);
    }
    return cache.get(id)!;
  }

  function breakdown(id: string): ProgressBreakdownItem[] {
    const t = byId.get(id);
    if (!t) throw new Error(`Unknown task ${id}`);
    const c = kids.get(id) ?? [];
    const m = methodOf(t);
    const total = c.reduce((s, k) => s + Math.max(0, k.weight), 0);
    return c.map((k) => ({
      id: k.id,
      title: k.title,
      progress: calculate(k.id),
      weight: k.weight,
      contribution: m === 'weighted' && total > 0 ? Math.max(0, k.weight) / total : 1 / c.length,
    }));
  }

  return { calculate, breakdown };
}

/** Rescale sibling weights so they sum to 100, preserving ratios. Equal split if all zero. */
export function normalizeWeights(weights: readonly number[]): number[] {
  if (!weights.length) return [];
  const clean = weights.map((w) => Math.max(0, w));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total === 0) return clean.map(() => 100 / clean.length);
  return clean.map((w) => (w / total) * 100);
}

function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function clamp(n: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));
}
