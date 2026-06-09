import { ref, watch, type Ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import type { SyncLogEntry, SyncLogSession } from '@localazy/directus-common';

/**
 * Subset of Directus' `directus_users` row we read here. The columns are intentionally
 * limited — we only need enough to render "first last" or fall back to email; pulling
 * more would just enlarge the response with data the Activity page ignores.
 */
type UserRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

function pickName(user: UserRow): string | null {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  return user.email || null;
}

/**
 * Walk a single session row's `entries` JSON and collect every per-entry
 * `data.user` id. The burst coordinator (PR 64) writes one entry per pipeline run with a
 * structured `data: { user, event, collection, keys, outcome }`; this helper extracts
 * the user ids so they participate in the same batched fetch the session-level
 * `initiator_user` already drives.
 *
 * Tolerant of malformed rows: a JSON-parse failure, a non-array payload, or an entry
 * missing the `data` envelope returns no ids rather than crashing the resolver.
 */
export function collectEntryUserIds(entriesJson: string | null | undefined, sink: Set<string>): void {
  if (!entriesJson) return;
  try {
    const parsed: unknown = JSON.parse(entriesJson);
    if (!Array.isArray(parsed)) return;
    for (const entry of parsed as SyncLogEntry[]) {
      const data = entry.data;
      if (!data) continue;
      const candidate = data.user;
      if (typeof candidate === 'string' && candidate.length > 0) {
        sink.add(candidate);
      }
    }
  } catch {
    // Malformed entries column — fall through. The detail view's own parse will hit
    // the same error and render the empty-state.
  }
}

/**
 * Resolves the human name behind each Directus user id referenced in the supplied
 * sessions — both the session-level `initiator` / `initiator_user` and every per-entry
 * `data.user` inside `entries`. Watches the sessions ref, batches one
 * `/users?filter[id][_in]=...` fetch per fresh set of unmapped ids, and caches the
 * result so subsequent reloads don't re-fetch users already known.
 *
 * Failures are absorbed: any id that can't be resolved (request failed, user deleted,
 * permissions blocked) is recorded as `null` in the cache so we don't loop and
 * `formatInitiator` falls back to the generic "Triggered by user" label.
 *
 * The returned `lookupUserName` is a plain function but reads `namesById.value`
 * inside, so when a template calls it during render Vue picks up the reactive
 * dependency — re-rendering once the fetch resolves.
 */
export function useSyncLogUserNames(sessions: Ref<SyncLogSession[]>) {
  const api = useApi();
  const namesById = ref<Record<string, string | null>>({});

  watch(
    sessions,
    async (rows) => {
      const idsToFetch = new Set<string>();
      // Reserved `initiator` markers — these are session-level annotations that the
      // formatter handles directly (`'webhook'` → "Triggered by webhook", `'hook'` →
      // "Triggered automatically"), not Directus user ids. Excluded from the fetch so we
      // don't enqueue `/users?id=hook` requests that would always fail.
      const NON_USER_INITIATORS = new Set(['webhook', 'hook']);
      for (const row of rows) {
        // Prefer the m2o column. Fall back to the free `initiator` string when it
        // isn't one of the reserved markers — older rows may have been written before
        // `initiator_user` was always populated alongside.
        const candidate = row.initiator_user ?? (NON_USER_INITIATORS.has(row.initiator) ? null : row.initiator);
        if (candidate && !(candidate in namesById.value)) {
          idsToFetch.add(candidate);
        }
        // Per-entry user ids from burst sessions (`upload-automated`) or any future
        // event_type that writes them. Filtered against the cache so a row whose entry
        // ids are already resolved doesn't enqueue them again.
        const entryIds = new Set<string>();
        collectEntryUserIds(row.entries, entryIds);
        entryIds.forEach((id) => {
          if (!(id in namesById.value)) idsToFetch.add(id);
        });
      }
      if (idsToFetch.size === 0) return;
      // Optimistically claim the ids so a second `watch` tick (e.g. concurrent reload)
      // doesn't fire a duplicate fetch for the same set. They'll be overwritten with the
      // real names below; if the fetch fails, the `null` placeholder stays and the
      // formatter falls back to "Triggered by user".
      const placeholderNext = { ...namesById.value };
      idsToFetch.forEach((id) => {
        placeholderNext[id] = null;
      });
      namesById.value = placeholderNext;

      try {
        const result = await api.get<{ data: UserRow[] }>('/users', {
          params: {
            filter: { id: { _in: Array.from(idsToFetch) } },
            fields: ['id', 'first_name', 'last_name', 'email'],
            limit: -1,
          },
        });
        const next = { ...namesById.value };
        for (const user of result.data.data ?? []) {
          next[user.id] = pickName(user);
        }
        namesById.value = next;
      } catch {
        // Already filled with `null` placeholders above — nothing else to do. The user
        // sees "Triggered by user" for these rows, which is the documented fallback.
      }
    },
    { immediate: true },
  );

  function lookupUserName(userId: string): string | null {
    return namesById.value[userId] ?? null;
  }

  return { lookupUserName };
}
