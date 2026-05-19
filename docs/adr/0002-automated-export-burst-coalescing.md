# Automated export hook activity is tracked as 30 s coalesced bursts, not per-event sessions

## Context

The Sync-log session model used by `runIncrementalImport` and `runIncrementalExport` opens one persisted row per orchestrator call. That maps cleanly when each call represents one user-driven operation: a click on "Download" or "Export," or one inbound Localazy `project_published` webhook. The Activity page's 100-row retention cap holds because user-driven runs are infrequent.

The Sync-hook bundle's hook side has different cardinality. It calls `runAutomatedExportPipeline` once per Directus lifecycle event — `items.create`, `items.update`, `items.delete`, `translations.*`, `settings.*`. Realistic workloads produce many events per "operation":

- A bulk import of 200 articles fires `items.create` 200 times (or one batched event with `keys.length = 200`, depending on how Directus delivers it).
- A user clicking Save on a translation collection with 10 dirty rows fires 10 `translations.update` events.
- A nightly content sync against an external CMS hammers `items.update` continuously.

Applying the one-session-per-call model would mean 200 rows from a single bulk import — wiping out the 100-row retention window in one operation. The Activity page would lose the very signal it exists to surface.

The hook side also has a different "what just happened" mental model. When a user reads the Activity page, they want to answer "did my recent edit ship to Localazy?" — not "did event #143 succeed?" Per-event rows force the reader to mentally re-coalesce. Per-burst rows do the work for them.

## Decision

1. **One Sync-log row per coalesced burst, not per pipeline call.** A burst opens on the first actionable pipeline outcome (`exported`, `deprecated` with non-zero keys, `failed`, `no-project`, `payment-disabled`, `could-not-fetch-import-content`) and closes after **30 s of idle** — i.e. when no further actionable outcome has extended the burst's timer. Outcomes that today's `outcome-reporters.ts` emits at `debug` level (`missing-context`, `export-disabled`, `nothing-to-export`, `deprecation-disabled`, `deprecated` with zero keys) are silenced from the Activity page entirely; they neither open nor extend a burst.

2. **Process-wide coalesce key.** One burst at a time per bundle process. The burst spans both Automated export and Automated deprecation activity and is not partitioned by collection, user, or direction. ADR-0001 already binds export and deprecation under a single master toggle; treating them as one Activity-page stream is consistent with that.

3. **Session-level attribution is `initiator='hook'`, `initiator_user=null`.** Per-entry user attribution lives in each entry's `data.user` (the `accountability.user` from the originating Directus event). User-name resolution is batched at read-time on the Activity page, reusing the existing `use-sync-log-user-names.ts` pattern.

4. **`event_type='upload-automated'`.** Routes into the existing Upload tab (renamed to **Export** as part of this work, per CONTEXT.md's resolved upload/export ambiguity). The column-side `upload-` prefix matches the existing `upload-incremental` / `upload-full` convention; the user-facing label is "Automated export."

5. **Coordinator lives at the bundle edge, not inside the pipelines.** A new `AutomatedExportBurstCoordinator` module wraps the existing `outcome-reporters.ts` call site in `hook/index.ts`. The export and deprecation pipelines themselves remain pure functions returning discriminated outcomes — no `SyncLogWriter` port is plumbed through them.

6. **Bundle-restart resilience via lazy sweep.** On the first hook event after each bundle init, the coordinator sweeps any orphaned `event_type='upload-automated'` rows in `status='in_progress'` and finalises them as `status='aborted'` with summary `"Bundle restarted before burst completed"`, then proceeds with normal open/extend logic. Tracked via an in-memory flag so subsequent events skip the sweep.

7. **Terminal status derived from per-entry levels.** `completed` when every appended entry was `info`-level; `partial` when there is a mix; `failed` when every entry was `error`-level. `aborted` and `skipped` do not apply at burst granularity (the no-action paths are filtered out before the burst opens).

## Consequences

- The hook-side pipelines need their outcome variants enriched with item-count fields (`{ kind: 'exported', itemsProcessed }`, `{ kind: 'deprecated', keysCount, itemsProcessed }`) so the burst row's `items_processed` column reflects what landed in Localazy, not the rough "1 per event" approximation. This is a small breaking change to the pipeline's return type — both production callers update in lockstep.
- The bundle gains its first in-process mutable state outside of Directus' own infrastructure — the coordinator's `currentBurst` ref and its `setTimeout` handle. A promise-chain mutex on the open/extend/close transitions handles the (rare but real) case of two action callbacks firing concurrently.
- Bundle restart mid-burst leaves a stale `in_progress` row on disk that won't reflect what actually happened during the truncated burst. The lazy sweep on the next hook event marks it `aborted`. Direct-mode operators who never trigger another hook event after a restart will see the stale row sit in the table until retention trims it (~100 sessions later) — acceptable for the same reasons the webhook handler accepts the same outcome class today.
- Future change of the coalesce window from 30 s requires no schema change; it's a constant in the coordinator module. A future change of the coalesce **key** (e.g. partitioning by user for multi-admin installs) does require more work — the persisted rows under the old key shape would still be read by the Activity page, but the coordinator would need an explicit migration of in-flight bursts at deploy time. Not in scope here.
- Future rename of `event_type` from `upload-automated` to `export-automated` is folded into the same coordinated migration as `upload-incremental` → `export-incremental` (out of scope for this work — `formatEventType` already absorbs the column→label mapping).
