import { Item } from '@directus/types';
import { uniqWith } from 'lodash';
import { LocalazyCollectionItem } from '../../models/localazy-content';

/**
 * Shape of the PATCH body the orchestrator builds for one collection item, keyed by
 * translation field. Mirrors Directus' relational-update format — a per-field bucket
 * with `create` and `update` arrays.
 */
export type TranslationPayload = {
  [collection: string]: {
    update?: Item[];
    create?: Item[];
  };
};

type MergeOptions = {
  localazyItem: LocalazyCollectionItem;
  translationItem?: Partial<Item>;
  language: string;
  languageCodeField: string;
  type: 'update' | 'create';
  value: Record<string, unknown>;
};

const areDirectusItemsEqual = (a: Item, b: Item) => a.id === b.id && a.id !== undefined;
const areCreateItemsEqual = (a: Item, b: Item, languagesCodeField: string) => a[languagesCodeField] === b[languagesCodeField];

function resolveStagedItem(payload: TranslationPayload, data: MergeOptions) {
  const { localazyItem, translationItem, type, language, languageCodeField } = data;

  const stagedItems = payload[localazyItem.translationField]?.[type];
  if (!stagedItems) {
    return undefined;
  }

  if (type === 'create') {
    // For the given translation field, we will always create one new item at most the given language
    return stagedItems.find((d: Item) => d[languageCodeField] === language);
  }
  return stagedItems.find((d: Item) => d.id === translationItem?.id);
}

/**
 * Merge a single (field, language, value) write into an in-progress translation payload.
 * Mutates `payload` for convenience and returns it for chained-call ergonomics. Uses
 * `uniqWith` so re-merging an identical create / update is idempotent.
 */
export const mergeTranslationPayload = (payload: TranslationPayload, data: MergeOptions) => {
  const { localazyItem, translationItem, type, value } = data;
  const stagedItem = resolveStagedItem(payload, data);

  const entryItem = {
    ...(stagedItem || translationItem || {}),
    ...value,
  };
  const currentData = payload[localazyItem.translationField]?.[type] || [];

  if (type === 'create') {
    payload[localazyItem.translationField] = {
      ...(payload[localazyItem.translationField] || {}),
      create: uniqWith([entryItem, ...currentData], (a, b) => areCreateItemsEqual(a, b, data.languageCodeField)),
    };
  } else {
    payload[localazyItem.translationField] = {
      ...(payload[localazyItem.translationField] || {}),
      update: uniqWith([entryItem, ...currentData], areDirectusItemsEqual),
    };
  }

  return payload;
};

/**
 * Resolves the language code from a translation row's FK field. Directus expands
 * relations into objects, but legacy callers may pass the bare string — accept both.
 * Exported so the logic can be tested without standing up the Pinia stores.
 */
export function extractLanguageCode(fkValue: unknown, languageCodeField: string): string | undefined {
  if (typeof fkValue === 'string') {
    return fkValue;
  }
  if (fkValue && typeof fkValue === 'object') {
    const codeValue = (fkValue as Record<string, unknown>)[languageCodeField];
    return typeof codeValue === 'string' ? codeValue : undefined;
  }
  return undefined;
}
