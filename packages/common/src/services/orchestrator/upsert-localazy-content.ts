import { Item } from '@directus/types';
import { isEqual } from 'lodash';
import {
  LocalazyCollectionBlock,
  LocalazyCollectionItem,
  LocalazyContent,
  LocalazyItemsInLanguage,
  LocalazyTranslationStringBlock,
} from '../../models/localazy-content';
import { Settings } from '../../models/collections-data/settings';
import { createAsyncQueue } from '../../utilities/async-queue';
import { TranslationStringsService } from '../translation-strings-service';
import { ErrorSink, ProgressSink, ResolveLanguageFkField } from './ports';
import { DirectusApi } from '../../interfaces/directus-api';
import { extractLanguageCode, mergeTranslationPayload, TranslationPayload } from './translation-payload';
import { WrittenTriple } from './written-triple';

/**
 * Stable progress-message ids the orchestrator's upsert step emits. Module-side adapters
 * map these strings to `ProgressTrackerId` enum values so the progress modal's de-dupe
 * semantics (replace-by-id) work as before — without coupling common code to the module's
 * enum. Future server-side consumers route the same ids to their own logging / activity
 * surface.
 */
export const UpsertProgressIds = {
  UPDATING_DIRECTUS_COLLECTION: 'updating-directus-collection' as const,
  UPDATING_TRANSLATION_STRINGS: 'updating-translation-strings' as const,
  UPDATING_DIRECTUS_COLLECTION_ERROR: 'updating-directus-collection-error' as const,
};

type CreatePayloadForTranslationItemInput = {
  collectionItem: Item;
  localazyItem: LocalazyCollectionItem;
  language: string;
  currentPayload: TranslationPayload;
  languageFkField: string;
  languageCodeField: string;
};

function createPayloadForTranslationItem(input: CreatePayloadForTranslationItemInput) {
  const { collectionItem, localazyItem, language, currentPayload, languageFkField, languageCodeField } = input;
  const translationItem = collectionItem[localazyItem.translationField]?.find((data: Record<string, unknown>) => {
    const code = extractLanguageCode(data[languageFkField], languageCodeField);
    return code === language;
  });
  const common = {
    localazyItem,
    translationItem,
    language,
    languageCodeField: languageFkField,
  };
  const isCreateOperation = translationItem === undefined;

  if (translationItem) {
    mergeTranslationPayload(currentPayload, {
      ...common,
      type: 'update',
      value: {
        [localazyItem.field]: localazyItem.value,
      },
    });
  } else {
    mergeTranslationPayload(currentPayload, {
      ...common,
      type: 'create',
      value: {
        [languageFkField]: language,
        [localazyItem.field]: localazyItem.value,
      },
    });
  }
  return {
    currentPayload,
    isCreateOperation,
  };
}

function madeUpdateChanges(updateTranslationFields: Set<string>, payload: TranslationPayload, collectionItem: Item) {
  return (
    updateTranslationFields.size > 0 &&
    Array.from(updateTranslationFields.values()).some((field) => {
      const updatePayloadForField = payload[field]?.update || [];
      const collectionItemForField = collectionItem[field] || [];
      return updatePayloadForField.some((item) => {
        const identicalCollectionItemForFieldItem = collectionItemForField.find((i: unknown) => isEqual(i, item));
        return identicalCollectionItemForFieldItem === undefined;
      });
    })
  );
}

type BuildItemUpsertInput = {
  itemsInCollection: Item[];
  itemId: string | number;
  translations: LocalazyItemsInLanguage[];
  translationFieldFkMap: Map<string, string>;
  languageCodeField: string;
};

type BuiltItemUpsert = {
  /**
   * Every `(lang, keyId, event)` triple this item's translations contribute. Reported to
   * the caller's `onWritten` after the PATCH resolves, or `onFailed` if it throws — so the
   * cursor can advance on success and hold (retry) on failure. PATCH-then-mark.
   */
  triples: WrittenTriple[];
  payload: TranslationPayload;
  /** False for an idempotent no-op (local row already matches) — skip the PATCH, still mark written. */
  shouldWrite: boolean;
};

/**
 * Pure builder — computes the translation payload + the contributing triples for one item.
 * Deliberately does NO I/O so the caller owns the PATCH (and can route the triples to
 * `onWritten` vs `onFailed` depending on the outcome).
 */
