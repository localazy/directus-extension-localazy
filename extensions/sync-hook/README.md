<p align="center">
  <a href="https://localazy.com">
    <img src="https://directus9.localazy.com/assets/9fc36b9c-81b7-4dbf-bd82-b64cd984090f" width="285" height="50" alt="Localazy" >
  </a>
</p>
<p align="center">
  <a href="https://npmjs.com/package/@localazy/directus-extension-localazy"><img src="https://img.shields.io/badge/@localazy-directus--extension--localazy-066fef?style=for-the-badge" height="22" alt="@localazy/directus-extension-localazy"></a>
  <!-- <a href="https://npmjs.com/package/@localazy/directus-extension-localazy"><img src="https://img.shields.io/npm/v/@localazy/directus-extension-localazy
?style=for-the-badge&label=version&color=066fef" height="22" alt="npm"></a> -->
  <br>
</p>

# 📦 Directus Extension Localazy Automation

> Enhance your experience of [Directus Extension Localazy](https://github.com/localazy/directus-extension-localazy) by automating synchronization of your content whenever you make a change in Directus. No more manual uploading.

## ⚠️ Installation requirements

This extension is a **non-sandboxed Directus bundle** (a hook child plus a small endpoint child the module pings to detect whether the bundle is installed) — it uses Directus' `ItemsService` and `FieldsService` directly to read and modify your translatable content. Non-sandboxed extensions are not installed via the Marketplace by default.

**Before installing, set this in your Directus configuration:**

```env
MARKETPLACE_TRUST=all
```

Without it, the Marketplace install will fail silently. After setting it, restart Directus, then search the Marketplace for _Localazy_.

If you prefer to install manually (via `npm install`), this flag is **not** required — manual installs bypass the Marketplace sandbox check entirely.

## 📄 Prerequisites

- Installed & enabled [Directus Extension Localazy](https://github.com/localazy/directus-extension-localazy/tree/main/extensions/module).
- Directus 11+ (see compatibility table below).

## 🧭 Compatibility

| Extension version | Directus   | Notes                                                                                                                 |
| ----------------- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `2.x`             | `^11.0.0`  | Current.                                                                                                              |
| `1.x`             | `^10.10.0` | Frozen. Pin with `npm install @localazy/directus-extension-localazy-automation@^1` if you can't upgrade Directus yet. |

## 🔧 Install

### Manually

```bash
npm install @localazy/directus-extension-localazy-automation
# or you can use yarn or pnpm
```

### Via Marketplace

See [Installation requirements](#%EF%B8%8F-installation-requirements) at the top of this README — `MARKETPLACE_TRUST=all` must be set in your Directus configuration before the Marketplace will show this extension. Then search for _Localazy_.

## 📚 Documentation

- [Localazy Directus Plugin](https://localazy.com/docs/directus/directus-plugin-introduction-installation)
- [Getting Started With Localazy](https://localazy.com/docs/general/getting-started-with-localazy)
<!-- - [Changelog](CHANGELOG.md) -->

<!-- ## ℹ️ Links

- [Localazy API documentation](https://localazy.com/docs/api)
- [Articles about the Localazy API](https://localazy.com/tags/api) -->

## 🛟 Support

Join the [Localazy Discussion Forum](https://discuss.localazy.com/) to discuss anything localization related.

If you encounter any problems or have questions, you can use our forum or contact us at
team@localazy.com.

## ❤️ Localazy Ecosystem

Check out other npm packages from Localazy:

| NPM package                                                                      | Description                                  |
| :------------------------------------------------------------------------------- | -------------------------------------------- |
| [@localazy/cli](https://www.npmjs.com/package/@localazy/cli)                     | Localazy CLI tool.                           |
| [@localazy/api-client](https://www.npmjs.com/package/@localazy/api-client)       | Localazy API client.                         |
| [@localazy/languages](https://www.npmjs.com/package/@localazy/languages)         | List of all languages supported by Localazy. |
| [@localazy/strapi-plugin](https://www.npmjs.com/package/@localazy/strapi-plugin) | The official Localazy Strapi plugin.         |

Discover all available [integration options and localization examples](https://github.com/localazy).
