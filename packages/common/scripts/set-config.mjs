import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const configDir = resolve(here, '../src/config');

const mode = process.argv.find((arg) => arg.includes('mode='));
if (mode && mode.includes('production')) {
  copyFileSync(resolve(configDir, 'config.production.json'), resolve(configDir, 'config.json'));
}
if (mode && mode.includes('demo')) {
  copyFileSync(resolve(configDir, 'config.demo.json'), resolve(configDir, 'config.json'));
}
