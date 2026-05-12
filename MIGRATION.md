# Migrating from 1.x to 2.0

The 2.0 release of `@localazy/directus-extension-localazy` and `@localazy/directus-extension-localazy-automation` modernizes the stack and **drops support for Directus 10.x**. This document covers what changed for end users and how to upgrade.

## TL;DR

- **2.0 requires Directus 11+.** Installing it on Directus 10 will fail the host-version check.
- **If you're staying on Directus 10**, pin the 1.x line:
  ```bash
  npm install @localazy/directus-extension-localazy@^1
  npm install @localazy/directus-extension-localazy-automation@^1
  ```
  The 1.x line is frozen (no further updates, including security fixes), so this is a stop-gap, not a long-term answer.
- **If you're on Directus 11+**, follow the Directus 10 → 11 upgrade docs first, then install the 2.x line:
  ```bash
  npm install @localazy/directus-extension-localazy
  npm install @localazy/directus-extension-localazy-automation
  ```

## Compatibility matrix

| Extension version | Directus   | Node | Status |
| ----------------- | ---------- | ---- | ------ |
| `2.x`             | `^11.0.0`  | 22+  | Active |
| `1.x`             | `^10.10.0` | 18   | Frozen |

## What changed

### Directus 10 support removed

- `directus:extension.host` is now `^11.0.0`. The 2.0 bundles use APIs (notably the flat `AppUser.admin_access` field exposed by `preRegisterCheck`) that don't exist on Directus 10.
- The previous dual-codepath shim that worked on both versions is gone.

### Underlying stack

- `@directus/extensions-sdk` jumped from 12 to **17** (the current stable).
- The extension is built and tested against Directus **11.17.4**.
- Node **22** is now the minimum (declared via `engines.node` in `package.json`).

### Installation methods

The hook extension is still **non-sandboxed** (it uses Directus' `ItemsService` and `FieldsService` directly and makes outbound HTTP calls to Localazy). Installing it via the Directus Marketplace still requires `MARKETPLACE_TRUST: 'all'` in your Directus configuration. The UI module remains sandbox-compatible and installs without that flag. Neither of these constraints changed in 2.0 — they're called out only because the installation prerequisites for the hook are easy to miss.

### No data migration required

The 2.0 release does **not** change the schema of Localazy's collections inside Directus (`localazy_settings`, `localazy_config_data`, `localazy_content_transfer_setup`). Existing rows continue to work after the upgrade.

## After upgrading

- Re-validate your OAuth connection from the Localazy module in the Directus admin — the OAuth tokens themselves remain valid, but the admin module is recompiled and you may see a brief sign-in prompt on first load.
- Manually run one Localazy sync (Module → Sync) to confirm content moves both directions. The automated sync hook will pick up subsequent changes.

## Questions or problems

- [Localazy Discussion Forum](https://discuss.localazy.com/)
- team@localazy.com
- File a bug at https://github.com/localazy/directus-extension-localazy/issues
