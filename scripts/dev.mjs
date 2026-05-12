import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, symlinkSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const configPath = resolve(root, 'extensions/common/config/config.json');
const productionConfigPath = resolve(root, 'extensions/common/config/config.production.json');
if (!existsSync(configPath)) {
  copyFileSync(productionConfigPath, configPath);
}

const dataDir = resolve(root, 'development/data');
const dbFile = resolve(dataDir, 'data.db');
const uploadsDir = resolve(root, 'development/uploads');
const extensionsDir = resolve(root, 'development/extensions');
mkdirSync(dataDir, { recursive: true });
mkdirSync(uploadsDir, { recursive: true });
mkdirSync(extensionsDir, { recursive: true });

// Symlink only the published extensions into development/extensions so Directus
// does not try to load extensions/common as an extension.
const symlinks = [
  ['directus-extension-localazy', resolve(root, 'extensions/module')],
  ['directus-extension-localazy-automation', resolve(root, 'extensions/sync-hook')],
];
for (const [name, target] of symlinks) {
  const linkPath = resolve(extensionsDir, name);
  rmSync(linkPath, { recursive: true, force: true });
  symlinkSync(target, linkPath, 'dir');
}

console.log('[dev] running initial extension build');
const initBuild = spawnSync('npm', ['run', 'build:development'], { stdio: 'inherit', cwd: root });
if (initBuild.status !== 0) process.exit(initBuild.status ?? 1);

const directusEnv = {
  ...process.env,
  KEY: '255d861b-5ea1-5996-9aa3-922530ec40b1',
  SECRET: '6116487b-cda1-52c2-b5b5-c8022c45e263',
  DB_CLIENT: 'sqlite3',
  DB_FILENAME: dbFile,
  STORAGE_LOCATIONS: 'local',
  STORAGE_LOCAL_ROOT: uploadsDir,
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'd1r3ctu5',
  EXTENSIONS_PATH: extensionsDir,
  EXTENSIONS_AUTO_RELOAD: 'true',
  MARKETPLACE_TRUST: 'all',
  PUBLIC_URL: 'http://localhost:8055',
};

if (!existsSync(dbFile)) {
  console.log('[dev] bootstrapping Directus database');
  const bootstrap = spawnSync('npx', ['directus', 'bootstrap'], { stdio: 'inherit', cwd: root, env: directusEnv });
  if (bootstrap.status !== 0) process.exit(bootstrap.status ?? 1);
}

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 500).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function spawnLong(label, cmd, args, env = directusEnv) {
  const child = spawn(cmd, args, { stdio: 'inherit', cwd: root, env });
  child.on('exit', (code) => {
    console.log(`[${label}] exited with code ${code}`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

spawnLong(
  'module',
  'npm',
  ['run', 'build', '--workspace=@localazy/directus-extension-localazy', '--', '--no-minify', '--watch'],
  process.env,
);
spawnLong(
  'hook',
  'npm',
  ['run', 'build', '--workspace=@localazy/directus-extension-localazy-automation', '--', '--no-minify', '--watch'],
  process.env,
);

console.log('[dev] starting Directus at http://localhost:8055');
spawnLong('directus', 'npx', ['directus', 'start']);
