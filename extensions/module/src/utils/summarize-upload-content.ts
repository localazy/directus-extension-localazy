import { TranslatableContent } from '../../../common/models/translatable-content';

export type UploadContentSummary = {
  /** Number of distinct items (collection rows) being uploaded across all collections. */
  items: number;
  /** Number of distinct collections contributing at least one item. */
  collections: number;
  /** Number of source-language string entries that will be sent (post-filter). */
  sourceLangEntries: number;
  /**
   * Subset of `sourceLangEntries` whose string value is non-empty after trimming
   * whitespace. Localazy's `import.json` drops blank values server-side, so this
   * is the count that ultimately materialises as keys in the Localazy project.
   */
  nonEmptySourceLangEntries: number;
  /**
   * Number of translation-language string entries that will be sent (post-filter).
   * Excludes source-language entries; sums across all non-source languages.
   */
  translationEntries: number;
  /** Subset of `translationEntries` whose string value is non-empty after trimming whitespace. */
  nonEmptyTranslationEntries: number;
};

/**
 * The on-wire content is deeper than `TranslatableContent`'s declared 2-level
 * `KeyValueEntry` shape (the runtime structure is 4 levels: collection → item → field →
 * value). The traversal helpers operate on the runtime shape directly, so we use a
 * recursive permissive type internally rather than re-typing `KeyValueEntry` (which
 * would ripple across the codebase).
 */
type NestedNode = string | number | null | undefined | NestedNode[] | { [key: string]: NestedNode };

type LeafCounts = {
  total: number;
  nonEmpty: number;
};

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
  const sourceCounts: LeafCounts = { total: 0, nonEmpty: 0 };
  const translationCounts: LeafCounts = { total: 0, nonEmpty: 0 };

  countEntries(content.sourceLanguage as Record<string, NestedNode>, itemsByCollection, sourceCounts);

  Object.entries(content.otherLanguages).forEach(([, langContent]) => {
    countEntries(langContent as Record<string, NestedNode>, itemsByCollection, translationCounts);
  });

  let totalItems = 0;
  itemsByCollection.forEach((ids) => {
    totalItems += ids.size;
  });

  return {
    items: totalItems,
    collections: itemsByCollection.size,
    sourceLangEntries: sourceCounts.total,
    nonEmptySourceLangEntries: sourceCounts.nonEmpty,
    translationEntries: translationCounts.total,
    nonEmptyTranslationEntries: translationCounts.nonEmpty,
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
function countEntries(langContent: Record<string, NestedNode>, itemsByCollection: Map<string, Set<string>>, counts: LeafCounts) {
  Object.entries(langContent).forEach(([topKey, topValue]) => {
    if (topKey.startsWith('@meta:')) return;
    if (topKey === 'translation_string') {
      accumulateLeafCounts(topValue, counts);
      return;
    }
    if (topValue && typeof topValue === 'object' && !Array.isArray(topValue)) {
      const collectionItems = itemsByCollection.get(topKey) || new Set<string>();
      Object.entries(topValue).forEach(([itemId, itemValue]) => {
        collectionItems.add(itemId);
        accumulateLeafCounts(itemValue, counts);
      });
      itemsByCollection.set(topKey, collectionItems);
    }
  });
}

/**
 * Walk the value tree adding to `counts.total` for every leaf string and to
 * `counts.nonEmpty` for every leaf whose trimmed value is non-empty. `@meta:` keys are
 * skipped to mirror the existing payload contract.
 */
function accumulateLeafCounts(value: NestedNode, counts: LeafCounts): void {
  if (typeof value === 'string') {
    counts.total += 1;
    if (value.trim() !== '') counts.nonEmpty += 1;
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  Object.entries(value).forEach(([k, child]) => {
    if (k.startsWith('@meta:')) return;
    accumulateLeafCounts(child, counts);
  });
}
