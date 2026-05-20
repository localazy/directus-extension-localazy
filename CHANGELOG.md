## 2.0.0 (2026-05-20)

Top-to-bottom modernization of the repo and a large feature push around server-driven sync, plus the UX work to drive it. Bundles 75 PRs landed on `next` since v1.0.10 / v1.1.0 ([#93](https://github.com/localazy/directus-extension-localazy/pull/93)), plus three follow-ups merged directly to `main`.

### 🚀 Headline Changes

- **Toolchain to 2.0** — Node 22, npm workspaces, ESLint 10 flat config, Prettier 3, TypeScript 5.9, Vitest, Directus SDK 17, host range `^11`, husky pre-commit, knip, v8 coverage. CI gates lint + format + typecheck + tests plus a production build on every PR.
- **`sync-hook` is now a Directus bundle** — `defineHook` + `defineEndpoint` packaged together. The endpoint exposes `GET /localazy-automation/status` so the module can detect bundle presence; the hook keeps the `ItemsService`/`FieldsService` callbacks (non-sandboxable by design, `MARKETPLACE_TRUST=all` required for marketplace installs).
- **Server-driven sync** — inbound webhook handler with HMAC verification + admin gating + orchestrator dispatch; incremental download + upload pipelines; advisory sync lock + heartbeat + dirty-bit re-fire; burst coordinator coalescing related events into sessions.
- **Activity page** — new `localazy_sync_log` collection, Export / Import tabs (direction), `Triggered by` filter (Automation / User) with initiator-name resolution, detail page powered by `useSyncLogEntries`. Coalesced `upload-automated` burst sessions render inline in the Export tab.
- **Automation page** — single home for the sync master toggles (per ADR-0001 — previously split across Advanced Settings as `automated_upload` + `automated_deprecation`, with deprecation now a sub-toggle of the Export master). Includes the `WebhookSetup` UI, a README link when the bundle is missing, and bundle errors routed through the Directus logger.
- **UX refresh** — Overview redesign, About rewrite + nav reorder, Import / Export tree search with whole-subtree reveal under a name match, dark-mode pass across module pages, fresh-install bug fixes, language-display utility + v-select language mappings editor (community PR #21 integrated).
- **Architecture deepening** — async queue, deep sync-log writer, and incremental-import orchestrator lifted into `extensions/common/`; module-side incremental-export orchestrator extracted as a foundation; typed Directus service constructors; `DirectusModuleApi` class implementing a slim `DirectusApi` interface; `useSingletonForm`, `useLocalazyBoot`, `useUnsavedChangesGuard`, reactivity pattern standardization.
- **Hardening** — eliminate the `no-explicit-any` baseline (68 → 0, rule promoted to error), triage floating promises (rule promoted to error), fix the webhook hang + Directus 11 admin gate (`admin_access` moved to `directus_policies`), UUID PK comparison fix, dynamic language FK resolution, SHA-256 fallback for non-secure-context browsers (`crypto.subtle` is undefined off HTTPS / `localhost`), `heal-fields` utility + `meta.special` drift PATCH.
- **Docs & dev env** — `CLAUDE.md`, `CONTEXT.md` glossary, `docs/adr/` (incl. ADR-0001 for the master-toggle move), `scripts/dev.mjs` symlinks workspaces under `development/extensions/` to keep `EXTENSIONS_PATH` clean of `extensions/common/`, SQLite + seed script for local data.

**Scope**: 261 files changed, +49,629 / −17,217.

### 🧰 Post-Release Follow-ups

- ⬆️ Bump sync-hook `axios` to ^1.15.2, covering 9 CVEs ([#98](https://github.com/localazy/directus-extension-localazy/pull/98))
- 🔧 Make `.husky/pre-commit` executable ([#97](https://github.com/localazy/directus-extension-localazy/pull/97))
- 🔧 Bump deprecated v4 GitHub Actions to v6 + lint cleanup ([#95](https://github.com/localazy/directus-extension-localazy/pull/95))

## 1.0.10 (2024-12-10)
### 🔀 Pull Requests

- [Update directus plugin for the latest directus version #19](https://github.com/localazy/directus-extension-localazy/pull/19)

### 🐛 Bug Fixes

- Fix initial hydration and data definiton. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))
- Fix preRegisterCheck to work with both old and new user object. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))
- Hydrate plugin sequentially to prevent overloading. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))

### 🧰 Other Commits

- Fix dev build overwriting config file. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))
- Fix docker-compose config for the latest directus version. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))
- Keep fields visible in dev mode. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))
- Move useStores outside of store definition. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))
- Update dependencies. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))

