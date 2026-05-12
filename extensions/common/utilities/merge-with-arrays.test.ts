import { describe, it, expect } from 'vitest';
import { mergeWithArrays } from './merge-with-arrays';

describe('mergeWithArrays', () => {
  it('concatenates arrays instead of replacing them', () => {
    const target = { tags: ['a', 'b'] };
    const source = { tags: ['c'] };
    const result = mergeWithArrays(target, source);
    expect(result.tags).toEqual(['a', 'b', 'c']);
  });

  it('falls back to lodash merge semantics for non-array values', () => {
    const target = { config: { mode: 'dev', timeout: 100 } };
    const source = { config: { timeout: 200, retries: 3 } };
    const result = mergeWithArrays(target, source);
    expect(result.config).toEqual({ mode: 'dev', timeout: 200, retries: 3 });
  });

  it('merges arrays nested inside objects', () => {
    const target = { groups: { admins: ['alice'] } };
    const source = { groups: { admins: ['bob'] } };
    const result = mergeWithArrays(target, source);
    expect(result.groups.admins).toEqual(['alice', 'bob']);
  });

  it('keeps target keys absent from source', () => {
    const target = { kept: 1, also: [1, 2] };
    const source = { also: [3] };
    const result = mergeWithArrays(target, source);
    expect(result).toEqual({ kept: 1, also: [1, 2, 3] });
  });
});
