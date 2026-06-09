import { SyncLogEntry, SyncLogLevel } from '../../models/collections-data/sync-log';
import { SyncLogWriter } from './ports';

/**
 * Per-run handle for the optional sync-log writer. Orchestrators thread this through
 * the body so milestone entries land on the persisted row. `appendInfo` / `appendWarn` /
 * `appendError` are thin level-tagged wrappers around `SyncLogWriter.appendEntry`, with
 * `void` returns so the orchestrator can call them inline without awaiting (log writes
 * never gate the sync).
 *
 * When no writer is supplied, the orchestrator uses `makeNoopLogHandle()` — every call
 * is a no-op. Keeps the orchestrator's flow free of conditional checks at every milestone.
 */
export type LogHandle = {
  appendInfo(message: string, data?: Record<string, unknown>): void;
  appendWarn(message: string, data?: Record<string, unknown>): void;
  appendError(message: string, data?: Record<string, unknown>): void;
  /** Counter incremented every time `appendError` fires. Used to decide `'partial'` vs `'completed'`. */
  errorCount(): number;
};

export function makeNoopLogHandle(): LogHandle {
  return {
    appendInfo() {},
    appendWarn() {},
    appendError() {},
    errorCount() {
      return 0;
    },
  };
}

export function makeLogHandle(writer: SyncLogWriter, sessionId: string): LogHandle {
  let errorCount = 0;
  const append = (level: SyncLogLevel, message: string, data?: Record<string, unknown>) => {
    if (level === 'error') errorCount += 1;
    const entry: SyncLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(data ? { data } : {}),
    };
    // Fire-and-forget. The adapter swallows failures inside; we don't await so a slow
    // PATCH doesn't stall the sync's hot path.
    void writer.appendEntry(sessionId, entry);
  };
  return {
    appendInfo: (m, d) => append('info', m, d),
    appendWarn: (m, d) => append('warn', m, d),
    appendError: (m, d) => append('error', m, d),
    errorCount: () => errorCount,
  };
}
