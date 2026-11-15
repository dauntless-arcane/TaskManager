import { describe, expect, it } from 'vitest';
import { makeTask as t } from '../test-utils';
import { findIntegrityErrors, getDescendants, indexTasks, wouldCreateCycle } from './tree';

const tasks = [t({ id: 'a' }), t({ id: 'b', parent_id: 'a' }), t({ id: 'c', parent_id: 'b' }), t({ id: 'd' })];

describe('tree', () => {
  it('collects descendants', () => {
    expect(getDescendants(tasks, 'a').map((x) => x.id).sort()).toEqual(['b', 'c']);
  });

  it('prevents cycles', () => {
    const idx = indexTasks(tasks);
    expect(wouldCreateCycle(idx, 'a', 'c')).toBe(true);
    expect(wouldCreateCycle(idx, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(idx, 'c', 'd')).toBe(false);
    expect(wouldCreateCycle(idx, 'c', null)).toBe(false);
  });

  it('flags integrity errors', () => {
    expect(findIntegrityErrors(tasks)).toEqual([]);
    const bad = [t({ id: 'x', parent_id: 'y' }), t({ id: 'y', parent_id: 'x' }), t({ id: 'z', parent_id: 'nope' })];
    const errs = findIntegrityErrors(bad);
    expect(errs.some((e) => e.includes('Cycle'))).toBe(true);
    expect(errs.some((e) => e.includes('missing parent'))).toBe(true);
  });
});
