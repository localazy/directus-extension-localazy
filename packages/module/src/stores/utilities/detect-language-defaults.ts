import type { AppCollection, Field } from '@directus/types';
import type { Settings } from '@localazy/directus-common';

/**
 * Looks for the conventional Directus i18n layout and returns the matching seed values
 * for `localazy_settings`. The Project Setup page used to compute this in a `watchEffect`
 * that mutated `edits` directly, which flipped `changesExist=true` against the empty
 * store-side defaults — see `localazy-installer-store.ts` for the call site.
 *
 * Conventions matched:
 *   - a user (non-`directus_*`, non-`localazy_*`) collection named `languages`
 *     (case-insensitive),
 *   - a string field on that collection named `code` (case-insensitive).
 *
 * Returns the matched subset; either or both keys may be absent when nothing matches.
 */
export function detectLanguageDefaults(
  collections: AppCollection[],
  getFieldsForCollection: (collection: string) => Field[],
): Partial<Settings> {
  const updates: Partial<Settings> = {};
  const languageCollection = collections.find(
    (c) => !c.collection.startsWith('directus_') && !c.collection.startsWith('localazy_') && c.collection.toLowerCase() === 'languages',
  );
  if (!languageCollection) return updates;
  updates.language_collection = languageCollection.collection;

  const codeField = getFieldsForCollection(languageCollection.collection).find(
    (f) => f.type === 'string' && f.field.toLowerCase() === 'code',
  );
  if (codeField) {
    updates.language_code_field = codeField.field;
  }
  return updates;
}
