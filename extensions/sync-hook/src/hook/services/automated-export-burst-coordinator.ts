import type { MutationOptions, SchemaOverview } from '@directus/types';
import { AutomatedExportOutcome } from '../../../../common/services/orchestrator/automated-export-pipeline';
import { AutomatedDeprecationOutcome } from '../../../../common/services/orchestrator/automated-deprecation-pipeline';
import { SyncLogEntry, SyncLogSession } from '../../../../common/models/collections-data/sync-log';
import { createSyncLogWriter } from '../../../../common/services/orchestrator/sync-log-writer';
import type { SyncLogWriter } from '../../../../common/services/orchestrator/ports';
import { createServerSyncLogStorage } from '../../shared/sync-log-storage';
import type { ItemsServiceCtor } from '../types/directus-services';

/**
 * Event_type column value for hook-triggered Automated export bursts. Sits next to
 * `upload-incremental` and `upload-full` in the `localazy_sync_log` taxonomy; the
 * module's Activity-page composables (PR 65) map it onto the Export tab. See
 * `docs/adr/0002-automated-export-burst-coalescing.md`.
 */
const BURST_EVENT_TYPE = 'upload-automated';

/**
 * `initiator` column value carried on every burst session row. Per ADR-0002 the burst
 * spans both Automated export and Automated deprecation activity across all users —
 * session-level attribution is fixed to "hook" with `initiator_user = null`. Per-entry
 * user attribution lives inside each entry's `data.user`.
 */
const BURST_INITIATOR = 'hook';

const SYNC_LOG_COLLECTION = 'localazy_sync_log';

/** Default idle window before the burst auto-finalises. */
const DEFAULT_IDLE_WINDOW_MS = 30_000;

/**
 * Per-event input the bundle's `hook/index.ts` hands to the coordinator after it has run
 * the export pipeline and observed the outcome. The coordinator decides — based on the
 * outcome variant and ADR-0002's Q3 filter — whether to open or extend the burst.
 */
export type RecordExportOutcomeInput = {
  outcome: AutomatedExportOutcome;
  schema: SchemaOverview;
  /** Directus event string, e.g. `'items.update'`. Surfaced in the entry's `data.event`. */
  event: string;
  /** Directus collection the event fired on (e.g. `'articles'`, `'directus_translations'`). */
  collection: string;
  /** Affected item keys (length is the per-event item count for the message line). */
  keys: string[];
  /** `accountability.user` id, or `null` if the event ran without an authenticated user. */
  userId: string | null;
};

export type RecordDeprecationOutcomeInput = {
  outcome: AutomatedDeprecationOutcome;
  schema: SchemaOverview;
  event: string;
  collection: string;
  keys: string[];
  userId: string | null;
};

/**
 * Public surface the hook handler interacts with. Both methods are fire-and-forget from
 * the handler's perspective — the coordinator owns the open/extend/close lifecycle, the
 * session id, the idle timer, the lazy orphan sweep, and the appendEntry calls.
 */
export type AutomatedExportBurstCoordinator = {
  recordExportOutcome(input: RecordExportOutcomeInput): Promise<void>;
  recordDeprecationOutcome(input: RecordDeprecationOutcomeInput): Promise<void>;
};

/**
 * Dependency bag for `createAutomatedExportBurstCoordinator`. Required deps stay narrow
 * (`ItemsService`, `generateId`); the optional ones exist so unit tests can substitute
 * deterministic timers and clocks without monkey-patching globals.
 */
export type AutomatedExportBurstCoordinatorDeps = {
  ItemsService: ItemsServiceCtor;
  /** Per-session UUID factory. Production passes `node:crypto`'s `randomUUID`. */
  generateId: () => string;
  /** Idle window in ms. Defaults to 30 000 (ADR-0002). */
  idleWindowMs?: number;
  /** Clock injection seam — defaults to `Date.now`. Tests pass a fake. */
  now?: () => number;
  /** Timer scheduler seam — defaults to global `setTimeout`. */
  setTimeoutFn?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  /** Timer clearer seam — defaults to global `clearTimeout`. */
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
};

