import { describe, it, expect } from 'vitest';
import type { Field, DeepPartial } from '@directus/types';
import { defaultConfiguration } from './default-configuration';
import { createSettingsFields } from './fields/settings/create';
import { createContentTransferSetupsFields } from './fields/content-transfer-setup/create';
import { createLocalazyDataFields } from './fields/localazy-data/create';
import { createSyncStateFields } from './fields/sync-state/create';

/**
 * Guard test for the installer's heal path.
 *
 * On a fresh install the installer creates the collection and PATCHes `defaultConfiguration()`
 * into the singleton row. On an upgrade — when a new field is added to one of the `create*Fields()`
 * arrays — the installer takes the heal path and only POSTs `/fields/{collection}` with the field
 * declaration; it does NOT re-PATCH `defaultConfiguration()` onto the existing row. The existing
 * row's new column is populated from `schema.default_value` (or NULL if absent).
 *
 * To make the create and heal paths converge, every non-primary-key field in `create*Fields()`
 * must declare a `schema.default_value`, and that value must match the corresponding key in
 * `defaultConfiguration()`. This test enforces both invariants for all three collections, so
 * adding a new field without its config-side counterpart (or with a divergent default) fails CI.
 */

type Section = keyof ReturnType<typeof defaultConfiguration>;

const SECTIONS: Array<{ section: Section; fields: () => Array<DeepPartial<Field>> }> = [
  { section: 'settings', fields: createSettingsFields },
  { section: 'content_transfer_setup', fields: createContentTransferSetupsFields },
  { section: 'localazy_data', fields: createLocalazyDataFields },
  { section: 'sync_state', fields: createSyncStateFields },
];

describe('defaultConfiguration <-> field declarations', () => {
  for (const { section, fields } of SECTIONS) {
    describe(section, () => {
      const fieldDeclarations = fields();
      const config = defaultConfiguration()[section] as Record<string, unknown>;
      const nonPkFields = fieldDeclarations.filter((f) => !f.schema?.is_primary_key);

      it('every non-primary-key field declares schema.default_value', () => {
        const missing = nonPkFields.filter((f) => !f.schema || !('default_value' in f.schema)).map((f) => f.field);
        expect(missing, `fields missing schema.default_value: ${missing.join(', ')}`).toEqual([]);
      });

      it('every field has a matching key in defaultConfiguration with the same value', () => {
        for (const f of nonPkFields) {
          expect(config, `defaultConfiguration().${section} is missing key "${f.field}"`).toHaveProperty(f.field as string);
          expect(
            f.schema?.default_value,
            `schema.default_value for "${f.field}" does not match defaultConfiguration().${section}.${f.field}`,
          ).toEqual(config[f.field as string]);
        }
      });

      it('defaultConfiguration has no keys without a corresponding field declaration', () => {
        const declaredNames = new Set(nonPkFields.map((f) => f.field as string));
        const orphans = Object.keys(config).filter((key) => !declaredNames.has(key));
        expect(orphans, `defaultConfiguration().${section} keys with no field declaration: ${orphans.join(', ')}`).toEqual([]);
      });
    });
  }
});
