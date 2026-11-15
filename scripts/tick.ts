import { extendWellbeing } from '../functions/src/care/companion';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { emulatorAdmin } from '../tests/helpers';
import { extendSchedules } from '../functions/src/medications/service';
import { processJobs } from '../functions/src/notifications/worker';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
const { db } = emulatorAdmin('demo-carecircle');
const now = Date.now();
await extendSchedules({ db, now });
await extendWellbeing({ db, now });
const result = await processJobs({
  db,
  now,
  appUrl: 'http://127.0.0.1:5173',
  mailer: {
    async send(mail) {
      await mkdir('.runtime/mail', { recursive: true });
      await writeFile(
        `.runtime/mail/${createHash('sha256').update(mail.messageId).digest('hex')}.json`,
        JSON.stringify(mail),
      );
    },
  },
});
console.log(`Processed ${result.processed} due reminder jobs in the local demo project.`);
