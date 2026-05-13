import { Settings } from '../../../common/models/collections-data/settings';

/**
 * Pure-function gating decision per the Q12 plan:
 *   12a — master toggle off                                   → `skip` (logged as `skipped`)
 *   12b — `automated_import_user` is null                     → `fail` (logged as `failed`)
 *   12c — user no longer has Admin role                       → `fail` (logged as `failed`)
 *   12d — `automated_import_languages` is empty               → `proceed` with `fallbackLanguages: true`
 *         (caller falls back to the same `resolveImportLanguages()` the UI uses)
 *
 * Returns one of:
 *   - `{ kind: 'skip', reason }` — bail with 200 and write a `'skipped'` sync_log row.
 *   - `{ kind: 'fail', reason }` — bail with 200 and write a `'failed'` sync_log row.
 *     We respond 200 even on failure because the failure isn't Localazy's fault — they
 *     delivered the event correctly; the install is misconfigured. Returning 4xx would
 *     trigger redelivery, which can't help here.
 *   - `{ kind: 'proceed', importLanguages, fallbackLanguages }` — kick off the
 *     orchestrator. When `importLanguages` is non-empty we use those codes verbatim;
 *     when empty, the caller resolves via `resolveImportLanguages()` (same default as
 *     the UI Import path).
 *
 * The split between "pure decision" and "side effects" keeps the gating tractable to
 * test — the endpoint runtime supplies the inputs, this function decides.
 */
export type GatingDecision =
  | { kind: 'skip'; reason: 'disabled' }
  | { kind: 'fail'; reason: 'no_user' | 'user_not_admin' | 'user_missing' }
  | { kind: 'proceed'; importLanguages: string[]; fallbackLanguages: boolean };

/**
 * Inputs to the gate. The caller is responsible for the upstream reads (`localazy_settings`
 * singleton, `directus_users` lookup, role lookup) — the gate just folds them together
 * into a decision.
 *
 * `user` is `null` when `automated_import_user` is null OR when the configured id wasn't
 * found (the user was deleted). The latter is reported as `user_missing` so the operator
 * can tell from the sync_log row that the configured id no longer exists.
 *
 * `userHasAdminAccess` is the `admin_access` flag from the user's role row, or `false`
 * when no role is attached. We don't surface "role exists but admin_access=false" as a
 * distinct failure because the outcome is the same — the user can't drive the import.
 */
export type GatingInput = {
  settings: Pick<Settings, 'automated_import' | 'automated_import_user' | 'automated_import_languages'>;
  /**
   * The configured webhook user, or `null` if the row was missing entirely. The caller
   * sets `userExists` to distinguish "not configured" from "configured but deleted".
   */
  user: { id: string; userHasAdminAccess: boolean } | null;
  /**
   * True when `settings.automated_import_user` is non-null AND a corresponding
   * `directus_users` row was found. False when the id is null (`no_user`) or the
   * lookup returned no row (`user_missing`).
   */
  userExists: boolean;
};

/**
 * Parse the JSON-encoded `automated_import_languages` field. Returns `[]` on any
 * parse / shape failure — a corrupted setting falls back to the UI defaults rather
 * than blocking the sync.
 */
export function parseImportLanguages(raw: string): string[] {
  try {
    const candidate: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(candidate)) return [];
    return candidate.filter((c): c is string => typeof c === 'string');
  } catch {
    return [];
  }
}

export function decideGating(input: GatingInput): GatingDecision {
  // 12a — master toggle off. Highest precedence so a disabled instance never logs
  // configuration errors that the operator can't see (they'd have to toggle back on
  // before the failure rows would appear in the Activity tab).
  if (input.settings.automated_import !== true) {
    return { kind: 'skip', reason: 'disabled' };
  }

  // 12b — no user configured. Distinct from `user_missing` because the operator sees
  // a clearer error in the log: "set a webhook user".
  if (!input.settings.automated_import_user) {
    return { kind: 'fail', reason: 'no_user' };
  }

  // 12c — user exists but no longer has Admin role. The Automation page filters the
  // dropdown to Admin users only, but a role demotion after configuration would land
  // us here.
  if (!input.userExists) {
    return { kind: 'fail', reason: 'user_missing' };
  }
  if (!input.user || !input.user.userHasAdminAccess) {
    return { kind: 'fail', reason: 'user_not_admin' };
  }

  // 12d — empty language list falls back to `resolveImportLanguages()`. The caller
  // owns the fallback because it has access to the Localazy project + settings; the
  // gate just signals "do the fallback".
  const importLanguages = parseImportLanguages(input.settings.automated_import_languages);
  return {
    kind: 'proceed',
    importLanguages,
    fallbackLanguages: importLanguages.length === 0,
  };
}
