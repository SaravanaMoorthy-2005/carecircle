import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
export async function rateLimit(
  db: Firestore,
  key: string,
  limit: number,
  now: number,
  windowMs = 60000,
) {
  const ref = db.collection('rateLimits').doc(createHash('sha256').update(key).digest('hex'));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const previous = snap.data();
    const reset = !previous || previous.resetAt <= now;
    const count = reset ? 0 : Number(previous.count);
    if (count >= limit)
      throw new HttpsError('resource-exhausted', 'Too many requests. Please try again later.');
    tx.set(ref, {
      count: count + 1,
      resetAt: reset ? now + windowMs : previous?.resetAt,
      expiresAt: new Date(now + windowMs * 2),
    });
  });
}
