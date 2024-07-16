import fse from 'fs-extra';

const copy = () => {
  fse.copySync('./extensions/module/dist', './development/extensions/directus-extension-localazy/dist', { recursive: true });
  fse.copyFileSync('./extensions/module/package.json', './development/extensions/directus-extension-localazy/package.json');
};

copy();
