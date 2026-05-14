import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import crypto from 'crypto';

vi.mock('@directus/extensions-sdk', () => ({
  // defineEndpoint is a passthrough at runtime; we don't reach for the mocked
  // value in the test (we import `registerEndpoint`/`createWebhookHandler` directly), but
  // the mock prevents Vitest from loading the SDK's full module graph.
  defineEndpoint: (callback: unknown) => callback,
}));

// LocalazyApiThrottleService is module-level (static-method holder). Stub the calls the
// handler makes so we don't need the network.
const throttleMocks = vi.hoisted(() => ({
  getWebhookSecret: vi.fn(),
  listProjects: vi.fn(),
}));
vi.mock('../../../common/services/localazy-api-throttle-service', () => ({
  LocalazyApiThrottleService: {
    getWebhookSecret: throttleMocks.getWebhookSecret,
    listProjects: throttleMocks.listProjects,
  },
}));

// Orchestrator dispatch — we don't run a real import in unit tests. The handler's only
// contract with the orchestrator is "call runIncrementalImport with the right args".
const orchestratorMocks = vi.hoisted(() => ({
  runIncrementalImport: vi.fn(() => Promise.resolve({ status: 'up-to-date', itemsProcessed: 0, durationMs: 0 })),
}));
vi.mock('../../../common/services/orchestrator/incremental-import-orchestrator', () => ({
  runIncrementalImport: orchestratorMocks.runIncrementalImport,
}));

// SynchronizationLanguagesService needs to resolve to a deterministic language list for
// the handler. Stub the class so the constructor accepts our fake DirectusApi.
const langMocks = vi.hoisted(() => ({
  resolveImportLanguages: vi.fn().mockResolvedValue([{ originalForm: 'en', directusForm: 'en', localazyForm: 'en' }]),
}));
vi.mock('../../../common/services/synchronization-languages-service', () => ({
  SynchronizationLanguagesService: class {
    resolveImportLanguages = langMocks.resolveImportLanguages;
  },
}));

import { createWebhookHandler, registerEndpoint } from './index';
import packageJson from '../../package.json';

/**
 * Webhook handler shape. We mirror the production `EndpointRouter` exactly — using
 * `unknown` for req/res here would be wider than the production type's parameters, and
 * with `strictFunctionTypes` the fake router wouldn't be assignable (param contravariance).
 */
type FakeReq = { body: unknown; headers: Record<string, string | string[] | undefined> };
type FakeRes = { status(code: number): FakeRes; json(body: unknown): FakeRes };
type RouteHandler = (req: FakeReq, res: FakeRes) => void | Promise<void>;

const WEBHOOK_SECRET = 'super-secret';
const PROJECT_ID = 'proj-1';
const ACCESS_TOKEN = 'token-abc';
const ADMIN_USER_ID = 'admin-user-uuid';
const ADMIN_ROLE_ID = 'admin-role-uuid';

type FakeRow = Record<string, unknown>;

