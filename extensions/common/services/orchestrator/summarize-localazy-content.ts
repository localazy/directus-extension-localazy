import { LocalazyContent } from '../../models/localazy-content';

export type LocalazyContentSummary = {
  /** Total per-(item, language, field) cells to write. Drives the "N changes" wording. */
  changes: number;
  /** Distinct Directus items that need updating (collection rows + translation-string keys). */
  items: number;
  /** Number of distinct collections receiving updates. */
  collections: number;
  /** Number of distinct languages that have at least one change. */
  languages: number;
};

/**
 * Build the headline summary stats the sync orchestrator emits to the progress modal
 * (e.g. "Found 42 changes across 3 languages — applying to 12 items in 4 collections").
 *
 * Pure and synchronous — extracted so the message arithmetic can be unit-tested without
 * standing up Pinia. The shape mirrors what the design's decision-19 messages reference;
 * counts are intentionally aggregate (no per-language drilldown here — that's reserved
 * for an optional expansion in the modal).
 */
export function summarizeLocalazyContent(content: LocalazyContent): LocalazyContentSummary {
  let changes = 0;
  let items = 0;
  const collections = content.collections.size;
  const languages = new Set<string>();

  content.collections.forEach((block) => {
    items += Object.keys(block.items).length;
    Object.values(block.items).forEach((perLang) => {
      perLang.forEach(({ language, items: localazyItems }) => {
        languages.add(language);
        changes += localazyItems.length;
      });
    });
  });

  content.translationStrings.forEach((block) => {
    items += 1;
    Object.entries(block.translations).forEach(([language]) => {
      languages.add(language);
      changes += 1;
    });
  });

  return { changes, items, collections, languages: languages.size };
}
