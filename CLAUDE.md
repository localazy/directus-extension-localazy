# CLAUDE.md

Context for AI assistants and human contributors working in this repo. Read this before making non-trivial changes.

## What this repo is

A monorepo of two published Directus extensions plus one internal shared package:

| Path                  | npm name                                           | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/module/`    | `@localazy/directus-extension-localazy`            | UI module — Vue 3 + Pinia, runs in the admin browser. Sandbox-compatible by nature; listable on Directus Marketplace without `MARKETPLACE_TRUST`.                                                                                                                                                                                                                                                                                                              |
| `packages/sync-hook/` | `@localazy/directus-extension-localazy-automation` | Server-side bundle (despite the historical directory name) — plain TypeScript, runs in the Directus Node process. Contains two children: a `hook` (`src/hook/`) that wires `ItemsService` + `FieldsService` callbacks and a small `endpoint` (`src/endpoint/`) that exposes `GET /localazy-automation/status` for module-side bundle-presence detection. Cannot be sandboxed. Marketplace install requires `MARKETPLACE_TRUST: 'all'`.                         |
| `packages/common/`    | `@localazy/directus-common`                        | Internal shared TypeScript code (services, models, types). Not published — declared as `workspace:*` in each extension's devDependencies. Single-barrel export from `src/main.ts` re-exports everything under `src/`; consumers import via `import { foo } from '@localazy/directus-common'`. Rollup inlines common's source into each extension's published `dist/index.js` (module) and `dist/api.js` (sync-hook) so end users get a self-contained tarball. |

## Stack

- **Node 22** (`.nvmrc`).
- **pnpm workspaces** (`pnpm-workspace.yaml`), pnpm `11.4.0` pinned via root `packageManager`. Strict isolation (no `shamefullyHoist`). `autoInstallPeers: true`. CVE overrides and a `vue` + `axios` version pin live in `pnpm-workspace.yaml`.
- **ESLint 10** flat config (`eslint.config.js`) + `typescript-eslint@8` + `eslint-plugin-vue@10` flat presets + `eslint-config-prettier`. Per-workspace globals: browser for `module/` and `common/`, node for `sync-hook/`.
- **Prettier 3** (`.prettierrc.json`). Single quotes, semicolons, trailing commas, `printWidth: 140` (matches the `vue/max-len` lint rule — don't change one without changing the other).
- **TypeScript** `^5.9`. Typechecking uses `vue-tsc --noEmit` so `<script lang="ts">` inside `.vue` files is covered.
- **Vitest** for tests, Node environment, co-located `*.test.ts` files.
- **No Docker.** Dev environment is a local Directus instance against SQLite.

## Architecture

- **Module is Vue 3 + Pinia.** Source under `packages/module/src/`. SFCs use `<script setup lang="ts">`. State in `stores/` (Pinia), composables in `composables/`, services in `services/`. Build output (`dist/index.js`) is what Directus loads at runtime.
- **Sync-hook is a Directus bundle** (`type: 'bundle'` in `package.json`) with two children:
  - `src/hook/index.ts` — the original hook code, `defineHook` registering `action()` callbacks for `settings.*`, `translations.*`, and `items.*` lifecycle events. Delegates to service classes under `src/hook/services/content-synchronization/` and `src/hook/services/`, which use Directus' `ItemsService` and the Localazy API client.
  - `src/endpoint/index.ts` — `defineEndpoint` exposing `GET /localazy-automation/status` (URL prefix derived from the endpoint child's `name` in `package.json`). The module-side Automation page pings this route to detect whether the bundle is installed and reachable.

  **The bundle is intentionally non-sandboxed** — Directus' sandboxed API extensions only get a restricted `directus:api` import (`log`, `sleep`, `request`); they cannot use `ItemsService` / `FieldsService`. Moving to sandbox would require rewriting the synchronisation services against the sandbox runtime, which is not currently feasible. The trade-off: marketplace installs require the host operator to set `MARKETPLACE_TRUST=all`.

- **Common is source-consumed.** `packages/common/package.json` exports `./src/main.ts` directly — no build step. Each extension's rollup picks up the `.ts` source and inlines it at publish time. The barrel re-exports every file in `src/` via `export * from './<path>';`.
- **Config is build-time-baked.** `packages/common/src/config/config.json` is _generated_ by `packages/common/scripts/set-config.mjs` from `config.production.json` (or `config.demo.json`). The generated file is gitignored. Turbo's `build:scripts` task (owned by `@localazy/directus-common`) writes it before each extension's `build`; `pnpm run build` and `pnpm dev` chain it automatically. A missing-file error from `get-config.ts` means you need to run `pnpm run set-production-config`.
- **Turborepo orchestrates build and dev.** `turbo.json` declares `build:scripts` (common's config bake), `build` (each extension), and `dev` (each extension's watch build). `^build:scripts` makes both extensions wait for common to bake its config before building. `dev` is `persistent + interruptible`. Cache lives in `.turbo/` (gitignored).

## Local development

```bash
nvm use            # Node 22
corepack enable    # so pnpm resolves to the version pinned in package.json's packageManager
pnpm install       # workspace install at root
pnpm dev           # builds extensions, boots Directus on http://localhost:8055
```

Login: `admin@example.com` / `d1r3ctu5` (seeded once into the gitignored `development/data/data.db`).

What `scripts/dev.mjs` does:

1. Ensures `packages/common/src/config/config.json` exists.
2. Runs an initial unminified build of both extensions.
3. Symlinks each extension into `development/extensions/<published-name>/` so `EXTENSIONS_PATH` is isolated from `packages/common` (Directus would otherwise warn that `common/` lacks a `directus:extension` field).
4. Bootstraps the SQLite DB if `data.db` doesn't exist yet.
5. Starts watch builds (`directus-extension build --watch`) for both extensions in parallel with Directus, so saved edits land in the running admin without a manual restart.

To reset all local state:

```bash
rm -rf development/data development/uploads development/extensions
```

## Commands

| Command                  | What it does                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `pnpm install`           | Install all workspaces. Run once after a clone or after pulling dependency changes. |
| `pnpm dev`               | Local dev loop — Directus + SQLite + watch builds.                                  |
| `pnpm lint`              | ESLint across the monorepo.                                                         |
| `pnpm lint:fix`          | Same, with autofix.                                                                 |
| `pnpm format`            | Prettier check (fails if anything isn't formatted).                                 |
| `pnpm format:fix`        | Prettier write.                                                                     |
| `pnpm typecheck`         | `vue-tsc --noEmit` — typechecks `.ts` and `.vue` files. Gated in CI.                |
| `pnpm test`              | Vitest run.                                                                         |
| `pnpm test:watch`        | Vitest in watch mode.                                                               |
| `pnpm test:coverage`     | Vitest with v8 coverage report (text + HTML at `coverage/` + lcov).                 |
| `pnpm check`             | Aggregate: `lint && format && typecheck && test`.                                   |
| `pnpm check:fix`         | Aggregate fix: `lint:fix && format:fix`.                                            |
| `pnpm knip`              | Detect unused files, deps, and exports. Local only (not gated in CI).               |
| `pnpm build`             | Minified production build of both extensions. This is what release publishes.       |
| `pnpm build:development` | Unminified build (faster, used by `dev`).                                           |

CI (`.github/workflows/qa.yml`) runs `pnpm run check` then a production build on every PR. Release (`.github/workflows/release.yml`) is triggered by pushes to `main` and uses `npx @localazy/workflow-scripts@latest` to drive a **lockstep release flow**: the root `package.json` version is the single source of truth, and both extensions publish together at that version. Two jobs gated by commit-message prefix:

- Commit doesn't start with `🚀 release:` → `create-release-pr` opens a single PR bumping root version + updating root `CHANGELOG.md` based on conventional commits.
- Commit starts with `🚀 release:` → sync both extensions' `version` field to root, build, `pnpm publish` both, then `create-git-tag` + `create-github-release`.

The two extensions' `package.json` versions on `main` will lag behind root between releases — they are synced at publish time, so the value end users see on npm always matches root. Cosmetic mismatch only.

## Coding conventions

- **Avoid `as any` and `as unknown` casts unless truly necessary.** Both bypass TypeScript's safety net and tend to mask real bugs. Prefer real types — even partial ones via `Partial<T>` / `Pick<T, K>` — or narrow the consumer's signature so the cast isn't needed. When a cast is unavoidable (mocking a complex third-party type in a test is the most common case), use a single targeted cast (`as TargetType`) rather than the `as unknown as TargetType` double-cast escape hatch, and keep its scope as small as possible.

- **Never hard-code Localazy collection names.** Always import `LOCALAZY_COLLECTIONS` from `@localazy/directus-common` (defined in `packages/common/src/models/collections-data/collection-names.ts`). The literals look interchangeable but they are not:
  - `localazy_data` — UI grouping folder in `directus_collections`. **No backing table.** Reading it with `ItemsService.readByQuery()` throws `Cannot read properties of undefined (reading 'primary')` inside Directus' schema traversal — and if the caller doesn't `try/catch` it surfaces as an unhandled rejection that makes the HTTP request hang until the client times out.
  - `localazy_config_data` — the actual single-row collection storing the OAuth token + project id.
  - The other names (`localazy_settings`, `localazy_content_transfer_setup`, `localazy_sync_state`, `localazy_sync_log`) are real collections.

  A duplicated local `LOCALAZY_COLLECTIONS` block in `endpoint/index.ts` once mislabeled the folder as the data collection and silently hung the webhook handler for every delivery. Don't reintroduce a per-file copy of these names.

## Directus 10 shapes redefined in Directus 11

We support Directus 11, so the shapes below are the current truth. They are listed here because the Directus 10 shapes still live in older guides, blog posts, and the SDK's training-data fingerprint — code-completion and AI assistants will happily reach for them. When you touch system-collection fields, verify the relocation first.

- **`admin_access` and `app_access` moved from `directus_roles` to `directus_policies`.** Directus 11 added a policy layer between users/roles and permissions. There is no `directus_users.admin_access` column. The traversal is:

  `directus_users.role` (m2o) → `directus_roles.policies` (o2m to `directus_access`) → `directus_access.policy` (m2o to `directus_policies`) → `admin_access`.

  To query users-who-are-admins, import the shared filter from `@localazy/directus-common` (defined in `packages/common/src/utilities/admin-users-filter.ts`):

  ```ts
  import { ADMIN_USERS_FILTER } from '@localazy/directus-common';
  // ADMIN_USERS_FILTER === { role: { policies: { policy: { admin_access: { _eq: true } } } } }
  ```

  Reading `directus_users` with `fields: ['admin_access']` makes `ItemsService.readOne()` throw — when the caller's `catch` clause maps that to "user missing" you get the symptom "webhook fails on every delivery because the configured user no longer exists" even though the user is still right there. The webhook gate hit exactly this trap (see `endpoint/index.ts` `lookupWebhookUser`).

Add new entries here when you find another Directus 10 shape that Directus 11 has restructured.
