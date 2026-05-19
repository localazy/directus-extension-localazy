import { randomUUID } from 'node:crypto';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { Accountability, Item, SchemaOverview } from '@directus/types';
import packageJson from '../../package.json';
import { Settings } from '../../../common/models/collections-data/settings';
import { LocalazyData } from '../../../common/models/collections-data/localazy-data';
import { SyncLogSession } from '../../../common/models/collections-data/sync-log';
import { ContentTransferSetupDatabase } from '../../../common/models/collections-data/content-transfer-setup';
import { EnabledFieldsService } from '../../../common/utilities/enabled-fields-service';
import { LocalazyApiThrottleService } from '../../../common/services/localazy-api-throttle-service';
import { SynchronizationLanguagesService } from '../../../common/services/synchronization-languages-service';
import { runIncrementalImport } from '../../../common/services/orchestrator/incremental-import-orchestrator';
import type { ItemsServiceCtor, DirectusLogger } from '../hook/types/directus-services';
import { decideGating } from './gating';
import { verifyWebhookSignature, WebhookVerificationResult, WEBHOOK_HMAC_HEADER, WEBHOOK_TIMESTAMP_HEADER } from './hmac-verification';
import { buildServerOrchestratorAdapters, WebhookDirectusApi } from './orchestrator-adapters';
import { LOCALAZY_COLLECTIONS } from '../../../common/models/collections-data/collection-names';
import { ADMIN_USERS_FILTER } from '../../../common/utilities/admin-users-filter';

/**
 * Minimal Express Request shape we touch in the handler. Keeping the type local (rather
 * than pulling `Request` from `@types/express`) lets the unit tests pass a fake without
 * monkey-patching the whole Express surface. Express lowercases all header keys in
 * production, so we access `headers[name]` directly with a lowercase key.
 */
type WebhookRequest = {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
};

/**
 * Minimal Express Response shape — same rationale as `WebhookRequest`. The handler only
 * ever calls `res.status(N).json(body)`, so a fluent two-method fake is sufficient.
 */
type WebhookResponse = {
  status(code: number): WebhookResponse;
  json(body: unknown): WebhookResponse;
};

/**
 * Minimal Express Router shape — we only register `GET /status` and `POST /transfer/download`.
 */
type EndpointRouter = {
  get(path: string, handler: (req: WebhookRequest, res: WebhookResponse) => void | Promise<void>): unknown;
  post(path: string, handler: (req: WebhookRequest, res: WebhookResponse) => void | Promise<void>): unknown;
};

/**
 * Read a single header value as a string. Express normalises headers to lowercase and
 * collapses single-valued arrays to strings, but Node's typing still lists `string[]`
 * for set-cookie-style headers — handle the array form by taking the first entry.
 */