## 1.0.9 (2024-08-26)
### 🔀 Pull Requests

- [Fix release #17](https://github.com/localazy/directus-extension-localazy/pull/17)

### 🧰 Other Commits

- Fix invalid package.json ([7713e5d](https://github.com/localazy/directus-extension-localazy/commit/7713e5d)) ([#17](https://github.com/localazy/directus-extension-localazy/pull/17))
- Update monorepo CI ([7713e5d](https://github.com/localazy/directus-extension-localazy/commit/7713e5d)) ([#17](https://github.com/localazy/directus-extension-localazy/pull/17))

## 1.0.8 (2024-08-26)
### 🔀 Pull Requests

- [Update @localazy/languages. #15](https://github.com/localazy/directus-extension-localazy/pull/15)

### 🧰 Other Commits

- Update @localazy/languages. ([900ee5c](https://github.com/localazy/directus-extension-localazy/commit/900ee5c)) ([#15](https://github.com/localazy/directus-extension-localazy/pull/15))

## 1.0.7 (2024-08-07)

### 📚 Documentation

- Add MIT license. ([3ca4c65](https://github.com/localazy/directus-extension-localazy/commit/3ca4c65))

## 1.0.6 (2024-07-31)

### 📚 Documentation

- Update package.json npm data. ([335b345](https://github.com/localazy/directus-extension-localazy/commit/335b345))

## 1.0.5 (2024-07-18)
### 🔀 Pull Requests

- [Bug fixes #8](https://github.com/localazy/directus-extension-localazy/pull/8)

### 🐛 Bug Fixes

- Allow json resolution. ([6d1e36b](https://github.com/localazy/directus-extension-localazy/commit/6d1e36b)) ([#8](https://github.com/localazy/directus-extension-localazy/pull/8))
- Increase delay of upsert operations. ([6d1e36b](https://github.com/localazy/directus-extension-localazy/commit/6d1e36b)) ([#8](https://github.com/localazy/directus-extension-localazy/pull/8))

### 🧰 Other Commits

- Install lodash to common module. ([6d1e36b](https://github.com/localazy/directus-extension-localazy/commit/6d1e36b)) ([#8](https://github.com/localazy/directus-extension-localazy/pull/8))

## 1.0.4 (2024-07-17)
### 🔀 Pull Requests

- [Fix CI release #6](https://github.com/localazy/directus-extension-localazy/pull/6)

### 🧰 Other Commits

- Fix CI release ([86ca00a](https://github.com/localazy/directus-extension-localazy/commit/86ca00a)) ([#6](https://github.com/localazy/directus-extension-localazy/pull/6))

## 1.0.3 (2024-07-17)
### 🔀 Pull Requests

- [Update CI config #4](https://github.com/localazy/directus-extension-localazy/pull/4)

### 🧰 Other Commits

- Update CI config ([85ec5ea](https://github.com/localazy/directus-extension-localazy/commit/85ec5ea)) ([#4](https://github.com/localazy/directus-extension-localazy/pull/4))

## 1.0.2 (2024-07-16)
### 🔀 Pull Requests

- [Prepare for release #3](https://github.com/localazy/directus-extension-localazy/pull/3)
- [Add CI #1](https://github.com/localazy/directus-extension-localazy/pull/1)

### 📚 Documentation

- Update main read.me. ([f28afe9](https://github.com/localazy/directus-extension-localazy/commit/f28afe9)) ([#3](https://github.com/localazy/directus-extension-localazy/pull/3))

### 🧰 Other Commits

- Fix development environment. ([f28afe9](https://github.com/localazy/directus-extension-localazy/commit/f28afe9)) ([#3](https://github.com/localazy/directus-extension-localazy/pull/3))
- Add CI ([8d866d0](https://github.com/localazy/directus-extension-localazy/commit/8d866d0)) ([#1](https://github.com/localazy/directus-extension-localazy/pull/1))