function makeFakeItemsService(initial: Record<string, FakeRow[]>) {
  const tables = new Map<string, FakeRow[]>();
  for (const [k, v] of Object.entries(initial)) tables.set(k, [...v]);

  // Spy that captures every constructor call so tests can assert on (collection, options).
  const ctorCalls: Array<{ collection: string; options: unknown }> = [];

  class FakeService<T extends FakeRow = FakeRow> {
    private collection: string;
    constructor(collection: string, options: unknown) {
      this.collection = collection;
      ctorCalls.push({ collection, options });
    }
    async readByQuery(_q: unknown): Promise<T[]> {
      return ((tables.get(this.collection) ?? []) as T[]).slice();
    }
    async readOne(id: string | number, _q?: unknown): Promise<T | null> {
      const row = (tables.get(this.collection) ?? []).find((r) => r.id === id);
      return (row as T | undefined) ?? null;
    }
    async createOne(data: Partial<T>, _opts?: unknown) {
      const list = tables.get(this.collection) ?? [];
      list.push(data as FakeRow);
      tables.set(this.collection, list);
      return data.id as string;
    }
    async updateOne(id: string | number, data: Partial<T>, _opts?: unknown) {
      const list = tables.get(this.collection) ?? [];
      const idx = list.findIndex((r) => r.id === id);
      if (idx >= 0) list[idx] = { ...list[idx], ...data };
      return id;
    }
    async upsertSingleton(data: Partial<T>, _opts?: unknown) {
      const list = tables.get(this.collection) ?? [];
      if (list.length === 0) {
        list.push({ id: 1, ...data });
      } else {
        list[0] = { ...list[0], ...data };
      }
      tables.set(this.collection, list);
      return 1;
    }
    async upsertOne(data: Partial<T>, _opts?: unknown) {
      const list = tables.get(this.collection) ?? [];
      const id = data.id as string | undefined;
      if (id) {
        const idx = list.findIndex((r) => r.id === id);
        if (idx >= 0) list[idx] = { ...list[idx], ...data };
        else list.push(data as FakeRow);
      } else {
        list.push(data as FakeRow);
      }
      tables.set(this.collection, list);
      return data.id as string;
    }
    async deleteMany(ids: Array<string | number>, _opts?: unknown) {
      const list = tables.get(this.collection) ?? [];
      const kept = list.filter((r) => !ids.includes(r.id as string | number));
      tables.set(this.collection, kept);
      return ids;
    }
  }

  return { FakeService, tables, ctorCalls };
}

function makeFakeRes() {
  const captured: { status: number | null; body: unknown } = { status: null, body: null };
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
  };
  return { res, captured };
}

function makeFakeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  };
}

/**
 * Compute the HMAC for a (body, timestamp) pair using the test secret. Mirrors the
 * Strapi byte sequence verbatim: `sha256_hex(secret, `${ts}-${JSON.stringify(body)}`)`.
 */
