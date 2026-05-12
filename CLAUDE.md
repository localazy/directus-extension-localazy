# CLAUDE.md

Context for AI assistants and human contributors working in this repo. Read this before making non-trivial changes.

## What this repo is

A monorepo of two published Directus extensions plus one internal shared package:

| Path                    | npm name                                           | Purpose                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extensions/module/`    | `@localazy/directus-extension-localazy`            | UI module — Vue 3 + Pinia, runs in the admin browser. Sandbox-compatible by nature; listable on Directus Marketplace without `MARKETPLACE_TRUST`.                                                                             |
| `extensions/sync-hook/` | `@localazy/directus-extension-localazy-automation` | Server-side hook — plain TypeScript, runs in the Directus Node process. Uses `ItemsService` + `FieldsService`, makes outbound HTTP to Localazy. Cannot be sandboxed. Marketplace install requires `MARKETPLACE_TRUST: 'all'`. |
| `extensions/common/`    | `localazy-directus-common`                         | Internal shared TypeScript code (services, models, types). Not published. Both extensions import via relative paths (`../../common/...`); Rollup inlines its code into each extension's `dist/index.js`.                      |

## Stack

- **Node 22** (`.nvmrc`).
- **npm workspaces** at the repo root. (Stay on npm — `localazy/release@v2` is npm-hardcoded; pnpm/Yarn would require forking that action.)
- **ESLint 10** flat config (`eslint.config.js`) + `typescript-eslint@8` + `eslint-plugin-vue@10` flat presets + `eslint-config-prettier`. Per-workspace globals: browser for `module/` and `common/`, node for `sync-hook/`.
- **Prettier 3** (`.prettierrc.json`). Single quotes, semicolons, trailing commas, `printWidth: 140` (matches the `vue/max-len` lint rule — don't change one without changing the other).
- **TypeScript** `^5.9`. Typechecking uses `vue-tsc --noEmit` so `<script lang="ts">` inside `.vue` files is covered.
- **Vitest** for tests, Node environment, co-located `*.test.ts` files.
- **No Docker.** Dev environment is a local Directus instance against SQLite.

## Architecture

- **Module is Vue 3 + Pinia.** Source under `extensions/module/src/`. SFCs use `<script setup lang="ts">`. State in `stores/` (Pinia), composables in `composables/`, services in `services/`. Build output (`dist/index.js`) is what Directus loads at runtime.
- **Hook is plain TypeScript.** Entry point `extensions/sync-hook/src/index.ts` registers `action()` callbacks for `settings.*`, `translations.*`, and `items.*` lifecycle events. The hook delegates to service classes under `services/content-synchronization/` and `services/`, which use Directus' `ItemsService` and the Localazy API client.
- **`extensions/common/` has no `src/` subdir** — its sources live directly under `api/`, `services/`, `utilities/`, `models/`, etc.
- **Config is build-time-baked.** `extensions/common/config/config.json` is _generated_ by `scripts/set-config.mjs` from `config.production.json` (or `config.demo.json`). The generated file is gitignored. `npm run build` and `npm run dev` run `set-production-config` automatically. A missing-file error from `get-config.ts` means you need to run `npm run set-production-config`.

## Local development

```bash
nvm use            # Node 22
npm install        # workspace install at root
npm run dev        # builds extensions, boots Directus on http://localhost:8055
```

Login: `admin@example.com` / `d1r3ctu5` (seeded once into the gitignored `development/data/data.db`).

What `scripts/dev.mjs` does:

1. Ensures `extensions/common/config/config.json` exists.
2. Runs an initial unminified build of both extensions.
3. Symlinks each extension into `development/extensions/<published-name>/` so `EXTENSIONS_PATH` is isolated from `extensions/common` (Directus would otherwise warn that `common/` lacks a `directus:extension` field).
4. Bootstraps the SQLite DB if `data.db` doesn't exist yet.
5. Starts watch builds (`directus-extension build --watch`) for both extensions in parallel with Directus, so saved edits land in the running admin without a manual restart.

To reset all local state:

```bash
rm -rf development/data development/uploads development/extensions
```

## Commands

| Command                     | What it does                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `npm install`               | Install all workspaces. Run once after a clone or after pulling dependency changes. |
| `npm run dev`               | Local dev loop — Directus + SQLite + watch builds.                                  |
| `npm run lint`              | ESLint across the monorepo.                                                         |
| `npm run lint:fix`          | Same, with autofix.                                                                 |
| `npm run format`            | Prettier check (fails if anything isn't formatted).                                 |
| `npm run format:fix`        | Prettier write.                                                                     |
| `npm run typecheck`         | `vue-tsc --noEmit` — typechecks `.ts` and `.vue` files.                             |
| `npm run test`              | Vitest run.                                                                         |
| `npm run test:watch`        | Vitest in watch mode.                                                               |
| `npm run test:coverage`     | Vitest with v8 coverage report (text + HTML at `coverage/` + lcov).                 |
| `npm run check`             | Aggregate: `lint && format && test`.                                                |
| `npm run check:fix`         | Aggregate fix: `lint:fix && format:fix`.                                            |
| `npm run knip`              | Detect unused files, deps, and exports. Local only (not gated in CI).               |
| `npm run build`             | Minified production build of both extensions. This is what release publishes.       |
| `npm run build:development` | Unminified build (faster, used by `dev`).                                           |

CI (`.github/workflows/qa.yml`) runs `npm run check` then a production build on every PR. Release (`.github/workflows/release.yml`) is triggered by pushes to `main` and uses `localazy/release@v2` to bump versions, generate the changelog, build, and publish to npm.

## Coding conventions

- **Avoid `as any` and `as unknown` casts unless truly necessary.** Both bypass TypeScript's safety net and tend to mask real bugs. Prefer real types — even partial ones via `Partial<T>` / `Pick<T, K>` — or narrow the consumer's signature so the cast isn't needed. When a cast is unavoidable (mocking a complex third-party type in a test is the most common case), use a single targeted cast (`as TargetType`) rather than the `as unknown as TargetType` double-cast escape hatch, and keep its scope as small as possible.
