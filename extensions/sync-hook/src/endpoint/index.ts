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

const LOCALAZY_COLLECTIONS = {
  settings: 'localazy_settings',
  data: 'localazy_data',
  contentTransferSetup: 'localazy_content_transfer_setup',
  syncLog: 'localazy_sync_log',
} as const;

/**
 * Minimal Express Request shape we touch in the handler. Keeping the type local (rather
 * than pulling `Request` from `@types/express`) lets the unit tests pass a fake without
 * monkey-patching the whole Express surface.
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
 * Look up a header value, case-insensitive. Express lowercases header keys by default,
 * but the fake `headers` map we accept in tests may not — be defensive.
 */
function getHeader(req: WebhookRequest, name: string): string | undefined {
  const direct = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(direct)) return direct[0];
  return direct;
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
 * Errors propagate — a transient DB failure on this read is worth surfacing rather than
 * masking as `user_missing`.
 */
type UserLookup = { found: false } | { found: true; user: { id: string; admin_access: boolean; role: string | null } };
async function lookupWebhookUser(ItemsService: ItemsServiceCtor, schema: SchemaOverview, userId: string): Promise<UserLookup> {
  type UserRow = { id: string; admin_access: boolean | null; role: string | null };
  const service = new ItemsService<UserRow>('directus_users', { schema, accountability: null });
  try {
    const row = await service.readOne(userId, { fields: ['id', 'admin_access', 'role'] });
    if (!row) return { found: false };
    return { found: true, user: { id: row.id, admin_access: row.admin_access === true, role: row.role } };
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
 * `admin: true` is honest here — the gate has already confirmed the user is Admin. The
 * `roles: []` array is left empty because Directus 11+ surfaces the resolved policies
 * through other means; the orchestrator's writes don't read it. `app: true` matches what
 * the standard auth pipeline writes for an interactive user.
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
 * Write a one-shot `localazy_sync_log` row for a gated-skip / gated-fail outcome. We do
 * NOT log "signature failed" attempts — those aren't operator-actionable and would let
 * an attacker flood the table by spamming bad signatures.
 *
 * `status` is the persisted column value (`'skipped'` for 12a; `'failed'` for 12b/c).
 * `event_type` is always `'webhook'` regardless of the gate outcome — the Activity UI's
 * Webhooks tab needs to see why the event was refused.
 */
async function writeGatedSessionRow(
  ItemsService: ItemsServiceCtor,
  schema: SchemaOverview,
  params: { status: string; summary: string; userId: string | null },
): Promise<void> {
  try {
    const service = new ItemsService<Partial<SyncLogSession>>(LOCALAZY_COLLECTIONS.syncLog, { schema, accountability: null });
    const cryptoApi = globalThis.crypto;
    const id =
      cryptoApi && typeof cryptoApi.randomUUID === 'function'
        ? cryptoApi.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    const now = new Date().toISOString();
    await service.createOne(
      {
        id,
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
    // Log-write failure must not propagate — gated outcomes already respond 200; a
    // missing log row just means the operator won't see this event in the Activity tab.
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

    // 1. Read settings + localazy_data. Both reads need admin accountability — the
    //    settings master toggle and the OAuth token belong to the extension, not to
    //    the user that triggered the event (there isn't one yet).
    const settings = await readSingleton<Settings>(ItemsService, LOCALAZY_COLLECTIONS.settings, schema);
    if (!settings) {
      res.status(503).json({ error: 'not_configured' });
      return;
    }

    // Master toggle off — quickest exit. We still write a `'skipped'` session row so the
    // operator sees the webhook fired but was refused. The 200 response prevents
    // Localazy from retrying (the retry would also be refused).
    if (settings.automated_import !== true) {
      await writeGatedSessionRow(ItemsService, schema, {
        status: 'skipped',
        summary: 'Automated import is disabled',
        userId: null,
      });
      res.status(200).json({ skipped: true, reason: 'disabled' });
      return;
    }

    // 2. Localazy data — needed for the access token (to fetch the secret) and project
    //    id (to scope the HMAC fetch + the import).
    const localazyData = await readSingleton<LocalazyData>(ItemsService, LOCALAZY_COLLECTIONS.data, schema);
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
      hmacHeader: getHeader(req, WEBHOOK_HMAC_HEADER),
      timestampHeader: getHeader(req, WEBHOOK_TIMESTAMP_HEADER),
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
    let userLookup: UserLookup = { found: false };
    if (userId) {
      userLookup = await lookupWebhookUser(ItemsService, schema, userId);
    }

    const decision = decideGating({
      settings,
      user: userLookup.found ? { id: userLookup.user.id, userHasAdminAccess: userLookup.user.admin_access } : null,
      userExists: userLookup.found,
    });

    if (decision.kind === 'skip') {
      await writeGatedSessionRow(ItemsService, schema, {
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
      await writeGatedSessionRow(ItemsService, schema, {
        status: 'failed',
        summary,
        userId: userId ?? null,
      });
      res.status(200).json({ failed: true, reason: decision.reason });
      return;
    }

    // 6. Respond 200 immediately (Q5c) and run the import in the background.
    res.status(200).json({ accepted: true });

    // Build the orchestrator inputs that depend on the import-time state. We do this
    // BEFORE setImmediate so any synchronous setup failure (a schema read that throws,
    // a missing setup row) surfaces under the request span rather than disappearing
    // into the void of the next tick.
    const transferSetup = await readSingleton<ContentTransferSetupDatabase>(
      ItemsService,
      LOCALAZY_COLLECTIONS.contentTransferSetup,
      schema,
    );
    if (!transferSetup) {
      logger.warn('Localazy webhook: missing content_transfer_setup row, aborting');
      await writeGatedSessionRow(ItemsService, schema, {
        status: 'failed',
        summary: 'Missing content_transfer_setup row',
        userId,
      });
      return;
    }

    // Resolve the Localazy project. The webhook payload may carry an id but we read it
    // off the saved `localazy_data` row instead — that's the project the user
    // configured for this Directus install. A mismatched id would already be caught by
    // the per-project HMAC secret.
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
      await writeGatedSessionRow(ItemsService, schema, {
        status: 'failed',
        summary: `Configured Localazy project (${localazyData.project_id}) no longer exists`,
        userId,
      });
      return;
    }

    // Construct the webhook user's accountability. The gate already confirmed admin —
    // if we got here, `userLookup.found === true` is guaranteed (otherwise the gate
    // would have returned `fail` above). The assertion keeps TS happy without an `as`.
    if (!userLookup.found) {
      // Defensive: should never hit (gate would have refused). Bail rather than synth.
      logger.error('Localazy webhook: invariant violation — gating passed without a resolved user');
      return;
    }
    const writeAccountability = buildAccountability(userLookup.user);

    // Resolve languages — verbatim from the saved field, or fall back to the UI default.
    let languages = decision.importLanguages;
    if (decision.fallbackLanguages) {
      const langService = new SynchronizationLanguagesService(new WebhookDirectusApi(ItemsService, schema, null));
      const resolved = await langService.resolveImportLanguages(settings, localazyProject);
      languages = resolved.map((l) => l.directusForm);
    }

    // Build the orchestrator adapter bundle. Webhook-driven writes run under the
    // configured user's accountability; lock + cursor + sync_log writes use admin
    // accountability internally regardless.
    const adapters = buildServerOrchestratorAdapters({
      ItemsService,
      schema,
      logger,
      writeAccountability,
      localazyProject,
    });

    // Resolve the language list into `DirectusLocalazyLanguage` rows. The orchestrator
    // wants the same shape that `resolveImportLanguages()` produces — recompute through
    // the same service so non-trivial cases (language mapping, source-language opt-in)
    // are handled identically to the UI path.
    const langService = new SynchronizationLanguagesService(new WebhookDirectusApi(ItemsService, schema, null));
    const allResolved = await langService.resolveImportLanguages(settings, localazyProject);
    const resolvedLanguages = decision.fallbackLanguages ? allResolved : allResolved.filter((l) => languages.includes(l.directusForm));

    const enabledFields = EnabledFieldsService.parseFromDatabase(transferSetup.enabled_fields);

    // Kick off the import on the next tick. `setImmediate` runs after the current
    // microtask queue drains (so `res.json` has flushed) but before any setTimeout(0).
    // Errors are caught here so an orchestrator throw doesn't crash the Node process —
    // the persisted `localazy_sync_log` row already captures the failure via the
    // orchestrator's `finally` block.
    setImmediate(() => {
      void runIncrementalImport(
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
      ).catch((err) => {
        logger.error({ err }, 'Localazy webhook: import dispatch failed');
      });
    });
  };
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
