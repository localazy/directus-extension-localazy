import { DeprecationKeyProjector } from '../../../../../common/services/orchestrator/automated-deprecation-pipeline';

/**
 * Projector for the collection-items deletion path. Walks
 * `importContent.collections.get(collection)` and emits the Localazy key id for every
 * key belonging to a deleted Directus item across all languages.
 *
 * Closes over `collection` so the deprecation pipeline can call a uniform
 * `(input) => string[]` strategy without learning about Directus collection names.
 */
export function projectCollectionDeprecationKeys(collection: string): DeprecationKeyProjector {
  return ({ importContent, itemIds }) => {
    const keysForCollection = importContent.collections.get(collection);
    const localazyKeysForDeprecation = new Set<string>();
    Object.entries(keysForCollection?.items || {}).forEach(([directusId, localazyItemsInLanguage]) => {
      if (directusId && itemIds.includes(directusId)) {
        localazyItemsInLanguage.forEach((localazyItem) => {
          localazyItem.items.forEach((item) => {
            localazyKeysForDeprecation.add(item.localazyKey.id);
          });
        });
      }
    });
    return Array.from(localazyKeysForDeprecation);
  };
}

/**
 * Projector for the translation-strings deletion path. Each deleted Directus string
 * has one Localazy key per language; we emit them all.
 */
export const projectTranslationStringsDeprecationKeys: DeprecationKeyProjector = ({ importContent, itemIds }) => {
  const deletedKeys = new Set<string>();
  importContent.translationStrings.forEach((translationString) => {
    if (itemIds.includes(translationString.directusId)) {
      Object.values(translationString.localazyKeys).forEach((localazyKey) => {
        deletedKeys.add(localazyKey.id);
      });
    }
  });
  return Array.from(deletedKeys);
};
