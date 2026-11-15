# CareCircle 3.0

**Connected Care. Confident Living.** A collaborative elderly care application for PromptWars × Catalyst: medication routines, appointments, trusted family access, and caregiver follow-up.

This repository contains a working React application and Firebase backend. Development uses real Firebase Authentication, Firestore, and callable Functions emulators. There is no simulated authentication or browser-only medical database. Production service activation requires your Firebase project, SMTP provider, App Check registration, and deployment configuration.

## Run the local application

Use Node 22 LTS, npm, and Java 21 or newer. The backend deploys to `nodejs22`. Java must be on PATH; on Windows, set `JAVA_HOME` to the installed JDK if the Oracle launcher hangs.

```powershell
npm ci
npx playwright install chromium
npm run emulators
```

In a second terminal:

```powershell
npm run demo:seed
$env:VITE_USE_EMULATORS='true'
npm run dev
```

Open [CareCircle locally](http://127.0.0.1:5173). The seed command creates **fictional** profiles and prints the local-only credentials. The three demo emails are `elder@carecircle.test`, `caregiver@carecircle.test`, and `family@carecircle.test`; password: `CareCircle-demo-2026!`. These accounts exist only in the `demo-carecircle` emulator project. Never seed a production project.

On macOS/Linux, use `VITE_USE_EMULATORS=true npm run dev`. Alternatively copy `.env.example` to `apps/web/.env.local` and set `VITE_USE_EMULATORS=true`. Emulator mode is rejected in production builds.

Cloud Scheduler itself is not emulated. Run `npm run reminders:tick` to execute the real bounded reminder processor against local data. Local invitation emails are captured in `functions/.runtime/mail`; seed/tick emails are captured in `.runtime/mail`. These ignored mailbox files contain synthetic invitation codes and must not be published.

## CareCircle 3.0

Premium role-specific workspaces, stronger server-enforced roles, SafeDose Shield, WhyMissed?, Refill Guardian, DischargeSync, CareShift, CarePassport, Appointment Companion, wellbeing check-ins and a live care handoff are implemented. Core navigation and care controls support English, Tamil and Hindi, with user-triggered read-aloud. See [the 3.0 feature and upgrade guide](docs/UPGRADE_3_0.md) for behavior, test evidence and existing-circle migration.

## Implemented workflows

- Email/password registration, email verification, password recovery, Google popup sign-in, session persistence, protected routes, and sign-out.
- Consent-based care profiles, multiple circle selection, three roles, explicit permissions, invitation and membership management.
- Eight-digit invitations with 10-minute expiry, five guesses, HMAC verification, transactional single use, verified-email binding, and revocation.
- Medication creation/editing, details, daily/weekly schedules, multiple times, pause/resume/archive, timezone conversion, and rolling occurrences.
- Transactional Taken/Skipped confirmations, actor provenance, idempotent retries, concurrent-write protection, audited owner corrections, and paginated history.
- Live dashboards, appointment creation/editing/rescheduling/cancellation/completion, agenda view, and care insights.
- Durable reminder jobs, upcoming/unconfirmed/escalation timing, SMTP adapter, in-app notifications, optional FCM web push, worker leases, retry backoff, stale-resource checks, and caregiver alert lifecycle.
- Assistance requests, acknowledgement, recorded outcomes, access activity, notification preferences, larger text, higher contrast, and user-initiated read-aloud.
- AES-256-GCM private notes with context binding; optional Cloud KMS envelope wrapping.

All UI mutations use the same validated callable backend. Email is reported as **accepted by the provider**, never assumed delivered. “Unconfirmed” describes missing confirmation, not proven missed medication.

## Architecture

| Directory         | Responsibility                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web`        | React 19, Vite, strict TypeScript, React Router, Tailwind, Radix/shadcn-style primitives, React Hook Form, Firebase client SDK |
| `functions`       | Cloud Functions v2 callable API, authorization, repositories, scheduling, SMTP/FCM, cryptography                               |
| `packages/shared` | Strict Zod command schemas, permission types, deterministic Temporal scheduling and state rules                                |
| `tests`           | Firestore rules, emulator integration, Playwright workflows and axe audits                                                     |
| `scripts`         | Synthetic emulator demo setup and reminder execution                                                                           |
| `docs`            | Architecture, threat model, requirements evidence, deployment and operating limitations                                        |

Firestore listeners supply shared updates. All client database writes are denied. Callable functions independently authorize every sensitive mutation because the Admin SDK bypasses security rules. Notes, invitation verifiers, worker jobs, and push tokens are inaccessible through client Firestore reads.

## Verification

```powershell
npm run test
npm run test:coverage
npm run typecheck
npm run lint
npm run build
npm run verify
```

`verify` checks formatting, lint, strict types, unit coverage, both production builds, rules, integration, browser workflows, axe, and dependency audit. It starts its own emulators; stop an existing emulator session first. Reports are written to `coverage`, `playwright-report`, and `test-results`.

For individual emulator tests with emulators already running:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
npm run test:rules
npm run test:integration
npm run test:e2e
npm run test:a11y
```

See [testing and evidence](docs/TESTING.md) and [requirements matrix](docs/REQUIREMENTS_MATRIX.md). Coverage thresholds apply to the pure scheduling/care/security/cryptography modules, not the whole application. A passing suite does not prove absence of vulnerabilities or WCAG conformance.

## Deploy

1. Configure a Firebase project with billing, Firestore, Authentication providers, and a stable production domain.
2. Register reCAPTCHA Enterprise App Check and configure backend secrets.
3. Deploy rules/indexes and backend functions using [the Firebase guide](docs/FIREBASE_DEPLOYMENT.md).
4. Import this repository into Vercel using the **repository root**; set the public frontend environment values; deploy using [the Vercel guide](docs/VERCEL_DEPLOYMENT.md).
5. Verify real authentication, SMTP acceptance/delivery, scheduled execution, push, and production App Check enforcement.

The frontend is static; Vercel receives no Admin, SMTP, HMAC, or encryption credentials. Firebase Hosting is not required. Production has not been deployed or verified in this workspace.

## Read before a production release

[Security architecture](docs/SECURITY_ARCHITECTURE.md), [threat model](docs/THREAT_MODEL.md), [known limitations](docs/KNOWN_LIMITATIONS.md), and [final audit](docs/FINAL_AUDIT.md) describe operational responsibilities, bounded processing, notification delivery limits, data retention, and remaining manual verification. No medical diagnosis, emergency-response guarantee, end-to-end encryption, or healthcare compliance certification is claimed.
