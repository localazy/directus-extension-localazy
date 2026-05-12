# Localazy Directus Extension Monorepo
This is a monorepo consisting of following Localazy extensions for [Directus](https://directus.io/)
1. Module - adds Localazy menu item and enables manual synchronization of content with Localazy
2. Sync-hook - extends the core functionality by automating content upload from Directus to Localazy 

Please refer to [Localazy Directus Extension](extensions/module/README.md) and [Localazy Directus Extension Automation](extensions/sync-hook/README.md) for more information about each extension. 

## Contributing

### Prerequisites
- Node 22 (see `.nvmrc`). With nvm: `nvm use`.
- No Docker required — the dev loop uses a local Directus instance against SQLite.

### Local development

1. Install dependencies once at the repo root (workspaces handle the sub-packages):
   ```bash
   npm install
   ```
2. Start the dev loop:
   ```bash
   npm run dev
   ```
   This will:
   - Build both extensions once.
   - Start a local Directus instance backed by a SQLite database under `development/data/`.
   - Watch-rebuild both extensions on change; Directus auto-reloads when the bundles update, so saved edits appear in the admin without a manual restart.
3. Open the admin UI at **http://localhost:8055/admin** and sign in:

   | Field | Value |
   |---|---|
   | Email | `admin@example.com` |
   | Password | `d1r3ctu5` |

   These credentials are local-only — they're seeded by `scripts/dev.mjs` and live in the gitignored `development/data/data.db`.

### Reset the local Directus state

Delete the data directory to wipe the SQLite database, uploads, and the symlinked extensions layout. Next `npm run dev` re-bootstraps from scratch:
```bash
rm -rf development/data development/uploads development/extensions
```

### Useful scripts

- `npm run build` — production-style build of both extensions (mode = production, minified).
- `npm run build:development` — non-minified build (what `dev` runs internally).
- `npm run lint` — lint both extensions.

## 📚 Documentation

- [Localazy Directus Plugin](https://localazy.com/docs/directus/directus-plugin-introduction-installation)
- [Getting Started With Localazy](https://localazy.com/docs/general/getting-started-with-localazy)
- [Changelog](CHANGELOG.md)


### Useful links

- [Directus Components Overview](https://components.directus.io/)
- [Directus Content Translation Guide](https://docs.directus.io/guides/headless-cms/content-translations.html)

## 🛟 Support

Join the [Localazy Discussion Forum](https://discuss.localazy.com/) to discuss anything localization related.

If you encounter any problems or have questions, you can use our forum or contact us at
team@localazy.com.

## ❤️ Localazy Ecosystem

Check out other npm packages from Localazy:

| NPM package                                                                      | Description                                  |
|:--------------------------------------------------------------------------------------|----------------------------------------------|
| [@localazy/cli](https://www.npmjs.com/package/@localazy/cli)                     | Localazy CLI tool.                           |
| [@localazy/api-client](https://www.npmjs.com/package/@localazy/api-client)           | Localazy API client.                         |
| [@localazy/languages](https://www.npmjs.com/package/@localazy/languages)         | List of all languages supported by Localazy. |
[@localazy/strapi-plugin](https://www.npmjs.com/package/@localazy/strapi-plugin) | The official Localazy Strapi plugin.         |

Discover all available [integration options and localization examples](https://github.com/localazy).

