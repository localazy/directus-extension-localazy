# Contributing

Thanks for your interest in contributing to the Localazy Directus extension.

## Project layout

This is a pnpm-workspaces monorepo with three packages under `packages/`:

| Path                  | Published as                                       | Purpose                                                                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/module/`    | `@localazy/directus-extension-localazy`            | UI module (Vue 3 + Pinia). The Localazy admin pages — Overview, Import & Export, Project Setup, Additional Settings, About.                                                                                                                                               |
| `packages/sync-hook/` | `@localazy/directus-extension-localazy-automation` | Server-side bundle (plain TypeScript). Two children: a **hook** that automates content upload on Directus item / translation / settings changes, and an **endpoint** exposing `GET /localazy-automation/status` so the module can detect whether the bundle is installed. |
| `packages/common/`    | (internal)                                         | Shared TypeScript code — services, models, types — consumed by both extensions. Not published; Rollup inlines it into each extension's bundle.                                                                                                                            |

## Prerequisites

- Node 22 (see `.nvmrc`). With nvm: `nvm use`.
- pnpm (resolved from the root `packageManager` field — enable via `corepack enable`).

## Install

```bash
pnpm install
```

Workspaces handle the sub-packages — one install at the root.

## Local development

```bash
pnpm dev
```

This will:

- Build both extensions once.
- Start a local Directus instance backed by a SQLite database under `development/data/`.
- Watch-rebuild both extensions on change; Directus auto-reloads when the bundles update, so saved edits appear in the admin without a manual restart.

Open the admin UI at **http://localhost:8055/admin** and sign in:

| Field    | Value               |
| -------- | ------------------- |
| Email    | `admin@example.com` |
| Password | `d1r3ctu5`          |

These credentials are local-only — they're seeded by `scripts/dev.mjs` and live in the gitignored `development/data/data.db`.

### Reset the local state

To wipe the SQLite database, uploads, and the symlinked extensions layout, delete the data directory. The next `pnpm dev` re-bootstraps from scratch:

```bash
rm -rf development/data development/uploads development/extensions
```

## Scripts

### Verification

| Command              | What it does                                                                       |
| -------------------- | ---------------------------------------------------------------------------------- |
| `pnpm check`         | Aggregate: `lint && format && typecheck && test`. The one command that mirrors CI. |
| `pnpm check:fix`     | Aggregate fix: `lint:fix && format:fix`.                                           |
| `pnpm lint`          | ESLint across the monorepo.                                                        |
| `pnpm lint:fix`      | Same, with autofix.                                                                |
| `pnpm format`        | Prettier check. Fails if anything isn't formatted.                                 |
| `pnpm format:fix`    | Prettier write.                                                                    |
| `pnpm typecheck`     | `vue-tsc --noEmit` — typechecks `.ts` and `.vue` files.                            |
| `pnpm test`          | Vitest run (one-shot).                                                             |
| `pnpm test:watch`    | Vitest in watch mode.                                                              |
| `pnpm test:coverage` | Vitest with v8 coverage (text + HTML at `coverage/` + lcov).                       |
| `pnpm knip`          | Detect unused files, dependencies, and exports. Local only — not gated in CI.      |

`typecheck` and `test` run per-package under Turborepo — repeat invocations with no changes are near-instant via the cache. To focus on one workspace:

```bash
pnpm --filter=@localazy/directus-extension-localazy typecheck
pnpm --filter=@localazy/directus-common test
```

### Building

| Command                  | What it does                                                            |
| ------------------------ | ----------------------------------------------------------------------- |
| `pnpm build`             | Production build of both extensions (minified). What release publishes. |
| `pnpm build:development` | Non-minified build (faster, used by `dev`).                             |

## Continuous integration

`.github/workflows/qa.yml` runs on every PR:

1. `pnpm check` — lint, format, typecheck, tests
2. Production build of both extensions

If `pnpm check` passes locally, CI should pass too.

## Useful references

- [Directus Components Playground](https://components.directus.io/) — the UI library both extensions can use.
- [Directus content translation guide](https://docs.directus.io/guides/headless-cms/content-translations.html) — required reading if you're working on the sync flow.