function buildItemUpsert(input: BuildItemUpsertInput): BuiltItemUpsert {
  const { itemsInCollection, itemId, translations, translationFieldFkMap, languageCodeField } = input;
  // Stringify both sides — `+id` returns NaN for UUID primary keys, and NaN === NaN is
  // false, so the strict numeric equality used previously silently failed for any
  // installation with UUID-keyed collections.
  const collectionItem = itemsInCollection.find((i: Item) => String(i.id) === String(itemId));
  let payload: TranslationPayload = {};
  const updateTranslationFields: Set<string> = new Set();
  let somethingToCreate = false;
  const triples: WrittenTriple[] = [];

  if (!collectionItem) {
    return { triples, payload, shouldWrite: false };
  }
  translations.forEach((translation) => {
    translation.items.forEach((item) => {
      const languageFkField = translationFieldFkMap.get(item.translationField) || 'languages_code';
      const result = createPayloadForTranslationItem({
        collectionItem,
        localazyItem: item,
        language: translation.language,
        currentPayload: payload,
        languageFkField,
        languageCodeField,
      });
      payload = result.currentPayload;
      triples.push({
        language: translation.language,
        keyId: item.localazyKey.id,
        event: item.localazyKey.event,
      });
      if (result.isCreateOperation) {
        somethingToCreate = true;
      } else {
        updateTranslationFields.add(item.translationField);
      }
    });
  });
  const someUpdateChanges = madeUpdateChanges(updateTranslationFields, payload, collectionItem);
  return { triples, payload, shouldWrite: someUpdateChanges || somethingToCreate };
}

type UpsertItemsFromSingleCollectionInput = {
  collection: string;
  content: LocalazyCollectionBlock;
  settings: Settings;
  directusApi: DirectusApi;
  resolveLanguageFkField: ResolveLanguageFkField;
  progress: ProgressSink;
  onDirectusError: ErrorSink;
  onWritten?: (triples: WrittenTriple[]) => void;
  onFailed?: (triples: WrittenTriple[]) => void;
};

async function upsertItemsFromSingleCollection(input: UpsertItemsFromSingleCollectionInput) {
  const { collection, content, settings, directusApi, resolveLanguageFkField, progress, onDirectusError, onWritten, onFailed } = input;

  try {
    // Build a map of translation field -> FK column for the language relation, and ask
    // Directus to expand each language reference (`${field}.${fk}.*`) so the FK column
    // hands us an object we can pull `language_code_field` out of.
    const translationFieldFkMap = new Map<string, string>();
    const fields: string[] = ['id'];
    content.translationFields.forEach((field) => {
      const fkField = resolveLanguageFkField(collection, field, settings.language_collection);
      translationFieldFkMap.set(field, fkField);
      fields.push(`${field}.*`);
      fields.push(`${field}.${fkField}.*`);
    });

    const itemsInCollection = await directusApi.fetchDirectusItems(collection, {
      fields,
      limit: -1,
    });

    // for...of awaits each iteration. The previous forEach(async ...) was fire-and-forget,
    // so this function used to return before the upserts ran — errors went unhandled and
    // the caller's progress tracker raced ahead.
    const entries = Object.entries(content.items);
    for (let index = 0; index < entries.length; index += 1) {
      const [itemId, translations] = entries[index]!;
      progress({
        id: UpsertProgressIds.UPDATING_DIRECTUS_COLLECTION,
        message: `Updating ${collection} collection (${index + 1}/${entries.length})`,
        mode: 'upsert',
      });

      const built = buildItemUpsert({
        itemsInCollection,
        itemId,
        translations,
        translationFieldFkMap,
        languageCodeField: settings.language_code_field,
      });
      try {
        if (built.shouldWrite) {
          await directusApi.updateDirectusItem(collection, itemId, built.payload);
        }
        // PATCH-then-mark: only advance the cursor after the write resolves (or for an
        // idempotent no-op, where the local row already matches). A thrown PATCH skips
        // this and routes the same triples to `onFailed` so they're retried next run.
        if (built.triples.length > 0 && onWritten) {
          onWritten(built.triples);
        }
      } catch (e: unknown) {
        // Attach where it failed so the UI can deep-link: the PATCH targets the parent
        // `collection` + `itemId`; languages come from the batch's write triples.
        const languages = [...new Set(built.triples.map((t) => t.language))];
        onDirectusError(e, { collection, itemId, languages });
        if (built.triples.length > 0 && onFailed) {
          onFailed(built.triples);
        }
        progress({
          id: UpsertProgressIds.UPDATING_DIRECTUS_COLLECTION_ERROR,
          message: `Error updating ${collection} collection (${index + 1}/${entries.length})`,
          level: 'error',
          mode: 'upsert',
        });
      }
    }
  } catch (e: unknown) {
    onDirectusError(e);
    progress({
      id: UpsertProgressIds.UPDATING_DIRECTUS_COLLECTION_ERROR,
      message: `Error updating ${collection} collection`,
      level: 'error',
      mode: 'upsert',
    });
  }
}

