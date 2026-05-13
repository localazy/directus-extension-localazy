import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Lightweight static-source assertion that the Admin-role filter passed to
 * `GET /users` keeps its expected shape — `role.admin_access._eq: true`.
 *
 * The full form mounts in Vue and would need `@directus/extensions-sdk` plus
 * `useStores()` to instantiate, which isn't worth the harness cost for this single
 * invariant. Reading the source is enough to catch the regression we care about:
 * someone "tidying" the filter into a shape Directus' API rejects (e.g.
 * `admin_access: true` without the relation traversal) would silently render an
 * empty dropdown.
 */
const here = dirname(fileURLToPath(import.meta.url));
const formSource = readFileSync(resolve(here, 'AutomationForm.vue'), 'utf8');

describe('AutomationForm — Admin-role user filter', () => {
  it('declares ADMIN_USERS_FILTER with the relation-traversal shape Directus expects', () => {
    // Match `{ role: { admin_access: { _eq: true } } }` while tolerating whitespace.
    const re = /ADMIN_USERS_FILTER\s*=\s*\{\s*role:\s*\{\s*admin_access:\s*\{\s*_eq:\s*true\s*\}\s*\}\s*\}/;
    expect(formSource).toMatch(re);
  });

  it('passes the filter through `api.get` with `fields: id, first_name, last_name, email`', () => {
    expect(formSource).toMatch(/api\.get<[^>]+>\(\s*['"]\/users['"]/);
    expect(formSource).toMatch(/filter:\s*ADMIN_USERS_FILTER/);
    expect(formSource).toMatch(/fields:\s*\[\s*['"]id['"]\s*,\s*['"]first_name['"]\s*,\s*['"]last_name['"]\s*,\s*['"]email['"]\s*\]/);
  });
});
