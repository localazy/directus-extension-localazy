# Localazy Directus Extension Monorepo
This is a monorepo consisting of following Localazy extensions for [Directus](https://directus.io/)
1. Module - adds Localazy menu item and enables manual synchronization of content with Localazy
2. Sync-hook - extends the core functionality by automating content upload from Directus to Localazy 

Please refer to [Localazy Directus Extension](extensions/module/README.md) and [Localazy Directus Extension Automation](extensions/sync-hook/README.md) for more information about each extension. 

## Contributing
Requires Node 22 (see `.nvmrc`). No Docker.

- Run `npm install` once at the repo root (workspaces install all sub-packages).
- Run `npm run dev`
  - Performs an initial build of both extensions, then starts a local Directus instance against SQLite under `development/data/` with both extensions watch-rebuilding on change.
  - Directus auto-reloads the extensions when their `dist/` changes, so saved edits land in the running admin without a manual restart.
  - To reset state, delete `development/data/`.
- Open `http://localhost:8055/admin`
  - user: admin@example.com
  - pwd: d1r3ctu5

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

