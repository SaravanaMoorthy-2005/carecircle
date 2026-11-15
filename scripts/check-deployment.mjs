import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const vercel = JSON.parse(await readFile('vercel.json', 'utf8'));
const gitIgnore = await readFile('.gitignore', 'utf8');
assert(
  !/^\s*(?:\*\*\/)?lib\/?\s*$/m.test(gitIgnore),
  'A global lib ignore would omit apps/web/src/lib from a fresh checkout',
);
await readFile('apps/web/src/lib/firebase.ts');
assert.equal(vercel.outputDirectory, 'apps/web/dist');
assert.equal(vercel.rewrites[0].destination, '/index.html');
await readFile('apps/web/dist/index.html');
await readFile('apps/web/dist/messaging-sw.js');
const config = JSON.parse(await readFile('firebase.json', 'utf8'));
assert(
  config.functions[0].ignore.includes('.runtime/**'),
  'Captured local mail must never be deployed',
);
assert(
  config.functions[0].ignore.includes('.secret.local'),
  'Local secrets must never be deployed',
);
const assets = await readdir('apps/web/dist/assets');
for (const file of assets.filter((file) => file.endsWith('.js'))) {
  const source = await readFile(`apps/web/dist/assets/${file}`, 'utf8');
  for (const secret of [
    'INVITATION_HMAC_SECRET',
    'SMTP_PASSWORD',
    'NOTES_ENCRYPTION_KEY',
    'firebase-admin',
    'demo-carecircle-emulator-only',
  ])
    assert(!source.includes(secret), `Backend-only marker leaked into browser bundle: ${secret}`);
}
console.log(
  'Source inclusion, deployment paths, SPA output, service worker, local-mail exclusions, and browser secret boundaries verified.',
);