/**
 * Mutable, lock-protected per-burst state. `seq` stamps each timer scheduling so a stale
 * timer firing after the burst was extended (or replaced after a close+reopen race)
 * doesn't accidentally finalise the now-current burst — the timer callback compares its
 * captured `seq` against the live `currentBurst.seq` and bails when they differ.
 */
type BurstState = {
  sessionId: string;
  /** Counters rolled into the terminal status + summary on `finalise`. */
  accumulator: {
    good: number; // info-level entries (exported / deprecated with keysCount > 0)
    bad: number; // error-level entries (failed / no-project / payment-disabled / could-not-fetch-import-content)
    exportedItems: number; // sum of itemsProcessed from `exported` outcomes
    deprecatedKeys: number; // sum of keysCount from `deprecated` outcomes
  };
  /** Active idle-timer handle. Reset on every extend. */
  timer: ReturnType<typeof setTimeout> | null;
  /** Sequence number incremented on open + each extend; carried by the timer callback for staleness check. */
  seq: number;
};

/**
 * Idempotent mutex-via-promise-chain. Every state mutation (open / extend / close / sweep)
 * runs inside `withLock` so the in-memory `currentBurst` ref is read and written
 * atomically across concurrent hook events. The chain catches errors so a failing call
 * can't poison the queue for subsequent callers.
 */
function makeLock() {
  let chain: Promise<unknown> = Promise.resolve();
  return function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };
}

/**
 * Derive the terminal `status` + `summary` from a closed burst's accumulator. ADR-0002
 * Q8: `completed` when every appended entry was info-level, `partial` when there is a
 * mix, `failed` when every entry was error-level. The 0/0 case is unreachable because
 * the Q3 filter wouldn't have opened the burst.
 */
function finaliseTerminalState(accumulator: BurstState['accumulator']): { status: string; summary: string } {
  const { good, bad, exportedItems, deprecatedKeys } = accumulator;
  const eventsCount = good + bad;
  const exportedLine = exportedItems > 0 ? `Exported ${exportedItems} ${exportedItems === 1 ? 'item' : 'items'}` : '';
  const deprecatedLine = deprecatedKeys > 0 ? `deprecated ${deprecatedKeys} ${deprecatedKeys === 1 ? 'key' : 'keys'}` : '';
  const goodParts = [exportedLine, deprecatedLine].filter(Boolean).join(', ');

  if (bad === 0) {
    return {
      status: 'completed',
      summary: `${goodParts || 'No items processed'} across ${eventsCount} ${eventsCount === 1 ? 'event' : 'events'}`,
    };
  }
  if (good === 0) {
    return {
      status: 'failed',
      summary: `All ${bad} ${bad === 1 ? 'event' : 'events'} failed`,
    };
  }
  return {
    status: 'partial',
    summary: `${goodParts || 'No items processed'} across ${good} ${good === 1 ? 'event' : 'events'}; ${bad} failed`,
  };
}

/**
 * Format a single milestone entry's `message` field for the Activity-detail UI. The
 * user-name lookup happens at read-time on the module side (extension of
 * `use-sync-log-user-names.ts`); the `data.user` field carries the raw id so the
 * resolver can batch-fetch names alongside the row's `initiator_user`.
 */
function formatExportEntryMessage(kind: AutomatedExportOutcome['kind'], collection: string, keys: string[]): string {
  const keysLabel = keys.length > 0 ? ` for ${keys.length} ${keys.length === 1 ? 'item' : 'items'} (${keys.join(', ')})` : '';
  const target = `${collection} content${keysLabel}`;
  switch (kind) {
    case 'exported':
      return `Exported ${target}`;
    case 'failed':
      return `Failed to export ${target}`;
    case 'no-project':
      return `Could not load Localazy project while exporting ${target}`;
    case 'payment-disabled':
      return `Sync operations disabled due to payment status while exporting ${target}`;
    // Filtered-out kinds — shouldn't reach this branch because the Q3 filter skips them.
    default:
      return `Exported ${target}`;
  }
}

