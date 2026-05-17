# directus-extension-localazy

Glossary for the Localazy ↔ Directus integration: a Directus module (admin UI) plus a server-side bundle (hook + endpoint) that keep translatable Directus content in sync with a Localazy project in both directions.

## Language

### Sync directions

**Automated import**:
Inbound sync from Localazy to Directus, triggered by a Localazy webhook (`project_published` event). Master toggle: `Settings.automated_import`.
_Avoid_: "auto pull", "incoming sync"

**Automated export**:
Outbound sync from Directus to Localazy, triggered by Directus item / translation lifecycle events (`items.*`, `settings.*`, `translations.*`). Master toggle persisted as `Settings.automated_upload` for historical reasons — surfaced to users as "Automated export."
_Avoid_: "automated upload" (legacy term, still the field name in code; only acceptable when referring to the persisted field, never in user-facing copy)

### Building blocks

**Module**:
The Vue 3 / Pinia admin-UI extension. Runs in the browser. Owns the Automation page and other configuration pages.
_Avoid_: "frontend extension"

**Sync-hook bundle** (or just **bundle**):
The server-side Directus bundle that contains the hook + endpoint. Runs in the Directus Node process. Performs the actual export work in response to Directus events and the actual import work in response to incoming webhooks.
_Avoid_: "the hook" (the bundle is more than a hook), "server extension"

**Source key**:
Localazy's identity for a translatable string. Both export and import operate on source keys, not on raw text.
_Avoid_: "translation key"

**Deprecation**:
A Localazy operation that marks a source key as no-longer-active without deleting it. Triggered on Directus delete events when `automated_deprecation` is on. Distinct from deletion.

**Webhook user**:
The Directus user (Admin role required) whose identity webhook-triggered writes are attributed to. Required for automated import to function — the bundle refuses to act on webhook events until this is set. Persisted as `Settings.automated_import_user`.

**Sync-log session**:
A persisted row in `localazy_sync_log` capturing one Automated import or Automated export run end to end. Carries a session id (threaded through `appendEntry` calls), event type, status, initiator, initiator user, summary, items-processed counter, started/finished timestamps, and a JSON `entries` column of milestone records. Surfaced to admins on the Activity page. Retention: most recent 100 sessions.

**Sync-log writer**:
The module that owns persistence of a Sync-log session — creation, milestone appends (serialised per session), finalisation, and retention trim. Lives in `extensions/common/` and is composed with a transport adapter: an axios adapter on the Module side, an `ItemsService` adapter on the Sync-hook bundle side.
_Avoid_: "log service", "audit logger"

**Automated export pipeline**:
The closed orchestration in `extensions/common/services/orchestrator/automated-export-pipeline.ts` that drives one Automated export call end-to-end: load Localazy context → master-toggle gate → load project → payment-status gate → resolve export languages → fetch content → dispatch to Localazy. Returns a discriminated outcome; logging and error tracking happen at the bundle edge. The varying step (what content to fetch) is injected as a strategy. Composed by the Sync-hook bundle with `ItemsService`-backed adapters.

**Automated deprecation pipeline**:
Sibling module to the Automated export pipeline, in the same directory. Owns deprecation orchestration: load context → master + deprecation toggle gate → load project → payment-status gate → fetch source-language import content → project Localazy key IDs from deleted Directus item IDs → call deprecate. Returns a discriminated outcome.

## Relationships

- **Automated export** is a property of the **Sync-hook bundle**; it cannot run when the bundle is not installed.
- **Automated import** also requires the **Sync-hook bundle** (to handle the inbound webhook) and additionally requires a configured **Webhook user**.
- **Deprecation** is a sub-behavior of **Automated export** (today gated by an independent `automated_deprecation` flag; surfaced to users as a sub-setting under "Automated export").

## Flagged ambiguities

- "upload" vs "export" was used inconsistently across code and UI. **Resolved (2026-05-15)**: user-facing copy says "export"; code/field names keep "upload" for now to avoid a migration. Future contributors should not "fix" this inconsistency without a coordinated rename.
