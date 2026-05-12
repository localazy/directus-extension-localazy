# CLAUDE.md

Context for AI assistants (Claude Code, Cursor, etc.) working in this repo. Read this before making non-trivial changes.

## What this repo is

A monorepo of **two published Directus extensions** plus one **internal shared package**:

| Path                    | npm name                                           | Purpose                                                                                                                                                                                                            |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `extensions/module/`    | `@localazy/directus-extension-localazy`            | UI module — runs in the admin browser. Sandbox-compatible by nature (browser context). Listable on Directus Marketplace without `MARKETPLACE_TRUST`.                                                               |
| `extensions/sync-hook/` | `@localazy/directus-extension-localazy-automation` | Server-side hook — runs in the Directus Node process. Uses `ItemsService` + `FieldsService`, makes outbound HTTP to Localazy. **Cannot be sandboxed.** Marketplace listing requires `MARKETPLACE_TRUST: 'all'`.    |
| `extensions/common/`    | `localazy-directus-common`                         | Internal-only. Shared TypeScript code (services, models, types). **Not published.** Both extensions import via relative paths (`../../common/...`); Rollup inlines its code into each extension's `dist/index.js`. |

## Stack

- **Node 22** (`.nvmrc`). Matches what `directus/directus:11` runs internally.
- **npm workspaces** at the repo root. Do _not_ convert to pnpm — `localazy/release@v2` is npm-hardcoded (see `prepare/`, `publish/`, `setup-npm/` on `@v2`). Going pnpm requires forking that action.
- **ESLint 10** flat config (`eslint.config.js`) + `typescript-eslint@8` + `eslint-plugin-vue@10` (flat presets) + `eslint-config-prettier`. Per-workspace globals: browser for `module/` and `common/`, node for `sync-hook/`.
- **Prettier 3** (`.prettierrc.json`). Single quotes, semicolons, trailing commas, `printWidth: 140` (matches the `vue/max-len` lint rule — don't drop one without the other).
- **TypeScript** `^5.9.3`. Typechecking uses **`vue-tsc --noEmit`** (regular `tsc` won't understand `<script lang="ts">` in `.vue` files).
- **No Docker.** Dev environment is a local Directus instance against SQLite. See "Dev workflow" below.

## Architecture notes

- **Module is Vue 3 + Pinia.** Source under `extensions/module/src/`. SFC `.vue` files use `<script setup lang="ts">`. State is in `stores/` (Pinia), composables in `composables/`, services in `services/`. The build output (`dist/index.js`) is what Directus loads at runtime.
- **Hook is plain TypeScript.** Entry point `extensions/sync-hook/src/index.ts` registers `action()` callbacks for `settings.*`, `translations.*`, and `items.*` lifecycle events. The hook calls service classes in `services/content-synchronization/` and `services/` that in turn use Directus' `ItemsService` and the Localazy API client.
- **`extensions/common/` has no `src/` subdir** — its sources live directly under `api/`, `services/`, `utilities/`, etc. Different from `module/` and `sync-hook/`, which both have `src/`.
- **Config is build-time-baked.** `extensions/common/config/config.json` is _generated_ by `scripts/set-config.mjs` from `config.production.json` (or `config.demo.json`). It's gitignored. Both `npm run build` and `npm run dev` run `set-production-config` automatically. If you see a missing-file error from `get-config.ts`, run `npm run set-production-config`.

## Dev workflow

```bash
nvm use            # Node 22
npm install        # workspace install at root
npm run dev        # builds extensions, boots Directus on http://localhost:8055
```

Login: `admin@example.com` / `d1r3ctu5` (seeded once into the gitignored `development/data/data.db`).

What `scripts/dev.mjs` does:

1. Ensures `extensions/common/config/config.json` exists.
2. Runs an initial unminified build of both extensions.
3. Symlinks the two extensions into `development/extensions/<published-name>/` so `EXTENSIONS_PATH` is isolated from `extensions/common` (Directus would otherwise warn that `common/` lacks a `directus:extension` field).
4. Bootstraps the SQLite DB if `data.db` doesn't exist yet.
5. Starts watch builds (`directus-extension build --watch`) for both extensions in parallel with Directus.

To reset state:

```bash
rm -rf development/data development/uploads development/extensions
```

## Build & release

| Command                     | Output                                          | When                                                                |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| `npm run build`             | Minified production bundles (~386 KB + ~610 KB) | CI, release                                                         |
| `npm run build:development` | Unminified bundles (~1.1 MB + ~1.3 MB)          | Local dev / dev.mjs                                                 |
| `npm run lint`              | `eslint .` over the whole monorepo              | CI, local                                                           |
| `npm run format`            | `prettier --check .`                            | CI                                                                  |
| `npm run format:fix`        | `prettier --write .`                            | Local                                                               |
| `npm run typecheck`         | `vue-tsc --noEmit`                              | Local only; **not yet gated in CI** (see "Known type errors" below) |
| `npm run dev`               | Local Directus + watch builds                   | Local                                                               |

**CI** (`qa.yml`): runs lint → format → minified build. Triggered by PRs to `main` or `next`.

**Release** (`release.yml`): triggered by pushes to `main`. Uses `localazy/release@v2` to bump versions, generate changelog, build, and publish to npm. **Do not call this workflow on `next`** — it's scoped to `main` so `next` is a pure integration branch.

## Branching model (during 2.0 work)

- **`main`** is **frozen at the 1.0.x line.** No backports, no hotfixes (the platform underneath — Directus 10 + Node 18 — is past support).
- **`next`** is the **integration branch for the 2.0 release.** PRs target `next`. When `next` is ready, it gets merged into `main`, which triggers the release pipeline.
- **PR branches** follow `pr/NN-short-name` (e.g., `pr/01-infra-foundation`).
- Each PR is squash-merged into `next` with a descriptive title.

## Stage 1 vs Stage 2 scope

The 2.0 release happens in two stages, both landing on the same `next` branch.

**Stage 1 — Infrastructure modernization (in progress).** No application-logic changes. Allowed: tooling, build config, deps, CI, and _bounded completion_ (removing dead code only there because of the old stack — e.g., `copy-dist-*` scripts, Docker artifacts, Directus 10 compat shims).

**Stage 2 — Application-logic refactor (not yet planned).** Sync service architecture, OAuth flow, state management, file organization. Touches the load-bearing code.

If a change is to sync service code, store internals, or component structure → it's Stage 2. Hold it.

## Gotchas (where AI assistants frequently get tripped up)

- **`extensions/common` is not a Directus extension.** It has no `directus:extension` field in its `package.json`. Don't add one. Don't try to "fix" the missing field. The dev script symlink layout avoids the issue.
- **Relative imports across packages are intentional.** Code in `module/src/` imports from `common/` via `../../common/...`. There's no `tsconfig.paths` alias. Don't add one in Stage 1 — it would force restructuring ~50 import sites for no current win.
- **`directus:extension.host` is still `^10.10.0`** in both extension `package.json` files as of mid-Stage-1. **PR 4** bumps it to `^11.0.0` and removes Directus 10 compat shims. Until then, leave it.
- **Don't drop the `--no-minify` flag** from `build:module:dev` / `build:hook:dev`. The dev loop relies on readable bundles for stack traces.
- **`localazy/release@v2` is npm-only.** No pnpm, no Yarn. If you regenerate the lockfile, use `npm` only.
- **The `MARKETPLACE_TRUST: 'all'` env var in `dev.mjs`** is for the _dev_ environment. It's _not_ set in production deployments — end users need to set it themselves if they want to install the hook from Marketplace. Documented in `extensions/sync-hook/README.md`. Don't remove the dev-side setting.
- **Pinia is a runtime peer dep**, not bundled. The version declared in `extensions/module/package.json` is for type/dev consistency; at runtime Directus provides its own Pinia. Be cautious bumping the major.
- **Bundle size matters.** The module bundle is loaded by every admin user. Removing unused imports or dead code is welcomed; adding new heavyweight deps without justification is not.

## Known type errors (deferred)

`npm run typecheck` reports these as of Stage 1. They're real bugs, but **fixing them is Stage 2 scope** — don't touch in Stage 1 PRs:

- **`@directus/types` duplication** — `@directus/extensions-sdk@12` bundles an older `@directus/types`; root has a newer one. Causes `SchemaOverview`/`FieldOverview` mismatch errors. Expected to clear with `@directus/extensions-sdk@14` in PR 4.
- **`boolean === number` comparisons** in two sync services (`collection-content-synchronization-service.ts:97`, `translation-strings-synchronization-service.ts:95`).
- **`DirectusApiService` is missing methods** declared in its `DirectusApi` interface (`fetchDirectusSingletonItem`, `createField`).
- **`fetchDirectusItems<T>` generic variance** — return type doesn't match the interface signature.
- **`loadProject` unused import** in `export-to-localazy-service.ts`.

After PR 4 + Stage 2 fixes, the `typecheck` script will be wired into CI.

## When in doubt

- Check the PR plan / decisions captured in conversation. If unsure, ask before touching `sync-hook/` services, `module/stores/`, or the OAuth flow.
- Prefer reading the failing CI logs over guessing what changed.
- The repo's release notes (CHANGELOG.md) and per-extension READMEs (`extensions/{module,sync-hook}/README.md`) are the source of truth for user-facing behavior.
