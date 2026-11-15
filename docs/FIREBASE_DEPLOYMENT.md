# Firebase / Google Cloud deployment

Production deployment is prepared but has not been performed. Use a dedicated project and billing account. Firebase Authentication, Firestore, Cloud Functions v2/Cloud Run, Cloud Scheduler, Secret Manager, and optional FCM/KMS can generate costs. Configure budget alerts and monitor queue backlog, failed jobs, reads, function duration, and email volume.

## Configure

1. Create/select a Firebase project. Enable billing for Functions/Scheduler and create Firestore in a suitable region. Backend functions currently use `us-central1`; change both exports and client region deliberately if choosing another region.
2. Enable Email/Password and Google Authentication. Configure authorized domains (localhost for development, stable production/staging domains). Enable email-enumeration protection and a strong Firebase password policy. Configure verification/reset email sender branding and authorized action URLs.
3. Register the web app and reCAPTCHA Enterprise App Check. Enforcement is enabled for production callable requests from the first deployment. Configure the frontend site key before attempting real calls; never disable enforcement to mask missing setup. Enable Firestore App Check enforcement after observing legitimate traffic.
4. Choose a transactional SMTP provider. Configure SPF/DKIM/DMARC and a verified From address. SMTP TLS certificate verification is mandatory. Port 465 uses implicit TLS; other ports require STARTTLS.
5. Copy `functions/.env.example` to `functions/.env.YOUR_PROJECT_ID`. Set `APP_URL`, SMTP host/port/username/from and optional KMS resource. Do not prefix backend values with `VITE_`.

Create three backend secrets with interactive input:

```text
npx firebase login
npx firebase use --add
npx firebase functions:secrets:set INVITATION_HMAC_SECRET --project YOUR_PROJECT_ID
npx firebase functions:secrets:set SMTP_PASSWORD --project YOUR_PROJECT_ID
npx firebase functions:secrets:set NOTES_ENCRYPTION_KEY --project YOUR_PROJECT_ID
```

Generate the HMAC secret from at least 32 random bytes, represented as hex/base64. The note key must be exactly 32 random bytes encoded as base64. Keep recovery copies in an appropriate secrets vault. Never commit these values or paste them into browser source. With KMS enabled the fallback note key is not used, but the current callable secret binding still expects the secret to exist.

For KMS, create a symmetric encryption key and set its full CryptoKey resource in `KMS_KEY_RESOURCE`. Grant the callable runtime identity `cloudkms.cryptoKeyEncrypterDecrypter` on that key only. Grant secret accessor only on the needed secrets. Configure separate runtime identities and least-privilege Firestore/FCM rights for production operations; review generated default service-account privileges.

## Deploy in order

```text
npm ci
npm run build
npx firebase deploy --only "firestore:rules,firestore:indexes" --project YOUR_PROJECT_ID
npx firebase deploy --only functions --project YOUR_PROJECT_ID
```

Wait for Firestore indexes to finish building. Confirm `careCommand` and `careScheduler` exist in the selected region, the Scheduler job runs every minute in UTC, and the service account can invoke the scheduled function. No separate scheduler per medication is created.

Deploy the Vercel frontend with the real public web config. Verify SMTP acceptance and receipt, upcoming/unconfirmed/escalation jobs, cancellation, acknowledgement, and FCM with a consenting browser. KMS requires a real encryption/decryption smoke test. Test production rejection of absent App Check, wrong membership, and unverified identities. Do not use health data during smoke testing.

## Operations

Enable Firestore backups and a documented retention/deletion policy. Create monitoring alerts for `notificationJobs.status == failed`, overdue pending jobs, long leases, scheduled function failures, and unexpected invocation/read volume. At 30 jobs/minute, the configured worker intentionally trades throughput for bounded work; load-test before scaling. Large recipient batches and a slow SMTP provider can increase backlog.

Secret rotation requires function redeployment. Invitation HMAC rotation invalidates outstanding codes; allow them to expire or revoke them first. Note-key rotation requires preserving decrypt capability and migrating envelopes. KMS version rotation under the same CryptoKey supports old ciphertext decryption; changing CryptoKey resources needs migration.

Optional MFA is not implemented; adding Firebase-supported enrollment requires Identity Platform configuration and an accessible recovery flow. There is no claim of HIPAA or other healthcare certification.
