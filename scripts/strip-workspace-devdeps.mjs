// Strips workspace:* devDependencies from package.json before pnpm pack and
// restores afterward. Invoked from each extension's `prepack` / `postpack`
// lifecycle scripts.
//
// Why: pnpm pack rewrites `"@localazy/directus-common": "workspace:*"` to the
// concrete version of common (e.g. `"2.0.0"`) in the published tarball. But
// common is `private: true` and never published, so anything that walks
// devDependencies of the published extension (Dependabot, security scanners,
// `npm install --include=dev`) will 404 trying to resolve that phantom dep.
// End users running `npm install <extension>` aren't affected (devDeps are
// skipped for non-roots), but the entry is misleading and breaks tooling.
//
// Common's source is already inlined into each extension's `dist/` at build
// time by the Directus SDK's rollup config, so the devDep declaration only
// exists for typecheck/build resolution — it has no purpose in the published
// tarball.
//
// Usage:
//   node ../../scripts/strip-workspace-devdeps.mjs strip      (in prepack)
//   node ../../scripts/strip-workspace-devdeps.mjs restore    (in postpack)

import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const mode = process.argv[2];
const target = './package.json';
const backup = './package.json.prepack-backup';

if (mode === 'strip') {
  copyFileSync(target, backup);
  const pkg = JSON.parse(readFileSync(target, 'utf-8'));

  const removed = [];
  if (pkg.devDependencies) {
    for (const [name, value] of Object.entries(pkg.devDependencies)) {
      if (typeof value === 'string' && value.startsWith('workspace:')) {
        removed.push(name);
        delete pkg.devDependencies[name];
      }
    }
  }

  writeFileSync(target, JSON.stringify(pkg, null, 2) + '\n');
  if (removed.length) {
    console.log(`[prepack] stripped workspace devDeps: ${removed.join(', ')}`);
  }
} else if (mode === 'restore') {
  if (existsSync(backup)) {
    renameSync(backup, target);
    console.log('[postpack] restored package.json');
  }
} else {
  console.error('Usage: strip-workspace-devdeps.mjs <strip|restore>');
  process.exit(1);
}
