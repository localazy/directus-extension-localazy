/**
 * Filter for users whose role has at least one policy with `admin_access = true`.
 *
 * Directus 11 moved `admin_access` from `directus_roles` to `directus_policies`. The
 * traversal is `directus_users.role` (m2o) → `directus_roles.policies` (o2m to
 * `directus_access`) → `directus_access.policy` (m2o to `directus_policies`) →
 * `admin_access`. The module-side user picker (AutomationForm) and the server-side
 * webhook gate (sync-hook/endpoint) both apply this filter — keep it here so they can't
 * drift apart and reintroduce "Configured webhook user no longer exists" false positives
 * after a Directus major upgrade.
 */
export const ADMIN_USERS_FILTER = { role: { policies: { policy: { admin_access: { _eq: true } } } } } as const;
