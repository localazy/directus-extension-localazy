# Contributing

Thanks for your interest in contributing to the Localazy Directus extension.

## Project layout

This is an npm-workspaces monorepo with three packages under `extensions/`:

| Path                    | Published as                                       | Purpose                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extensions/module/`    | `@localazy/directus-extension-localazy`            | UI module (Vue 3 + Pinia). The Localazy admin pages — Overview, Import & Export, Project Setup, Additional Settings, About.                                                                                                                                               |
| `extensions/sync-hook/` | `@localazy/directus-extension-localazy-automation` | Server-side bundle (plain TypeScript). Two children: a **hook** that automates content upload on Directus item / translation / settings changes, and an **endpoint** exposing `GET /localazy-automation/status` so the module can detect whether the bundle is installed. |
| `extensions/common/`    | (internal)                                         | Shared TypeScript code — services, models, types — consumed by both extensions. Not published; Rollup inlines it into each extension's bundle.                                                                                                                            |

## Prerequisites

- Node 22 (see `.nvmrc`). With nvm: `nvm use`.
- No Docker required — the dev loop uses a local Directus instance against SQLite.

## Install

```bash
npm install
```

Workspaces handle the sub-packages — one install at the root.

## Local development

```bash
npm run dev
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

To wipe the SQLite database, uploads, and the symlinked extensions layout, delete the data directory. The next `npm run dev` re-bootstraps from scratch:

```bash
rm -rf development/data development/uploads development/extensions
```

## Scripts

### Verification

| Command                 | What it does                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `npm run check`         | Aggregate: `lint && format && typecheck && test`. The one command that mirrors CI. |
| `npm run check:fix`     | Aggregate fix: `lint:fix && format:fix`.                                           |
| `npm run lint`          | ESLint across the monorepo.                                                        |
| `npm run lint:fix`      | Same, with autofix.                                                                |
| `npm run format`        | Prettier check. Fails if anything isn't formatted.                                 |
| `npm run format:fix`    | Prettier write.                                                                    |
| `npm run typecheck`     | `vue-tsc --noEmit` — typechecks `.ts` and `.vue` files.                            |
| `npm run test`          | Vitest run (one-shot).                                                             |
| `npm run test:watch`    | Vitest in watch mode.                                                              |
| `npm run test:coverage` | Vitest with v8 coverage (text + HTML at `coverage/` + lcov).                       |
| `npm run knip`          | Detect unused files, dependencies, and exports. Local only — not gated in CI.      |

### Building

| Command                     | What it does                                                            |
| --------------------------- | ----------------------------------------------------------------------- |
| `npm run build`             | Production build of both extensions (minified). What release publishes. |
| `npm run build:development` | Non-minified build (faster, used by `dev`).                             |

## Continuous integration

`.github/workflows/qa.yml` runs on every PR:

1. `npm run check` — lint, format, typecheck, tests
2. Production build of both extensions

If `npm run check` passes locally, CI should pass too.

## Useful references

- [Directus Components Playground](https://components.directus.io/) — the UI library both extensions can use.
- [Directus content translation guide](https://docs.directus.io/guides/headless-cms/content-translations.html) — required reading if you're working on the sync flow.
