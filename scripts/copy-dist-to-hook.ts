import fs from 'fs';

const copy = () => {
  fs.cpSync('./extensions/sync-hook/dist', './development/extensions/directus-extension-localazy', { recursive: true });
  fs.cpSync('./extensions/sync-hook/package.json', './development/extensions/directus-extension-localazy/package.json');
};

copy();
