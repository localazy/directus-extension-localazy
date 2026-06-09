import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ADMIN_USERS_FILTER } from '@localazy/directus-common';

/**
 * Asserts that the Admin-role filter keeps its Directus-11 shape —
 * `role.policies.policy.admin_access._eq: true` — and that AutomationForm.vue passes
 * the shared constant through `api.get('/users')`. Reading the source is enough to
 * catch the regression we care about: someone "tidying" the filter into a shape
 * Directus' API rejects (e.g. the v10 shape `role.admin_access._eq` — Directus 11
 * moved `admin_access` from `directus_roles` to `directus_policies`) would silently
 * render an empty dropdown AND make the webhook gate fail every delivery.
 */
const here = dirname(fileURLToPath(import.meta.url));
const formSource = readFileSync(resolve(here, 'AutomationForm.vue'), 'utf8');

describe('AutomationForm — Admin-role user filter', () => {
  it('the shared ADMIN_USERS_FILTER carries the relation-traversal shape Directus 11 expects', () => {
    expect(ADMIN_USERS_FILTER).toEqual({ role: { policies: { policy: { admin_access: { _eq: true } } } } });
  });

  it('passes the shared filter through `api.get` with `fields: id, first_name, last_name, email`', () => {
    expect(formSource).toMatch(/api\.get<[^>]+>\(\s*['"]\/users['"]/);
    expect(formSource).toMatch(/filter:\s*ADMIN_USERS_FILTER/);
    expect(formSource).toMatch(/fields:\s*\[\s*['"]id['"]\s*,\s*['"]first_name['"]\s*,\s*['"]last_name['"]\s*,\s*['"]email['"]\s*\]/);
  });
});
