import { copyFileSync } from 'node:fs';

const mode = process.argv.find((arg) => arg.includes('mode='));
if (mode && mode.includes('production')) {
  copyFileSync('./extensions/common/config/config.production.json', './extensions/common/config/config.json');
}
if (mode && mode.includes('demo')) {
  copyFileSync('./extensions/common/config/config.demo.json', './extensions/common/config/config.json');
}