/**
 * The `outcome` carries `keysCount` (Localazy keys deprecated) for the `'deprecated'`
 * variant; that's the operationally meaningful figure, not the count of Directus items
 * deleted. A single item deletion can deprecate multiple Localazy keys (one per
 * translatable field), so surfacing the deletion count here would underreport. Item ids
 * still live in `data.keys` on the entry for debugging.
 */
function formatDeprecationEntryMessage(outcome: AutomatedDeprecationOutcome, collection: string, keys: string[]): string {
  const itemSuffix = keys.length > 0 ? ` (triggered by deletion of ${keys.length} ${keys.length === 1 ? 'item' : 'items'})` : '';
  switch (outcome.kind) {
    case 'deprecated':
      return `Deprecated ${outcome.keysCount} ${outcome.keysCount === 1 ? 'key' : 'keys'} in ${collection}${itemSuffix}`;
    case 'failed':
      return `Failed to deprecate keys in ${collection}${itemSuffix}`;
    case 'no-project':
      return `Could not load Localazy project while deprecating keys in ${collection}${itemSuffix}`;
    case 'payment-disabled':
      return `Sync operations disabled due to payment status while deprecating keys in ${collection}${itemSuffix}`;
    case 'could-not-fetch-import-content':
      return `Could not fetch import content while deprecating keys in ${collection}${itemSuffix}`;
    default:
      return `Deprecated keys in ${collection}${itemSuffix}`;
  }
}

/**
 * Q3 filter for export outcomes. Returns the per-entry level when the outcome should
 * open / extend a burst, or `null` to silently drop. Mirrors today's
 * `outcome-reporters.ts` severity gate: anything `debug` is dropped, anything `info` or
 * `error` opens a burst.
 */
function classifyExportOutcome(outcome: AutomatedExportOutcome): { level: 'info' | 'error'; itemsProcessed: number } | null {
  switch (outcome.kind) {
    case 'exported':
      return { level: 'info', itemsProcessed: outcome.itemsProcessed };
    case 'failed':
    case 'no-project':
    case 'payment-disabled':
      return { level: 'error', itemsProcessed: 0 };
    // Silenced: missing-context, export-disabled, nothing-to-export
    default:
      return null;
  }
}

function classifyDeprecationOutcome(outcome: AutomatedDeprecationOutcome): { level: 'info' | 'error'; itemsProcessed: number } | null {
  switch (outcome.kind) {
    case 'deprecated':
      // ADR-0002 Q3: silenced when nothing matched. The pipeline always invokes
      // `deprecateLocalazyKeys` even with an empty array (the helper itself short-circuits),
      // so a zero-keys outcome is just "no actionable activity".
      if (outcome.itemsProcessed === 0) return null;
      return { level: 'info', itemsProcessed: outcome.itemsProcessed };
    case 'failed':
    case 'no-project':
    case 'payment-disabled':
    case 'could-not-fetch-import-content':
      return { level: 'error', itemsProcessed: 0 };
    // Silenced: missing-context, deprecation-disabled
    default:
      return null;
  }
}

/**
 * Factory for the process-singleton burst coordinator. The returned coordinator captures
 * the Directus runtime references (`ItemsService`, `generateId`, timers) up front and
 * exposes a stateful surface — calls to `recordExportOutcome` / `recordDeprecationOutcome`
 * lazily construct the `SyncLogWriter` against the first event's schema, lazy-sweep
 * orphaned `in_progress` rows from prior process lifetimes, then open or extend the
 * current burst.
 *
 * Production wires one coordinator at `defineHook` time and shares it across every
 * action callback. Tests inject deterministic timers + clocks to assert lifecycle
 * transitions without real-time waits.
 */
