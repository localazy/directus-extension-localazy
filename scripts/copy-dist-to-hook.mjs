import fse from 'fs-extra';

const copy = () => {
  fse.copySync('./extensions/sync-hook/dist', './development/extensions/directus-extension-localazy-automation/dist', { recursive: true });
  fse.copyFileSync('./extensions/sync-hook/package.json', './development/extensions/directus-extension-localazy-automation/package.json');
};

copy();
