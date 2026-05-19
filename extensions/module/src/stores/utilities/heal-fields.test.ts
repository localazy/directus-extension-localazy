import { describe, it, expect } from 'vitest';
import type { DeepPartial, Field } from '@directus/types';
import { computeFieldHealActions, specialEqual } from './heal-fields';

// Tests live alongside the helper to exercise the regression case that surfaced on
// MySQL-backed installs: a boolean field row in `directus_fields` without
// `cast-boolean` in `meta.special` shows raw `1`/`0` in `<v-select>` instead of the
// item labels. The healer's metadata-reconciliation path patches those rows on boot.

// Convenience constructors keep the cases readable.
function field(name: string, special: string[] = []): DeepPartial<Field> {
  return { field: name, meta: { special } };
}
function existingField(name: string, special: string[] = []): Field {
  return { field: name, meta: { special } } as Field;
}

describe('computeFieldHealActions', () => {
  it('returns empty action lists when declared and existing match exactly', () => {
    const declared = [field('automated_import', ['cast-boolean']), field('language_collection')];
    const existing = [existingField('automated_import', ['cast-boolean']), existingField('language_collection')];

    const result = computeFieldHealActions(declared, existing);

    expect(result.missing).toEqual([]);
    expect(result.metaUpdates).toEqual([]);
  });

  it('flags a declared field as missing when Directus has no row for it', () => {
    const declared = [field('automated_import', ['cast-boolean']), field('newly_added_field')];
    const existing = [existingField('automated_import', ['cast-boolean'])];

    const result = computeFieldHealActions(declared, existing);

    expect(result.missing).toEqual([field('newly_added_field')]);
    expect(result.metaUpdates).toEqual([]);
  });

  // The original regression: MySQL installs predating PR 21 stored boolean fields
  // without `cast-boolean`. SQLite happens to coerce `tinyint(1)` → boolean so the
  // bug only surfaces on MySQL — meaning this test is the only line of defence
  // against silently reintroducing the broken state.
  it('patches `meta.special` when the existing row is missing `cast-boolean` on a declared boolean', () => {
    const declared = [field('automated_import', ['cast-boolean'])];
    const existing = [existingField('automated_import', [])];

    const result = computeFieldHealActions(declared, existing);

    expect(result.missing).toEqual([]);
    expect(result.metaUpdates).toEqual([{ field: 'automated_import', special: ['cast-boolean'] }]);
  });

  it('treats `undefined` meta.special on the declared side as an empty array (no false-positive update)', () => {
    const declared: DeepPartial<Field>[] = [{ field: 'plain_string', meta: {} }];
    const existing = [existingField('plain_string', [])];

    const result = computeFieldHealActions(declared, existing);

    expect(result.metaUpdates).toEqual([]);
  });

  it('treats `undefined` meta on the existing side as an empty array (no false-positive update)', () => {
    const declared: DeepPartial<Field>[] = [{ field: 'plain_string', meta: { special: [] } }];
    const existing = [{ field: 'plain_string' } as Field];

    const result = computeFieldHealActions(declared, existing);

    expect(result.metaUpdates).toEqual([]);
  });

  it('ignores ordering when comparing `meta.special` arrays', () => {
    const declared = [field('multi_special', ['cast-boolean', 'no-data'])];
    const existing = [existingField('multi_special', ['no-data', 'cast-boolean'])];

    const result = computeFieldHealActions(declared, existing);

    expect(result.metaUpdates).toEqual([]);
  });

  it('detects when `meta.special` has the right count but different members', () => {
    const declared = [field('drifted', ['cast-boolean'])];
    const existing = [existingField('drifted', ['cast-json'])];

    const result = computeFieldHealActions(declared, existing);

    expect(result.metaUpdates).toEqual([{ field: 'drifted', special: ['cast-boolean'] }]);
  });

  it('handles missing fields and meta updates in a single plan', () => {
    const declared = [field('automated_import', ['cast-boolean']), field('automated_upload', ['cast-boolean']), field('newly_added_field')];
    const existing = [existingField('automated_import', []), existingField('automated_upload', ['cast-boolean'])];

    const result = computeFieldHealActions(declared, existing);

    expect(result.missing).toEqual([field('newly_added_field')]);
    expect(result.metaUpdates).toEqual([{ field: 'automated_import', special: ['cast-boolean'] }]);
  });

  it('skips declared entries that are missing the `field` key (defensive)', () => {
    const declared: DeepPartial<Field>[] = [{ meta: { special: ['cast-boolean'] } }, field('valid_field')];
    const existing: Field[] = [];

    const result = computeFieldHealActions(declared, existing);

    expect(result.missing).toEqual([field('valid_field')]);
    expect(result.metaUpdates).toEqual([]);
  });
});

describe('specialEqual', () => {
  it('returns true for identical arrays', () => {
    expect(specialEqual(['a', 'b'], ['a', 'b'])).toBe(true);
  });

  it('returns true regardless of ordering', () => {
    expect(specialEqual(['a', 'b'], ['b', 'a'])).toBe(true);
  });

  it('returns false when lengths differ', () => {
    expect(specialEqual(['a'], ['a', 'b'])).toBe(false);
  });

  it('returns false when members differ', () => {
    expect(specialEqual(['a', 'b'], ['a', 'c'])).toBe(false);
  });

  it('returns true for two empty arrays', () => {
    expect(specialEqual([], [])).toBe(true);
  });
});
