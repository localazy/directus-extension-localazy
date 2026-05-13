import { TranslatableContent } from '../../../common/models/translatable-content';

export type UploadContentSummary = {
  /** Number of distinct items (collection rows) being uploaded across all collections. */
  items: number;
  /** Number of distinct collections contributing at least one item. */
  collections: number;
  /** Number of source-language string entries that will be sent (post-filter). */
  sourceLangEntries: number;
  /**
   * Number of translation-language string entries that will be sent (post-filter).
   * Excludes source-language entries; sums across all non-source languages.
   */
  translationEntries: number;
};

/**
 * The on-wire content is deeper than `TranslatableContent`'s declared 2-level
 * `KeyValueEntry` shape (the runtime structure is 4 levels: collection → item → field →
 * value). The traversal helpers operate on the runtime shape directly, so we use a
 * recursive permissive type internally rather than re-typing `KeyValueEntry` (which
 * would ripple across the codebase).
 */
type NestedNode = string | number | null | undefined | NestedNode[] | { [key: string]: NestedNode };

/**
 * Build the headline summary stats the upload sync orchestrator emits to the progress
 * modal (e.g. "Found N changed items across M collections — pushing N source-lang + K
 * translation entries"). Pure and synchronous — extracted from the orchestrator so the
 * message arithmetic can be unit-tested without standing up Pinia.
 *
 * Item-count caveat: "items" counts every `(collection, itemId)` pair that contributes
 * at least one string in the assembled content, with item id deduplication scoped per
 * collection. Translation strings (top-level `translation_string` key) are not counted
 * here — they are always full-re-pushed and tracked separately.
 */
export function summarizeUploadContent(content: TranslatableContent): UploadContentSummary {
  const itemsByCollection = new Map<string, Set<string>>();
  let sourceLangEntries = 0;
  let translationEntries = 0;

  countEntries(content.sourceLanguage as Record<string, NestedNode>, itemsByCollection, (n) => {
    sourceLangEntries += n;
  });

  Object.entries(content.otherLanguages).forEach(([, langContent]) => {
    countEntries(langContent as Record<string, NestedNode>, itemsByCollection, (n) => {
      translationEntries += n;
    });
  });

  let totalItems = 0;
  itemsByCollection.forEach((ids) => {
    totalItems += ids.size;
  });

  return {
    items: totalItems,
    collections: itemsByCollection.size,
    sourceLangEntries,
    translationEntries,
  };
}

/**
 * Count leaf string entries in one language's KV map while recording per-collection
 * item-id sets. Top-level entries whose key is `translation_string` are counted as
 * entries but their nested structure does NOT contribute to the items-by-collection map
 * (they're tracked separately by the orchestrator and are always full re-push).
 *
 * `@meta:`-prefixed keys are part of the upload payload but represent metadata, not
 * user-visible strings — exclude them from the entry count.
 */
function countEntries(
  langContent: Record<string, NestedNode>,
  itemsByCollection: Map<string, Set<string>>,
  addEntries: (n: number) => void,
) {
  Object.entries(langContent).forEach(([topKey, topValue]) => {
    if (topKey.startsWith('@meta:')) return;
    if (topKey === 'translation_string') {
      addEntries(countLeafStringsExcludingMeta(topValue));
      return;
    }
    if (topValue && typeof topValue === 'object' && !Array.isArray(topValue)) {
      const collectionItems = itemsByCollection.get(topKey) || new Set<string>();
      Object.entries(topValue).forEach(([itemId, itemValue]) => {
        collectionItems.add(itemId);
        addEntries(countLeafStringsExcludingMeta(itemValue));
      });
      itemsByCollection.set(topKey, collectionItems);
    }
  });
}

function countLeafStringsExcludingMeta(value: NestedNode): number {
  if (typeof value === 'string') return 1;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  let n = 0;
  Object.entries(value).forEach(([k, child]) => {
    if (k.startsWith('@meta:')) return;
    n += countLeafStringsExcludingMeta(child);
  });
  return n;
}
