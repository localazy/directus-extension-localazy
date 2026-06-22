import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { LocalazyError } from '@localazy/directus-common';
import { AnalyticsService } from '@localazy/directus-common';
import type { DirectusErrorContext } from '@localazy/directus-common';

/**
 * One place a grouped Directus error happened: the parent record the failing PATCH targeted
 * (for a Directus deep-link) plus the languages in that batch. Surfaced in the expandable
 * detail of an error row so the operator can jump straight to the offending item.
 */
export type DirectusErrorOccurrence = { collection: string; itemId: string; languages: string[] };

/**
 * One distinct Directus error plus a `count` of how many times it (in its value-masked
 * form) occurred this run, and the individual `occurrences` (capped) for the expandable
 * detail. Bulk imports fail one row at a time, so without aggregation a single column-length
 * or FK problem produces hundreds of near-identical rows — each carrying the full offending
 * value (often a multi-KB JSON blob). See `normalizeDirectusMessage`.
 */
export type DirectusErrorEntry = { message: string; count: number; occurrences: DirectusErrorOccurrence[] };

/** Max per-error occurrences retained for the expandable detail — bounds memory + DOM. */
const MAX_OCCURRENCES_PER_ERROR = 25;

type Errors = {
  localazy: {
    project: LocalazyError[];
    file: LocalazyError[];
    import: LocalazyError[];
    export: LocalazyError[];
  };
  directus: DirectusErrorEntry[];
};

type CommonParams = {
  userId: string;
  orgId: string;
};

type AddLocalazyError = CommonParams & { type: keyof Errors['localazy'] };

/**
 * Upper bound on distinct Directus error rows kept. A pathological run could otherwise
 * surface thousands of unique messages; past this cap new distinct errors are dropped
 * (existing ones still increment their count), keeping the notice bounded.
 */
const MAX_DISTINCT_DIRECTUS_ERRORS = 50;

/** Hard cap on a normalized message length — bounds both the dedupe key and the rendered row. */
const MAX_DIRECTUS_MESSAGE_LENGTH = 240;

/**
 * Collapse the variable part of a Directus error so otherwise-identical failures group into
 * one counted row. Directus phrases value errors as `Value "<value>" for field "x" in
 * collection "y" is too long.` — the `<value>` differs per row (and is often a huge JSON
 * blob that itself contains quotes), but the actionable part (field, collection, error
 * kind) is identical.
 *
 * Three passes: (1) greedily mask the value in the `Value "…" for field` phrasing — greedy
 * so it spans values containing their own quotes; (2) mask any remaining quoted run of 40+
 * chars (other message shapes); (3) hard-cap the length so a single message can't dominate
 * the dedupe key or blow out the notice. Short quoted tokens (language codes like `"ja"`,
 * field/collection names) survive — they carry the useful signal.
 */
export function normalizeDirectusMessage(message: string): string {
  let normalized = message.replace(/^(Value )".*"( for field )/s, '$1"…"$2');
  normalized = normalized.replace(/"[^"]{40,}"/g, '"…"');
  if (normalized.length > MAX_DIRECTUS_MESSAGE_LENGTH) {
    normalized = `${normalized.slice(0, MAX_DIRECTUS_MESSAGE_LENGTH)}…`;
  }
  return normalized;
}

export const useErrorsStore = defineStore('errorsStore', () => {
  const errors = ref<Errors>({
    localazy: {
      project: [],
      file: [],
      import: [],
      export: [],
    },
    directus: [],
  });

  function addLocalazyError(error: unknown, data: AddLocalazyError) {
    const normalised =
      error instanceof LocalazyError ? error : new LocalazyError('unknown', error instanceof Error ? error.message : String(error), 0);
    errors.value.localazy[data.type].push(normalised);
    // Analytics is fire-and-forget; error tracking shouldn't itself fail and block the flow.
    void AnalyticsService.trackError({
      userId: data.userId,
      orgId: data.orgId,
      message: normalised.message,
      origin: 'Localazy',
      type: data.type,
      errorData: JSON.stringify(normalised, null, 2),
    });
  }

  type DirectusErrorPayload = {
    response?: {
      data?: {
        errors?: Array<{ message: string }>;
      };
    };
    message?: string;
  };

  function extractDirectusMessage(error: unknown): string {
    const e = error as DirectusErrorPayload;
    const firstApiError = e.response?.data?.errors?.[0];
    if (firstApiError?.message) return firstApiError.message;
    if (e.message) return e.message;
    return 'Unknown error';
  }

  /** Append an occurrence to an entry, deduped by collection+itemId and capped. */
  function recordOccurrence(entry: DirectusErrorEntry, context?: DirectusErrorContext) {
    if (!context?.collection || context.itemId === undefined || context.itemId === null) return;
    const itemId = String(context.itemId);
    const collection = context.collection;
    if (entry.occurrences.some((o) => o.collection === collection && o.itemId === itemId)) return;
    if (entry.occurrences.length >= MAX_OCCURRENCES_PER_ERROR) return;
    entry.occurrences.push({ collection, itemId, languages: context.languages ?? [] });
  }

  function addDirectusError(error: unknown, context?: DirectusErrorContext) {
    const message = normalizeDirectusMessage(extractDirectusMessage(error));
    const existing = errors.value.directus.find((entry) => entry.message === message);
    if (existing) {
      existing.count += 1;
      recordOccurrence(existing, context);
      return;
    }
    if (errors.value.directus.length >= MAX_DISTINCT_DIRECTUS_ERRORS) return;
    const entry: DirectusErrorEntry = { message, count: 1, occurrences: [] };
    recordOccurrence(entry, context);
    errors.value.directus.push(entry);
  }

  function resetLocalazyErrors() {
    errors.value.localazy = {
      project: [],
      file: [],
      import: [],
      export: [],
    };
  }

  function resetDirectusErrors() {
    errors.value.directus = [];
  }

  function clearDirectusError(index: number) {
    errors.value.directus.splice(index, 1);
  }

  const localazyErrors = computed(() => errors.value.localazy);
  const directusErrors = computed(() => errors.value.directus);

  const hasLocalazyErrors = computed(() => {
    const { project, file, import: importErrors, export: exportErrors } = errors.value.localazy;
    return project.length > 0 || file.length > 0 || importErrors.length > 0 || exportErrors.length > 0;
  });

  const hasDirectusErrors = computed(() => errors.value.directus.length > 0);

  return {
    localazyErrors,
    directusErrors,
    hasLocalazyErrors,
    hasDirectusErrors,
    addLocalazyError,
    addDirectusError,
    resetLocalazyErrors,
    resetDirectusErrors,
    clearDirectusError,
  };
});
