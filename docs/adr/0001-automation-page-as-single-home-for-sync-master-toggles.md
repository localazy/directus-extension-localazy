# Automation page is the single home for sync master toggles; export master gates all outbound activity

## Context

Outbound sync (Directus → Localazy) was historically governed by two independent flags on the **Additional Settings** page: `automated_upload` (gate for create/update push) and `automated_deprecation` (gate for delete-propagation). Inbound sync (Localazy → Directus) was governed by `automated_import` on the separate **Automation** page. This split meant users had to visit two pages to understand or change the sync regime, and the two outbound flags allowed a confusing combination — "deprecate on delete but don't push on update" — that no user mental model accommodates.

## Decision

1. **Page purpose.** The **Automation** page is the single home for *automation master toggles* — the on/off switches that decide whether a sync direction runs at all. The **Additional Settings** page holds *behaviour-shaping knobs* — settings that decide *how* sync behaves once it runs (skip empty strings, source-language direction, language mappings, etc.). New automation-enable controls go on the Automation page; new behaviour controls go on Additional Settings.

2. **Master gates everything.** The "Automated export" master toggle is persisted as `Settings.automated_upload` and surfaces deprecation as a sub-setting. The runtime gating in `collection-content-synchronization-service.ts` and `translation-strings-synchronization-service.ts` was tightened so deprecation also requires `automated_upload === true` — meaning master OFF guarantees zero outbound activity, including for legacy installs that had the niche `upload=false, deprecate=true` combination.

3. **Field names stay.** `Settings.automated_upload` and `Settings.automated_deprecation` keep their persisted names; only the user-facing labels switched to "Automated export" / "Also deprecate keys on delete." This avoids a schema migration and analytics-payload coordination, at the cost of an existing inconsistency between code and UI terminology (also present in `upload_existing_translations` → "Export translations from Directus").

## Consequences

- Legacy users with `automated_upload = false` and `automated_deprecation = true` will lose deprecation firing after upgrade. This is intentional — the UI no longer allows that state, and the runtime now matches.
- Contributors adding sync-related settings must classify them as "automation toggle" (Automation page) or "behaviour knob" (Additional Settings) and place them accordingly.
- Future renames of `automated_upload` → `automated_export` (field, code, analytics) remain possible but require coordinated migration + dashboard updates and are not in scope here.
