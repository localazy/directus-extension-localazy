import fs from 'fs';

const copy = () => {
  fs.cpSync('./extensions/module/dist', './development/extensions/directus-extension-localazy', { recursive: true });
  fs.cpSync('./extensions/module/package.json', './development/extensions/directus-extension-localazy/package.json');
};

copy();
