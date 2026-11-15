import { build } from 'esbuild';
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'lib/index.cjs',
  sourcemap: true,
  external: [
    'firebase-admin',
    'firebase-admin/*',
    'firebase-functions',
    'firebase-functions/*',
    'nodemailer',
    '@google-cloud/kms',
  ],
});
