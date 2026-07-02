<p align="center">
  <a href="https://localazy.com">
    <img src="https://raw.githubusercontent.com/localazy/directus-extension-localazy/main/packages/module/assets/logo.svg" width="285" height="50" alt="Localazy" >
  </a>
</p>
<p align="center">
  <a href="https://npmjs.com/package/@localazy/directus-extension-localazy"><img src="https://img.shields.io/badge/@localazy-directus--extension--localazy-066fef?style=for-the-badge" height="22" alt="@localazy/directus-extension-localazy"></a>
  <!-- <a href="https://npmjs.com/package/@localazy/directus-extension-localazy"><img src="https://img.shields.io/npm/v/@localazy/directus-extension-localazy
?style=for-the-badge&label=version&color=066fef" height="22" alt="npm"></a> -->
  <br>
</p>

# 📦 Directus Extension Localazy

> Turn translation of your Directus project into a seamless experience.

![Directus Extension Localazy](https://raw.githubusercontent.com/localazy/directus-extension-localazy/main/packages/module/assets/banner.png)

## 🌐 About

The Directus localization extension by Localazy allows you to synchronize your content with [Localazy](https://localazy.com/docs/directus/directus-plugin-introduction-installation) and translate it with available tools. You can manage your language versions separately in Localazy and import new content for translation as you add it seamlessly without manual copypasting or file importing.

## 📄 Prerequisites

- Directus 11 or 12 (see compatibility table below).
- [Your project is set up for translations](https://docs.directus.io/guides/headless-cms/content-translations.html)

## 🧭 Compatibility

| Extension version | Directus               | Notes                                                                                                      |
| ----------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `2.x`             | `^11.0.0 \|\| ^12.0.0` | Current. Supports Directus 11 and 12.                                                                      |
| `1.x`             | `^10.10.0`             | Frozen. Pin with `npm install @localazy/directus-extension-localazy@^1` if you can't upgrade Directus yet. |

## 🔧 Install

### Via Marketplace

Visit Directus's [Marketplace](https://docs.directus.io/extensions/marketplace/publishing.html) in your instance and search for _Localazy_.

### Manually

```bash
npm install @localazy/directus-extension-localazy
# or you can use yarn or pnpm
```

## 📚 Documentation

- [Localazy Directus Plugin](https://localazy.com/docs/directus/directus-plugin-introduction-installation)
- [Getting Started With Localazy](https://localazy.com/docs/general/getting-started-with-localazy)
<!-- - [Changelog](CHANGELOG.md) -->

<!-- ## ℹ️ Links

- [Localazy API documentation](https://localazy.com/docs/api)
- [Articles about the Localazy API](https://localazy.com/tags/api) -->

## Automatically Upload Content

To automatically synchronize your content from Directus to Localazy, see [Directus Extension Localazy Automation](https://github.com/localazy/directus-extension-localazy/blob/main/packages/sync-hook)

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
