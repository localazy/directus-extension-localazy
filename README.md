# Localazy Directus Extension Monorepo
This is a monorepo consisting of following Localazy extensions for [Directus](https://directus.io/)
1. Module - adds Localazy menu item and enables manual synchronization of content with Localazy
2. Sync-hook - extends the core functionality by automating content upload from Directus to Localazy 

Please refer to [Localazy Directus Extension](extensions/module/README.md) and [Localazy Directus Extension Automation](extensions/sync-hook/README.md) for more information about each extension. 

## Contributing
> Check that your [Docker](https://www.docker.com/products/docker-desktop/) engine is running
- Run `npm run dev`
  - This will start the dockerized environment and will automatically synchronize any changes you make to the Directus' extensions folder
  - In order to propagate the changes, the docker container is always restarted. Depending on the power your computing power, this could take a second or two.
- Open `http://localhost:8055/admin`
  - user: admin@example.com
  - pwd: d1r3ctu5

### Useful links
- [Directus Components Overview](https://components.directus.io/)

