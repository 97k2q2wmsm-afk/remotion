// Writes public/sw.js with a unique build id so installed apps detect updates.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const id = `${pkg.version}-${process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? Date.now().toString(36)}`;
writeFileSync(join(root, 'public', 'sw.js'), readFileSync(join(root, 'scripts', 'sw-template.js'), 'utf8').replace('__BUILD_ID__', id));
console.log(`[build-sw] public/sw.js version ${id}`);
