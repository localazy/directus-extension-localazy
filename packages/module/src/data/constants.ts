/**
 * Module-wide constants that are either shared across files (`BUNDLE_ENDPOINT_PREFIX`,
 * `BUNDLE_WEBHOOK_PATH`, `WEBHOOK_CUSTOM_ID`, `WEBHOOK_DESCRIPTION`, `WEBHOOK_EVENT`) or
 * kept here so the GitHub README target lives in one greppable place (`BUNDLE_README_URL`
 * — see memory `project_automation_page_readme_link.md`).
 */

/**
 * GitHub-hosted README for the server-side bundle. The Automation page surfaces this link
 * when the bundle isn't installed in the host Directus instance so the operator has a
 * clear next step. Update this when the README path moves (a bundling refactor could
 * relocate it under `packages/sync-hook/src/...`).
 */
export const BUNDLE_README_URL = 'https://github.com/localazy/directus-extension-localazy/blob/main/packages/sync-hook/README.md';

/**
 * Endpoint child name on the server-side bundle. Directus mounts endpoint children under
 * `/{name}` (no `/api` prefix from the module's perspective — the `useApi()` axios
 * instance already targets the Directus API root). See PR A (#54) for the bundle layout.
 */
export const BUNDLE_ENDPOINT_PREFIX = '/localazy-automation';

/**
 * Path the bundle's webhook handler listens on (added in PR F). The module pre-fills the
 * webhook setup form with `window.location.origin + BUNDLE_WEBHOOK_PATH` so the operator
 * sees the correct URL even before PR F lands.
 */
export const BUNDLE_WEBHOOK_PATH = `${BUNDLE_ENDPOINT_PREFIX}/transfer/download`;

/**
 * Custom ID used when registering this extension's webhook on Localazy. Filtering by this
 * ID lets the module own a single webhook entry without disturbing other webhooks the
 * operator has configured for the same project. Match Strapi's `strapi-plugin-localazy`
 * convention — distinct slug so a project synced from both Strapi and Directus keeps
 * separate webhook entries.
 */
export const WEBHOOK_CUSTOM_ID = 'directus-extension-localazy';

/**
 * Event we subscribe to. The webhook handler in PR F only acts on this event; subscribing
 * to others would just generate noise on the server.
 */
export const WEBHOOK_EVENT = 'project_published' as const;

/**
 * Description shown in the Localazy webhooks UI. Helps the user identify this entry among
 * other integrations they may have registered for the same project.
 */
export const WEBHOOK_DESCRIPTION = 'Directus Extension - Download translations';