function readHeader(req: WebhookRequest, lowerCaseName: string): string | undefined {
  const raw = req.headers[lowerCaseName];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

/**
 * Read a single-row collection (settings / data / sync_state) and return its first
 * row, or `null` if the table is empty. Singletons can technically be empty before the
 * installer seeds them — bail early in that case rather than failing on `undefined.foo`.
 */
async function readSingleton<T extends Item>(
  ItemsService: ItemsServiceCtor,
  collection: string,
  schema: SchemaOverview,
): Promise<T | null> {
  const service = new ItemsService<T>(collection, { schema, accountability: null });
  const rows = await service.readByQuery({ limit: -1 });
  return rows[0] ?? null;
}

/**
 * Look up the configured webhook user. Returns `{ found: false }` when the row doesn't
 * exist; `{ found: true, user }` with the `admin_access` flag for the gate to inspect.
 *
 * Catches errors and returns `{ found: false }` — a transient DB failure is treated
 * identically to a missing user, surfacing a `user_missing` gating decision rather than
 * a 5xx-style hard fail. Returning 500 on every webhook because of a momentary DB
 * hiccup would be more disruptive than the current behaviour (the operator sees a
 * `user_missing` row in the Activity tab; the next delivery from Localazy retries).
 */
type UserLookup = { found: false } | { found: true; user: { id: string; admin_access: boolean; role: string | null } };

/**
 * Asserts `userLookup.found === true`. Called by the orchestrator-dispatch branch
 * after the gate has already returned `fail` for the `false` case (Q12b/Q12c1) — the
 * assertion encodes that contract for TS without a separate defensive `if` block in
 * the hot path. A violation would mean the gate's contract has drifted and we want
 * the throw to surface loudly so the issue is fixed.
 */
function assertUserFound(lookup: UserLookup): asserts lookup is Extract<UserLookup, { found: true }> {
  if (!lookup.found) {
    throw new Error('Localazy webhook: invariant violation — gating passed without a resolved user');
  }
}

async function lookupWebhookUser(ItemsService: ItemsServiceCtor, schema: SchemaOverview, userId: string): Promise<UserLookup> {
  type UserRow = { id: string; role: string | null };
  const service = new ItemsService<UserRow>('directus_users', { schema, accountability: null });
  try {
    const row = await service.readOne(userId, { fields: ['id', 'role'] });
    if (!row) return { found: false };

    // Directus 11 moved `admin_access` from `directus_users` / `directus_roles` onto
    // `directus_policies`, reachable via `directus_access`. A second filtered query
    // against `directus_users` with `ADMIN_USERS_FILTER` returns the row iff the user's
    // role has at least one policy with `admin_access = true` — same predicate the
    // module-side picker uses, so a user selectable in the UI passes the gate here.
    const adminMatch = await service.readByQuery({
      fields: ['id'],
      filter: { _and: [{ id: { _eq: row.id } }, ADMIN_USERS_FILTER] },
      limit: 1,
    });
    const adminAccess = adminMatch.length > 0;

    return { found: true, user: { id: row.id, admin_access: adminAccess, role: row.role } };
  } catch {
    // ItemsService throws "Forbidden" / "Not Found" — either way we treat the user as
    // missing for gating purposes. The caller will log this as `user_missing`.
    return { found: false };
  }
}

/**
 * Synthesise an `Accountability` for the configured webhook user. The orchestrator-driven
 * writes (translation collection updates) run under this so they're attributed to the
 * configured user in `directus_revisions` rather than `null` (system).
 *
 * `admin: true` is honest here — the gate has already confirmed the user is Admin.
 * When the user has a role, `roles` is `[user.role]`; the array is empty for role-less
 * users (rare but reachable — the gate checks `admin_access` rather than role presence,
 * so an Admin user with no role passes). `app: true` matches what the standard auth
 * pipeline writes for an interactive user.
 */
function buildAccountability(user: { id: string; admin_access: boolean; role: string | null }): Accountability {
  return {
    user: user.id,
    role: user.role,
    roles: user.role ? [user.role] : [],
    admin: user.admin_access === true,
    app: true,
    ip: null,
  };
}

/**
 * Write a one-shot `localazy_sync_log` row for either a gated-skip / gated-fail outcome
 * (Q12 cascade) OR a post-gate failure that the handler can't recover from (missing
 * `content_transfer_setup` row, Localazy project deleted upstream, background dispatch
 * threw). We do NOT log "signature failed" or "secret fetch failed" attempts — those
 * aren't operator-actionable and would let an attacker flood the table by spamming bad
 * signatures.
 *
 * `status` is the persisted column value (`'skipped'` for 12a; `'failed'` otherwise).
 * `event_type` is always `'webhook'` regardless of the outcome — the Activity UI's
 * Webhooks tab needs to see why the event was refused.
 */
async function writeOutcomeSessionRow(
  ItemsService: ItemsServiceCtor,
  schema: SchemaOverview,
  params: { status: string; summary: string; userId: string | null },
): Promise<void> {
  try {
    const service = new ItemsService<Partial<SyncLogSession>>(LOCALAZY_COLLECTIONS.syncLog, { schema, accountability: null });
    const now = new Date().toISOString();
    await service.createOne(
      {
        id: randomUUID(),
        event_type: 'webhook',
        status: params.status,
        started_at: now,
        finished_at: now,
        initiator: 'webhook',
        initiator_user: params.userId,
        summary: params.summary,
        items_processed: 0,
        entries: '[]',
      },
      { emitEvents: false },
    );
  } catch {
    // Log-write failure must not propagate — outcomes already respond 200; a missing
    // log row just means the operator won't see this event in the Activity tab.
  }
}

type RegisterDependencies = {
  ItemsService: ItemsServiceCtor;
  schema: SchemaOverview;
  logger: DirectusLogger;
};

/**
 * Webhook POST handler factory. Extracted so the test harness can supply mocks for the
 * `ItemsService` + `getSchema` + `logger` without binding to the real Directus runtime.
 */
export function createWebhookHandler(getDeps: () => Promise<RegisterDependencies | null>) {
  return async (req: WebhookRequest, res: WebhookResponse): Promise<void> => {
    const deps = await getDeps();
    if (!deps) {
      // Schema unavailable — the bundle is mid-install or Directus is starting up. We
      // can't read settings / lookup the user, so respond 503 so Localazy retries.
      res.status(503).json({ error: 'schema_unavailable' });
      return;
    }
    const { ItemsService, schema, logger } = deps;

    // Top-level guard for the pre-response phase. Any throw here (a missing collection
    // in the schema overview, a transient DB error, an unexpected Directus internal)
    // must surface as a 500 instead of becoming an unhandled rejection that leaves the
    // request hanging until Localazy's HTTP client times out.
    try {
      await handlePreResponse(req, res, ItemsService, schema, logger);
    } catch (err) {
      logger.error({ err }, 'Localazy webhook: unexpected error before response');
      res.status(500).json({ error: 'internal_error' });
    }
  };
}

async function handlePreResponse(
  req: WebhookRequest,
  res: WebhookResponse,
  ItemsService: ItemsServiceCtor,
  schema: SchemaOverview,
  logger: DirectusLogger,
): Promise<void> {
  // 1. Read settings + localazy_config_data. Both reads need admin accountability — the
  //    settings master toggle and the OAuth token belong to the extension, not to
  //    the user that triggered the event (there isn't one yet).
  const settings = await readSingleton<Settings>(ItemsService, LOCALAZY_COLLECTIONS.settings, schema);
  if (!settings) {
    res.status(503).json({ error: 'not_configured' });
    return;
  }

  // Master-toggle-off short-circuit (Q12a). We deliberately respond 200 WITHOUT
  // writing a log row: an unauthenticated POST must not append to the Activity table
  // (it would let an attacker flood it with bad signatures while the toggle is off).
  // The customer disabled automated import — they don't need an Activity entry for
  // every refused delivery. HMAC verification is skipped here because there's no
  // useful work to authenticate; the 200 prevents Localazy from retrying.
  if (settings.automated_import !== true) {
    res.status(200).json({ skipped: true, reason: 'disabled' });
    return;
  }

  // 2. Localazy data — needed for the access token (to fetch the secret) and project
  //    id (to scope the HMAC fetch + the import).
  const localazyData = await readSingleton<LocalazyData>(ItemsService, LOCALAZY_COLLECTIONS.config, schema);
  if (!localazyData || !localazyData.access_token) {
    res.status(401).json({ error: 'not_connected' });
    return;
  }

  // 3. Fetch the webhook secret fresh — per Q5b, no caching. A revoked token means the
  //    secret fetch returns 401; we surface that to the caller without retry.
  let secret: string;
  try {
    secret = await LocalazyApiThrottleService.getWebhookSecret(localazyData.access_token, {
      project: localazyData.project_id,
    });
  } catch (err) {
    logger.warn({ err }, 'Localazy webhook: secret fetch failed');
    res.status(401).json({ error: 'secret_fetch_failed' });
    return;
  }

  // 4. Verify timestamp + HMAC.
  const verification: WebhookVerificationResult = verifyWebhookSignature({
    secret,
    body: req.body,
    hmacHeader: readHeader(req, WEBHOOK_HMAC_HEADER),
    timestampHeader: readHeader(req, WEBHOOK_TIMESTAMP_HEADER),
  });
  if (!verification.ok) {
    if (verification.reason === 'stale_timestamp') {
      res.status(400).json({ error: 'stale_timestamp' });
    } else {
      // missing_headers and invalid_signature both → 401. We deliberately don't write
      // a sync_log row on verification failure — that would let an attacker flood the
      // Activity table with spam.
      res.status(401).json({ error: verification.reason });
    }
    return;
  }

  // 5. Gating (Q12). The user lookup happens here so the gate sees both the configured
  //    user id and the resolved `admin_access` flag.
  const userId = settings.automated_import_user;
  const userLookup: UserLookup = userId ? await lookupWebhookUser(ItemsService, schema, userId) : { found: false };

  const decision = decideGating({
    settings,
    user: userLookup.found ? { id: userLookup.user.id, userHasAdminAccess: userLookup.user.admin_access } : null,
    userExists: userLookup.found,
  });

  if (decision.kind === 'skip') {
    await writeOutcomeSessionRow(ItemsService, schema, {
      status: 'skipped',
      summary: 'Automated import is disabled',
      userId: null,
    });
    res.status(200).json({ skipped: true, reason: decision.reason });
    return;
  }
  if (decision.kind === 'fail') {
    const summary =
      decision.reason === 'no_user'
        ? 'No webhook user configured'
        : decision.reason === 'user_missing'
          ? 'Configured webhook user no longer exists'
          : 'Configured webhook user no longer has Admin role';
    await writeOutcomeSessionRow(ItemsService, schema, {
      status: 'failed',
      summary,
      userId: userId ?? null,
    });
    res.status(200).json({ failed: true, reason: decision.reason });
    return;
  }

  // Narrow `userLookup` to its `found: true` variant. The gate's `proceed` decision
  // implies `userLookup.found === true` (the `no_user` / `user_missing` failure paths
  // above cover the `false` variant); the `assert` makes that implication explicit so
  // TS narrows downstream. The defensive `if (!userLookup.found)` block this replaces
  // was dead code per Q12b/Q12c — the gate already returned by the time we got here.
  assertUserFound(userLookup);
  const resolvedUser = userLookup.user;

  // 6. Respond 200 immediately (Q5c) and run the import in the background.
  res.status(200).json({ accepted: true });

  // All post-response work is wrapped in try/catch so any throw — a failing schema
  // read, a Localazy listProjects throw, a language-resolution explosion — surfaces
  // as a best-effort `'failed'` log row instead of becoming an unhandled rejection.
  setImmediate(async () => {
    try {
      const transferSetup = await readSingleton<ContentTransferSetupDatabase>(
        ItemsService,
        LOCALAZY_COLLECTIONS.contentTransferSetup,
        schema,
      );
      if (!transferSetup) {
        logger.warn('Localazy webhook: missing content_transfer_setup row, aborting');
        await writeOutcomeSessionRow(ItemsService, schema, {
          status: 'failed',
          summary: 'Missing content_transfer_setup row',
          userId,
        });
        return;
      }

      // Resolve the Localazy project. The webhook payload may carry an id but we read
      // it off the saved `localazy_config_data` row instead — that's the project the user
      // configured for this Directus install. A mismatched id would already be caught
      // by the per-project HMAC secret.
      const projects = await LocalazyApiThrottleService.listProjects(localazyData.access_token, {
        organization: true,
        languages: true,
      });
      const localazyProject = projects.find((p) => p.id === localazyData.project_id);
      if (!localazyProject) {
        logger.warn(
          { projectId: localazyData.project_id },
          'Localazy webhook: configured project no longer exists on Localazy side, aborting',
        );
        await writeOutcomeSessionRow(ItemsService, schema, {
          status: 'failed',
          summary: `Configured Localazy project (${localazyData.project_id}) no longer exists`,
          userId,
        });
        return;
      }

      const writeAccountability = buildAccountability(resolvedUser);

      // Resolve languages exactly once — verbatim from the saved field, or via the
      // same `resolveImportLanguages()` the UI uses when the saved field is empty.
      const langService = new SynchronizationLanguagesService(new WebhookDirectusApi(ItemsService, schema, null));
      const allResolved = await langService.resolveImportLanguages(settings, localazyProject);
      const resolvedLanguages = decision.fallbackLanguages
        ? allResolved
        : allResolved.filter((l) => decision.importLanguages.includes(l.directusForm));

      // Build the orchestrator adapter bundle. Webhook-driven writes run under the
      // configured user's accountability; lock + cursor + sync_log writes use admin
      // accountability internally regardless. The notification recipient is the same
      // resolved user — the bell-icon row is filed in their Directus inbox on a
      // failure / partial / aborted outcome.
      const adapters = buildServerOrchestratorAdapters({
        ItemsService,
        schema,
        logger,
        writeAccountability,
        localazyProject,
        notificationRecipientUserId: resolvedUser.id,
      });

      const enabledFields = EnabledFieldsService.parseFromDatabase(transferSetup.enabled_fields);

      await runIncrementalImport(
        {
          ...adapters,
          syncLogInitiator: { initiator: 'webhook', initiatorUser: null },
        },
        {
          mode: 'incremental', // Q7 — webhook is always incremental
          languages: resolvedLanguages,
          enabledFields,
          localazyData,
          localazyProject,
          settings,
          initiator: 'webhook',
        },
      );
    } catch (err) {
      logger.error({ err }, 'Localazy webhook: dispatch failed');
      await writeOutcomeSessionRow(ItemsService, schema, {
        status: 'failed',
        summary: 'Webhook dispatch failed unexpectedly',
        userId,
      });
    }
  });
}

/**
 * Register routes on the supplied Express Router. The shape is structural so the test
 * harness can pass a minimal fake.
 *
 * `getDeps` is a thunk that returns the request-scoped dependency bag (schema + services
 * + logger). Production wires it through Directus' `getSchema()`; tests inject a fixed
 * value.
 */
export function registerEndpoint(router: EndpointRouter, getDeps: () => Promise<RegisterDependencies | null>): void {
  router.get('/status', (_req, res) => {
    res.status(200).json({ installed: true, version: packageJson.version });
  });

  router.post('/transfer/download', createWebhookHandler(getDeps));
}

// The module-side Automation page pings GET /localazy-automation/status to detect whether
// this server-side bundle is installed and reachable. POST /localazy-automation/transfer/download
// is the inbound webhook target Localazy calls on `project_published` events. Both URLs
// are scoped under `/localazy-automation` because that's this endpoint child's `name` in
// package.json (see @directus/api extension manager's `registerEndpoint`).
export default defineEndpoint((router, context) => {
  registerEndpoint(router, async () => {
    try {
      const schema = await context.getSchema();
      return {
        ItemsService: context.services.ItemsService,
        schema,
        logger: context.logger,
      };
    } catch {
      return null;
    }
  });
});
