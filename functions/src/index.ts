import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getMessaging } from 'firebase-admin/messaging';
import { getAuth } from 'firebase-admin/auth';
import { commandSchema } from '@carecircle/shared';
import {
  db,
  isEmulator,
  hmacSecret,
  smtpPassword,
  notesKey,
  appUrl,
  serverHmac,
  mailer,
  vault,
} from './runtime';
import { dispatch } from './callables/service';
import { rateLimit } from './authorization/rate-limit';
import { extendSchedules } from './medications/service';
import { processJobs } from './notifications/worker';
import { extendWellbeing } from './care/companion';

export const careCommand = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: !isEmulator,
    secrets: isEmulator ? [] : [hmacSecret, smtpPassword, notesKey],
    maxInstances: 10,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
    // Production verification also checks expiry; retain this boundary in emulators.
    const expiresAt = Number(request.auth.token.exp);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1000)
      throw new HttpsError('unauthenticated', 'Your session expired. Please sign in again.');
    if (request.auth.token.email_verified !== true || typeof request.auth.token.email !== 'string')
      throw new HttpsError('permission-denied', 'Verify your email address before continuing.');
    if (JSON.stringify(request.data ?? null).length > 64000)
      throw new HttpsError('invalid-argument', 'Request is too large.');
    const parsed = commandSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError('invalid-argument', 'Check the form fields and try again.');
    const now = Date.now();
    const action = parsed.data.action;
    const limit = action === 'redeem' ? 10 : action === 'invite' || action === 'help' ? 5 : 60;
    await rateLimit(db, `account:${request.auth.uid}:all`, 120, now);
    await rateLimit(db, `ip:${request.rawRequest.ip ?? 'unknown'}:all`, 300, now);
    await rateLimit(db, `account:${request.auth.uid}:${action}`, limit, now);
    await rateLimit(
      db,
      `ip:${request.rawRequest.ip ?? 'unknown'}:${action}`,
      action === 'redeem' ? 30 : 120,
      now,
    );
    try {
      const identity = await getAuth().getUser(request.auth.uid);
      if (
        identity.disabled ||
        (identity.tokensValidAfterTime &&
          Number(request.auth.token.auth_time) * 1000 < Date.parse(identity.tokensValidAfterTime))
      )
        throw new HttpsError(
          'unauthenticated',
          'Your session is no longer valid. Please sign in again.',
        );
      if (
        !identity.emailVerified ||
        identity.email?.toLowerCase() !== request.auth.token.email.toLowerCase()
      )
        throw new HttpsError(
          'permission-denied',
          'Verify your current email address and sign in again.',
        );
      return await dispatch(
        {
          db,
          actor: {
            uid: request.auth.uid,
            email: request.auth.token.email.toLowerCase(),
            name: identity.displayName || 'Care member',
            authTime: Number(request.auth.token.auth_time),
          },
          now,
          hmacSecret: serverHmac(),
          mailer: mailer(),
          appUrl: appUrl.value(),
          vault: vault(),
        },
        request.data,
      );
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'This action could not be completed. Please try again.');
    }
  },
);
export const careScheduler = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: 'us-central1',
    timeZone: 'UTC',
    timeoutSeconds: 240,
    maxInstances: 1,
    secrets: isEmulator ? [] : [smtpPassword],
    retryCount: 3,
  },
  async () => {
    const now = Date.now();
    await extendSchedules({ db, now });
    await extendWellbeing({ db, now });
    await processJobs({
      db,
      now,
      mailer: mailer(),
      appUrl: appUrl.value(),
      push: async (uid) => {
        const tokens = await db.collection(`users/${uid}/pushTokens`).limit(10).get();
        if (tokens.empty) return;
        const result = await getMessaging().sendEachForMulticast({
          tokens: tokens.docs.map((t) => String(t.get('token'))),
          notification: {
            title: 'CareCircle update',
            body: 'Open CareCircle to see a private care update.',
          },
          webpush: { fcmOptions: { link: `${appUrl.value()}/dashboard` } },
        });
        await Promise.all(
          result.responses.map(async (response, index) => {
            if (
              response.error &&
              [
                'messaging/registration-token-not-registered',
                'messaging/invalid-registration-token',
              ].includes(response.error.code)
            ) {
              await tokens.docs[index]?.ref.delete();
            }
          }),
        );
        const retryable = result.responses.find(
          (response) =>
            response.error &&
            ![
              'messaging/registration-token-not-registered',
              'messaging/invalid-registration-token',
            ].includes(response.error.code),
        );
        if (retryable?.error) throw retryable.error;
      },
    });
  },
);
