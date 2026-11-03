#!/usr/bin/env node
// Seed npm's content cache without changing the private package's locked source.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  console.log('Usage: node scripts/cache-ui.mjs [path/to/ui.tgz]\n\nSupply an authorised local tarball as the argument or STUNTROCKET_UI_TARBALL.\nIts SHA-512 must match @stuntrocket/ui in package-lock.json before npm caches it.');
  process.exit(0);
}

try {
  if (args.length > 1 || args.some(arg => arg.startsWith('-'))) {
    throw new Error('Expected one local tarball path; use --help for usage.');
  }
  const tarball = args[0] || process.env.STUNTROCKET_UI_TARBALL;
  if (!tarball || /^[a-z][a-z\d+.-]*:/i.test(tarball)) {
    throw new Error('Supply an authorised local tarball path as an argument or STUNTROCKET_UI_TARBALL; URLs are not accepted.');
  }
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const ui = lock.packages?.['node_modules/@stuntrocket/ui'];
  if (!ui?.version || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(ui.integrity ?? '')) {
    throw new Error('package-lock.json must pin @stuntrocket/ui with one SHA-512 integrity value.');
  }
  const localPath = resolve(tarball);
  const integrity = `sha512-${createHash('sha512').update(readFileSync(localPath)).digest('base64')}`;
  if (integrity !== ui.integrity) {
    throw new Error(`@stuntrocket/ui ${ui.version} tarball integrity differs from package-lock.json; obtain the exact authorised archive.`);
  }
  execFileSync('npm', ['cache', 'add', localPath], { cwd: projectRoot, stdio: 'inherit' });
  console.log(`Verified and cached @stuntrocket/ui ${ui.version}. Run npm ci --prefer-offline.`);
} catch (error) {
  console.error(`UI cache: ${error.message}`);
  process.exitCode = 1;
}
