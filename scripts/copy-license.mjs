import { copyFileSync } from 'node:fs';

copyFileSync('./LICENSE', './extensions/module/LICENSE');
copyFileSync('./LICENSE', './extensions/sync-hook/LICENSE');