type UpsertTranslationStringsInput = {
  data: LocalazyTranslationStringBlock[];
  directusApi: DirectusApi;
  progress: ProgressSink;
  onDirectusError: ErrorSink;
  onWritten?: (triples: WrittenTriple[]) => void;
  onFailed?: (triples: WrittenTriple[]) => void;
};

/**
 * Persist incoming translation-string blocks to Directus. PATCH-then-mark: only emit the
 * triples after the underlying call resolves. The `TranslationStringsService` handles the
 * actual Directus side (legacy translations collection vs dedicated `localazy_translation_strings`).
 */
async function upsertTranslationStrings(input: UpsertTranslationStringsInput): Promise<void> {
  const { data, directusApi, progress, onDirectusError, onWritten, onFailed } = input;
  if (data.length === 0) {
    return;
  }

  progress({
    id: UpsertProgressIds.UPDATING_TRANSLATION_STRINGS,
    message: `Updating ${data.length} translation ${data.length === 1 ? 'string' : 'strings'}`,
    mode: 'upsert',
  });

  // Build the triples up front so they're available on both branches: advance the cursor
  // via `onWritten` on success, hold it via `onFailed` on failure (PATCH-then-mark).
  const triples: WrittenTriple[] = [];
  data.forEach((block) => {
    Object.entries(block.localazyKeys).forEach(([language, localazyKey]) => {
      triples.push({ language, keyId: localazyKey.id, event: localazyKey.event });
    });
  });

  try {
    const translationStringsService = new TranslationStringsService(directusApi);
    await translationStringsService.upsertTranslationStrings(data);
    if (triples.length > 0 && onWritten) {
      onWritten(triples);
    }
  } catch (e: unknown) {
    onDirectusError(e);
    if (triples.length > 0 && onFailed) {
      onFailed(triples);
    }
  }
}

export type UpsertFromLocalazyContentInput = {
  contentItems: LocalazyContent;
  settings: Settings;
  directusApi: DirectusApi;
  resolveLanguageFkField: ResolveLanguageFkField;
  progress: ProgressSink;
  onDirectusError: ErrorSink;
  /**
   * Invoked once per item with the list of `(lang, keyId, event)` triples that were
   * successfully written. The orchestrator uses this to advance the in-memory cursor
   * and trigger throttled flushes. Triples are reported in batches per item, not per
   * key, to keep the callback overhead off the hot loop.
   */
  onWritten?: (triples: WrittenTriple[]) => void;
  /**
   * Invoked once per item/translation-string batch whose write FAILED, with the same
   * triples `onWritten` would have received on success. The orchestrator uses the failed
   * events to hold the per-language watermark below them so the keys are retried next run.
   */
  onFailed?: (triples: WrittenTriple[]) => void;
};

/**
 * Persist all incoming Localazy content (collection rows + translation strings) to
 * Directus. Each collection is queued as a single async task and run sequentially with a
 * 150 ms delay between tasks (matches the original module-side behaviour).
 */
export async function upsertFromLocalazyContent(input: UpsertFromLocalazyContentInput): Promise<void> {
  const { contentItems, settings, directusApi, resolveLanguageFkField, progress, onDirectusError, onWritten, onFailed } = input;
  const { add, execute } = createAsyncQueue();
  contentItems.collections.forEach((content, collection) => {
    add(async () =>
      upsertItemsFromSingleCollection({
        collection,
        content,
        settings,
        directusApi,
        resolveLanguageFkField,
        progress,
        onDirectusError,
        onWritten,
        onFailed,
      }),
    );
  });
  add(async () =>
    upsertTranslationStrings({
      data: Array.from(contentItems.translationStrings.values()),
      directusApi,
      progress,
      onDirectusError,
      onWritten,
      onFailed,
    }),
  );

  await execute({ delayBetween: 150 });
}
