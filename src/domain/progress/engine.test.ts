import { describe, expect, it } from 'vitest';
import { makeTask as t } from '../test-utils';
import { createProgressCalculator, normalizeWeights } from './engine';

const done = { status: 'completed' as const };

describe('progress engine', () => {
  it('empty parent shows 0%', () => {
    expect(createProgressCalculator([t({ id: 'p' })]).calculate('p')).toBe(0);
  });

  it('equal-child: (80+50+0)/3', () => {
    const tasks = [
      t({ id: 'p', progress_method: 'equal' }),
      t({ id: 'a', parent_id: 'p', progress_percent: 80 }),
      t({ id: 'b', parent_id: 'p', progress_percent: 50 }),
      t({ id: 'c', parent_id: 'p' }),
    ];
    expect(createProgressCalculator(tasks).calculate('p')).toBeCloseTo(43.333, 3);
  });

  it('weighted: 50/30/20 => 55%', () => {
    const tasks = [
      t({ id: 'p', progress_method: 'weighted' }),
      t({ id: 'a', parent_id: 'p', weight: 50, progress_percent: 80 }),
      t({ id: 'b', parent_id: 'p', weight: 30, progress_percent: 50 }),
      t({ id: 'c', parent_id: 'p', weight: 20 }),
    ];
    expect(createProgressCalculator(tasks).calculate('p')).toBeCloseTo(55);
  });

  it('weighted with all-zero weights falls back to equal', () => {
    const tasks = [
      t({ id: 'p', progress_method: 'weighted' }),
      t({ id: 'a', parent_id: 'p', weight: 0, ...done }),
      t({ id: 'b', parent_id: 'p', weight: 0 }),
    ];
    expect(createProgressCalculator(tasks).calculate('p')).toBe(50);
  });

  it('leaf method counts every leaf once, flattening depth', () => {
    const tasks = [
      t({ id: 'p', progress_method: 'leaf' }),
      t({ id: 'a', parent_id: 'p' }),
      t({ id: 'a1', parent_id: 'a', ...done }),
      t({ id: 'a2', parent_id: 'a' }),
      t({ id: 'a3', parent_id: 'a' }),
      t({ id: 'b', parent_id: 'p' }),
    ];
    expect(createProgressCalculator(tasks).calculate('p')).toBe(25);
    expect(createProgressCalculator(tasks, { methodOverride: 'equal' }).calculate('p')).toBeCloseTo(100 / 6);
  });

  it('parent status does not affect derived progress; manual leaf progress is honoured', () => {
    const tasks = [t({ id: 'p', ...done, progress_percent: 99 }), t({ id: 'a', parent_id: 'p', progress_percent: 40 })];
    expect(createProgressCalculator(tasks).calculate('p')).toBe(40);
  });

  it('handles 5000-deep chains without stack overflow', () => {
    const tasks = [t({ id: 'n0' })];
    for (let i = 1; i < 5000; i++) tasks.push(t({ id: `n${i}`, parent_id: `n${i - 1}`, ...(i === 4999 ? done : {}) }));
    expect(createProgressCalculator(tasks).calculate('n0')).toBe(100);
  });

  it('recalculates after add / delete / move', () => {
    const base = [t({ id: 'p' }), t({ id: 'a', parent_id: 'p', ...done }), t({ id: 'b', parent_id: 'p' })];
    expect(createProgressCalculator(base).calculate('p')).toBe(50);
    expect(createProgressCalculator([...base, t({ id: 'c', parent_id: 'p' })]).calculate('p')).toBeCloseTo(33.333, 3);
    expect(createProgressCalculator(base.filter((x) => x.id !== 'b')).calculate('p')).toBe(100);
    expect(createProgressCalculator(base.map((x) => (x.id === 'a' ? { ...x, parent_id: null } : x))).calculate('p')).toBe(0);
  });

  it('breakdown reports contributions', () => {
    const tasks = [
      t({ id: 'p', progress_method: 'weighted' }),
      t({ id: 'a', parent_id: 'p', weight: 3, ...done }),
      t({ id: 'b', parent_id: 'p', weight: 1 }),
    ];
    const b = createProgressCalculator(tasks).breakdown('p');
    expect(b.map((x) => x.contribution)).toEqual([0.75, 0.25]);
  });

  it('normalizeWeights sums to 100', () => {
    expect(normalizeWeights([1, 1, 2])).toEqual([25, 25, 50]);
    expect(normalizeWeights([0, 0])).toEqual([50, 50]);
    expect(normalizeWeights([])).toEqual([]);
  });
});