export function createAutomatedExportBurstCoordinator(deps: AutomatedExportBurstCoordinatorDeps): AutomatedExportBurstCoordinator {
  const {
    ItemsService,
    generateId,
    idleWindowMs = DEFAULT_IDLE_WINDOW_MS,
    now = () => Date.now(),
    setTimeoutFn = (cb, ms) => setTimeout(cb, ms),
    clearTimeoutFn = (h) => clearTimeout(h),
  } = deps;

  const withLock = makeLock();

  let writer: SyncLogWriter | null = null;
  let currentBurst: BurstState | null = null;
  let hasSwept = false;
  let nextSeq = 0;

  function getOrCreateWriter(schema: SchemaOverview): SyncLogWriter {
    if (writer) return writer;
    writer = createSyncLogWriter({
      storage: createServerSyncLogStorage(ItemsService, schema),
      generateId,
    });
    return writer;
  }

  /**
   * One-shot scan of `localazy_sync_log` for orphan `upload-automated` rows from prior
   * process lifetimes. Bundle restart mid-burst leaves a row in `status='in_progress'` (the
   * in-memory timer dies with the process); this sweep finalises any such rows so the
   * Activity page never shows perpetual in-progress sessions from past lives. Tracked
   * under `hasSwept` so subsequent events skip the query.
   */
  async function sweepOrphans(schema: SchemaOverview): Promise<void> {
    try {
      const service = new ItemsService<Partial<SyncLogSession>>(SYNC_LOG_COLLECTION, { schema, accountability: null });
      const orphans = await service.readByQuery({
        filter: {
          event_type: { _eq: BURST_EVENT_TYPE },
          status: { _eq: 'in_progress' },
        },
        fields: ['id'],
        limit: -1,
      });
      const finishedAt = new Date(now()).toISOString();
      for (const row of orphans) {
        if (typeof row.id !== 'string') continue;
        try {
          await service.updateOne(
            row.id,
            {
              status: 'aborted',
              finished_at: finishedAt,
              summary: 'Bundle restarted before burst completed',
            },
            { emitEvents: false } as MutationOptions,
          );
        } catch {
          // Best-effort: skip this row, the retention trim will eventually drop it.
        }
      }
    } catch {
      // Best-effort: if the sweep query fails (transient DB error, schema mid-init,
      // missing collection on a brand-new install), proceed without sweep. The next
      // bundle restart will retry.
    }
  }

  /**
   * Finalise the open burst when its idle timer fires. Captures the burst's `seq` at
   * scheduling time so a late-firing timer (whose burst has since been extended or
   * replaced) bails without touching the live state.
   */
  function scheduleClose(expectedSeq: number): void {
    if (!currentBurst) return;
    currentBurst.timer = setTimeoutFn(() => {
      // Errors must not propagate out of a `setTimeout` callback — that would surface
      // as an unhandled rejection. Wrap the lock acquisition + finalise in a discarded promise.
      void withLock(async () => {
        if (!currentBurst || currentBurst.seq !== expectedSeq || writer === null) return;
        const burst = currentBurst;
        currentBurst = null;
        const { status, summary } = finaliseTerminalState(burst.accumulator);
        const itemsProcessed = burst.accumulator.exportedItems + burst.accumulator.deprecatedKeys;
        try {
          await writer.finish(burst.sessionId, { status, summary, itemsProcessed });
        } catch {
          // Writer swallows finish failures itself; the catch here is belt-and-braces in
          // case the contract ever changes.
        }
      }).catch(() => undefined);
    }, idleWindowMs);
  }

  /**
   * Core open/extend/append path shared by both `recordExportOutcome` and
   * `recordDeprecationOutcome`. Runs under the mutex so two concurrent action callbacks
   * land their session creation + entry append atomically.
   */
  async function appendEntryToBurst(args: {
    schema: SchemaOverview;
    level: 'info' | 'error';
    message: string;
    data: Record<string, unknown>;
    exportedItemsDelta: number;
    deprecatedKeysDelta: number;
  }): Promise<void> {
    await withLock(async () => {
      // Lazy sweep — runs exactly once per coordinator lifetime, on the first actionable
      // outcome. Skipped on subsequent calls regardless of outcome filtering.
      if (!hasSwept) {
        hasSwept = true;
        await sweepOrphans(args.schema);
      }

      const writerInstance = getOrCreateWriter(args.schema);

      // Open or extend.
      if (!currentBurst) {
        let sessionId: string;
        try {
          sessionId = await writerInstance.startSession({
            eventType: BURST_EVENT_TYPE,
            initiator: BURST_INITIATOR,
            initiatorUser: null,
          });
        } catch {
          // Couldn't open the session — best-effort: skip this outcome entirely. The
          // pipeline already ran and its side effects landed; the Activity-page surface is
          // strictly observational, so a failed open isn't worth surfacing.
          return;
        }
        currentBurst = {
          sessionId,
          accumulator: { good: 0, bad: 0, exportedItems: 0, deprecatedKeys: 0 },
          timer: null,
          seq: ++nextSeq,
        };
      } else {
        // Extend: clear the prior timer (still pending) before we reschedule.
        if (currentBurst.timer) {
          clearTimeoutFn(currentBurst.timer);
          currentBurst.timer = null;
        }
        currentBurst.seq = ++nextSeq;
      }

      // Update accumulator before scheduling so a contender / read during the burst sees
      // the most recent counts (the row itself isn't patched mid-flight; the persisted
      // counter is only written on finalise).
      if (args.level === 'info') currentBurst.accumulator.good += 1;
      else currentBurst.accumulator.bad += 1;
      currentBurst.accumulator.exportedItems += args.exportedItemsDelta;
      currentBurst.accumulator.deprecatedKeys += args.deprecatedKeysDelta;

      const entry: SyncLogEntry = {
        timestamp: new Date(now()).toISOString(),
        level: args.level,
        message: args.message,
        data: args.data,
      };
      // Awaited inside the lock so a contender / test reading the row right after the
      // hook callback returns sees the entry already on disk. The writer's per-session
      // promise chain still serialises this against any other in-flight appends (e.g.
      // late-arriving completions from a previous coordinator call site), so order is
      // preserved either way; the await just shifts the visibility boundary.
      await writerInstance.appendEntry(currentBurst.sessionId, entry);

      // Reschedule the idle close.
      scheduleClose(currentBurst.seq);
    });
  }

  return {
    async recordExportOutcome(input) {
      const classification = classifyExportOutcome(input.outcome);
      if (!classification) return;
      const message = formatExportEntryMessage(input.outcome.kind, input.collection, input.keys);
      await appendEntryToBurst({
        schema: input.schema,
        level: classification.level,
        message,
        data: {
          user: input.userId,
          event: input.event,
          collection: input.collection,
          keys: input.keys,
          outcome: input.outcome.kind,
        },
        exportedItemsDelta: classification.itemsProcessed,
        deprecatedKeysDelta: 0,
      });
    },

    async recordDeprecationOutcome(input) {
      const classification = classifyDeprecationOutcome(input.outcome);
      if (!classification) return;
      const message = formatDeprecationEntryMessage(input.outcome, input.collection, input.keys);
      await appendEntryToBurst({
        schema: input.schema,
        level: classification.level,
        message,
        data: {
          user: input.userId,
          event: input.event,
          collection: input.collection,
          keys: input.keys,
          outcome: input.outcome.kind,
        },
        exportedItemsDelta: 0,
        deprecatedKeysDelta: classification.itemsProcessed,
      });
    },
  };
}
