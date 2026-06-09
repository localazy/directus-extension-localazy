import type { DeepPartial, Field } from '@directus/types';

export type MetaUpdate = { field: string; special: string[] };
export type HealActions = { missing: DeepPartial<Field>[]; metaUpdates: MetaUpdate[] };

/**
 * Diff field declarations against what Directus' fields store reports and return the
 * write actions the healer should perform. Pure — no I/O, no store reads — so it can
 * be unit-tested without mounting Pinia or the Directus SDK.
 *
 * The two action lists reflect the two routes the installer uses:
 *   - `missing` → POST `/fields/{collection}` (create the missing field)
 *   - `metaUpdates` → PATCH `/fields/{collection}/{field}` (reconcile drifted `meta.special`)
 *
 * `meta.special` reconciliation is the regression-prone path: older Localazy installs
 * have boolean rows in `directus_fields` without `cast-boolean`, which on MySQL surfaces
 * as raw `1`/`0` in `<v-select>` (SQLite happens to coerce and hides the bug locally).
 * The healer is what brings those installs up to spec on next boot.
 */
export function computeFieldHealActions(declared: DeepPartial<Field>[], existing: Field[]): HealActions {
  const missing: DeepPartial<Field>[] = [];
  const metaUpdates: MetaUpdate[] = [];
  for (const field of declared) {
    if (!field.field) continue;
    const match = existing.find((ef) => ef.field === field.field);
    if (!match) {
      missing.push(field);
      continue;
    }
    const declaredSpecial = field.meta?.special ?? [];
    const existingSpecial = match.meta?.special ?? [];
    if (!specialEqual(declaredSpecial, existingSpecial)) {
      metaUpdates.push({ field: field.field, special: declaredSpecial });
    }
  }
  return { missing, metaUpdates };
}

export function specialEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}