function signRequest(body: unknown, timestamp: string, secret = WEBHOOK_SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}-${JSON.stringify(body)}`)
    .digest('hex');
}

function defaultSettings(overrides: Record<string, unknown> = {}) {
  return {
    automated_import: true,
    automated_import_user: ADMIN_USER_ID,
    automated_import_languages: '[]',
    language_collection: 'languages',
    language_code_field: 'code',
    source_language: 'en',
    import_source_language: false,
    language_mappings: '[]',
    create_missing_languages_in_directus: 'none',
    ...overrides,
  };
}

function defaultData() {
  return {
    access_token: ACCESS_TOKEN,
    project_id: PROJECT_ID,
    project_name: 'Test',
    org_id: 'org-1',
    user_id: 'u',
    user_name: 'u',
    project_url: '',
  };
}

function defaultTransferSetup() {
  return { enabled_fields: '[{"collection":"posts","fields":["title"]}]', translation_strings: true };
}

function defaultUser(overrides: Record<string, unknown> = {}) {
  return { id: ADMIN_USER_ID, admin_access: true, role: ADMIN_ROLE_ID, ...overrides };
}

function defaultLocalazyProject() {
  return {
    id: PROJECT_ID,
    name: 'Test',
    languages: [{ id: 1, code: 'en', name: 'English' }],
    sourceLanguage: 1,
    orgId: 'org-1',
  };
}

function makeFakeRouter() {
  const routes = new Map<string, RouteHandler>();
  // Returning `undefined` (rather than the `Map.set` result) lets the fake's signature
  // match the production router type's `() => unknown` exactly — Map.set returning the
  // map muddles variance for the inferred return type. Wrapping in a void-returning
  // closure keeps the call sites readable.
  const fakeRouter = {
    get(path: string, handler: RouteHandler): void {
      routes.set(`GET ${path}`, handler);
    },
    post(path: string, handler: RouteHandler): void {
      routes.set(`POST ${path}`, handler);
    },
  };
  return { fakeRouter, routes };
}

describe('endpoint /status route', () => {
  it('responds with installed=true and the package.json version', async () => {
    const { fakeRouter, routes } = makeFakeRouter();

    registerEndpoint(fakeRouter, () => Promise.resolve(null));

    const handler = routes.get('GET /status');
    expect(handler).toBeDefined();

    const { res, captured } = makeFakeRes();
    await handler!({ body: {}, headers: {} }, res);

    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ installed: true, version: packageJson.version });
  });

  it('registers POST /transfer/download', () => {
    const { fakeRouter, routes } = makeFakeRouter();

    registerEndpoint(fakeRouter, () => Promise.resolve(null));

    expect(routes.has('POST /transfer/download')).toBe(true);
  });
});

describe('webhook handler — HMAC verification', () => {
  let getDeps: Mock;
  let logger: ReturnType<typeof makeFakeLogger>;
  let tables: Map<string, FakeRow[]>;

  beforeEach(() => {
    vi.clearAllMocks();
    throttleMocks.getWebhookSecret.mockResolvedValue(WEBHOOK_SECRET);
    throttleMocks.listProjects.mockResolvedValue([defaultLocalazyProject()]);
    logger = makeFakeLogger();
    const { FakeService, tables: t } = makeFakeItemsService({
      localazy_settings: [defaultSettings()],
      localazy_data: [defaultData()],
      localazy_content_transfer_setup: [defaultTransferSetup()],
      directus_users: [defaultUser()],
      localazy_sync_log: [],
      localazy_sync_state: [{ id: 1 }],
    });
    tables = t;
    getDeps = vi.fn(() =>
      Promise.resolve({
        ItemsService: FakeService,
        schema: { collections: {}, relations: [] },
        logger,
      }),
    );
  });

  it('valid signature + fresh timestamp → 200 accepted and dispatches the orchestrator', async () => {
    const handler = createWebhookHandler(getDeps);
    const body = { type: 'project_published', project: { id: PROJECT_ID } };
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = signRequest(body, ts);
    const { res, captured } = makeFakeRes();

    await handler({ body, headers: { 'x-localazy-hmac': sig, 'x-localazy-timestamp': ts } }, res);

    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ accepted: true });
    // Let the deferred setImmediate fire.
    await new Promise((r) => setImmediate(r));
    expect(orchestratorMocks.runIncrementalImport).toHaveBeenCalledTimes(1);
    expect(orchestratorMocks.runIncrementalImport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ initiator: 'webhook', mode: 'incremental' }),
    );
  });

  it('invalid signature → 401 invalid_signature and no orchestrator call', async () => {
    const handler = createWebhookHandler(getDeps);
    const body = { type: 'project_published' };
    const ts = Math.floor(Date.now() / 1000).toString();
    const { res, captured } = makeFakeRes();

    await handler({ body, headers: { 'x-localazy-hmac': 'nope-bad-sig', 'x-localazy-timestamp': ts } }, res);

    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: 'invalid_signature' });
    expect(orchestratorMocks.runIncrementalImport).not.toHaveBeenCalled();
  });

  it('stale timestamp (>15 min) → 400 stale_timestamp', async () => {
    const handler = createWebhookHandler(getDeps);
    const body = { type: 'project_published' };
    const staleTs = Math.floor((Date.now() - 16 * 60 * 1000) / 1000).toString();
    const sig = signRequest(body, staleTs);
    const { res, captured } = makeFakeRes();

    await handler({ body, headers: { 'x-localazy-hmac': sig, 'x-localazy-timestamp': staleTs } }, res);

    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ error: 'stale_timestamp' });
    expect(orchestratorMocks.runIncrementalImport).not.toHaveBeenCalled();
  });

  it('missing headers → 401 missing_headers', async () => {
    const handler = createWebhookHandler(getDeps);
    const { res, captured } = makeFakeRes();

    await handler({ body: { type: 'project_published' }, headers: {} }, res);

    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: 'missing_headers' });
  });

  it('secret fetch failure → 401 secret_fetch_failed', async () => {
    throttleMocks.getWebhookSecret.mockRejectedValueOnce(new Error('Unauthorized'));
    const handler = createWebhookHandler(getDeps);
    const body = { type: 'project_published' };
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = signRequest(body, ts);
    const { res, captured } = makeFakeRes();

    await handler({ body, headers: { 'x-localazy-hmac': sig, 'x-localazy-timestamp': ts } }, res);

    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: 'secret_fetch_failed' });
  });

  it('not connected (no access_token) → 401 not_connected', async () => {
    tables.set('localazy_data', [{ ...defaultData(), access_token: '' }]);
    const handler = createWebhookHandler(getDeps);
    const { res, captured } = makeFakeRes();

    await handler({ body: {}, headers: {} }, res);

    expect(captured.status).toBe(401);
    expect(captured.body).toEqual({ error: 'not_connected' });
  });

  it('schema unavailable → 503 schema_unavailable', async () => {
    const handler = createWebhookHandler(() => Promise.resolve(null));
    const { res, captured } = makeFakeRes();

    await handler({ body: {}, headers: {} }, res);

    expect(captured.status).toBe(503);
    expect(captured.body).toEqual({ error: 'schema_unavailable' });
  });
});

describe('webhook handler — gating outcomes', () => {
  let logger: ReturnType<typeof makeFakeLogger>;
  let tables: Map<string, FakeRow[]>;
  let getDeps: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    throttleMocks.getWebhookSecret.mockResolvedValue(WEBHOOK_SECRET);
    throttleMocks.listProjects.mockResolvedValue([defaultLocalazyProject()]);
    logger = makeFakeLogger();
  });

  function setupHandler(settingsOverride: Record<string, unknown> = {}, users: FakeRow[] = [defaultUser()]) {
    const { FakeService, tables: t } = makeFakeItemsService({
      localazy_settings: [defaultSettings(settingsOverride)],
      localazy_data: [defaultData()],
      localazy_content_transfer_setup: [defaultTransferSetup()],
      directus_users: users,
      localazy_sync_log: [],
      localazy_sync_state: [{ id: 1 }],
    });
    tables = t;
    getDeps = vi.fn(() =>
      Promise.resolve({
        ItemsService: FakeService,
        schema: { collections: {}, relations: [] },
        logger,
      }),
    );
    return createWebhookHandler(getDeps);
  }

  it('master toggle off → 200 skipped WITHOUT writing a sync_log row (pre-HMAC short-circuit)', async () => {
    // Per Fix 1: the master-toggle-off path short-circuits before HMAC verification.
    // Writing a sync_log row here would let an unauthenticated caller flood the
    // Activity table — the customer toggled it off, they don't need an Activity entry.
    const handler = setupHandler({ automated_import: false });
    const { res, captured } = makeFakeRes();

    await handler({ body: {}, headers: {} }, res);

    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ skipped: true, reason: 'disabled' });
    const logs = tables.get('localazy_sync_log') ?? [];
    expect(logs).toHaveLength(0);
  });

  it('no user configured → 200 failed + writes a sync_log row with status="failed"', async () => {
    const handler = setupHandler({ automated_import_user: null });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = signRequest({}, ts);
    const { res, captured } = makeFakeRes();

    await handler({ body: {}, headers: { 'x-localazy-hmac': sig, 'x-localazy-timestamp': ts } }, res);

    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ failed: true, reason: 'no_user' });
    const logs = tables.get('localazy_sync_log') ?? [];
    expect(logs).toHaveLength(1);
    expect(logs[0]?.status).toBe('failed');
    expect(logs[0]?.summary).toBe('No webhook user configured');
  });

  it('user not Admin → 200 failed + log says role demoted', async () => {
    const handler = setupHandler({}, [defaultUser({ admin_access: false })]);
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = signRequest({}, ts);
    const { res, captured } = makeFakeRes();

    await handler({ body: {}, headers: { 'x-localazy-hmac': sig, 'x-localazy-timestamp': ts } }, res);

    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ failed: true, reason: 'user_not_admin' });
    const logs = tables.get('localazy_sync_log') ?? [];
    expect(logs[0]?.status).toBe('failed');
    expect(String(logs[0]?.summary)).toContain('Admin role');
  });

  it('user no longer exists → 200 failed reason=user_missing', async () => {
    const handler = setupHandler({}, []); // user lookup will miss
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = signRequest({}, ts);
    const { res, captured } = makeFakeRes();

    await handler({ body: {}, headers: { 'x-localazy-hmac': sig, 'x-localazy-timestamp': ts } }, res);

    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ failed: true, reason: 'user_missing' });
  });
});
