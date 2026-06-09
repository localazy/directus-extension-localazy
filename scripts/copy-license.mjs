import { copyFileSync } from 'node:fs';

copyFileSync('./LICENSE', './packages/module/LICENSE');
copyFileSync('./LICENSE', './packages/sync-hook/LICENSE');
