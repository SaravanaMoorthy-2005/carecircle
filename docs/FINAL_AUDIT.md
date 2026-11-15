# Engineering audit — 2.0 baseline and 3.0 upgrade

## Current 3.0 verification — 15 November 2026

`npm run verify` completed with **exit code 0** after a clean emulator start under Node 22.23.5 and Java 26.0.1. No production credentials were used. This is the current upgrade evidence; the older 2.0 baseline remains below for comparison.

| Check                                            | Observed result                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Formatting, ESLint, strict TypeScript            | Passed; zero lint warnings                                                                                       |
| Unit/component tests                             | **64 passed**, 9 files                                                                                           |
| Firestore authorization rules                    | **12 passed**                                                                                                    |
| Backend and real callable integration            | **34 passed**, 3 files                                                                                           |
| Chromium workflows                               | **13 passed**, including the complete 13-step cross-role scenario; 1.8 minutes, no retries                       |
| Axe WCAG-tagged accessibility suites             | **2 passed**, 27 route/role/dialog states; zero detected violations; 1.2 minutes                                 |
| Responsive behavior                              | 360, 390, 768, 1024, 1280 and 1440 px; keyboard calendar, Hindi/Tamil switching and 200% root text sizing passed |
| Scoped pure-domain coverage                      | **100% lines/functions**, 99.13% statements, 98.03% branches; not whole-application coverage                     |
| Frontend/Functions production builds             | Passed; no oversized-chunk warnings; largest JS chunk 458.05 kB (138.05 kB gzip)                                 |
| Vercel/secret boundaries                         | SPA output, worker path, source inclusion and browser/backend separation checks passed                           |
| Complete root dependency audit                   | **0 known vulnerabilities**, including development dependencies                                                  |
| Standalone Functions production dependency audit | **0 known vulnerabilities**                                                                                      |
| Production audit within clean verify             | **0 known vulnerabilities**                                                                                      |

The upgrade fixed a Temporal calendar coercion crash, check-in nonresponse priority, calendar/member-label contrast, a missing consent-link underline, and recovery-link target spacing. Role ceilings, disabled/revoked callable sessions, inventory idempotency and rollback, encrypted comparison/companion access, contact consent withdrawal, stale task/prescription updates and schedule/history preservation have regression coverage. The screenshot set includes `login.png`, six `careday-*.png` viewports and `accessibility-large-text.png` under `docs/screenshots`.

The synthetic demo seed and both directory-migration modes also passed: dry run and apply each processed three demo members without changing roles, grants or clinical history. This separate smoke check is recorded in `.runtime/migration-smoke.log`.

The reproduction log is the ignored `.runtime/verify-3.0.log`. Implementation and migration details are in [UPGRADE_3_0.md](UPGRADE_3_0.md). Hosted Google OAuth/App Check/SMTP/FCM/KMS, production deployment, load benchmarks, native-speaker review and human assistive-technology review remain release checks. No claim of zero possible vulnerabilities or healthcare certification is made.

## Baseline review retained below

This source review evaluates actual implementation and automated evidence, without awarding an artificial score. It was performed during implementation, not by an external penetration-testing organization.

| Category           | Evidence                                                                                     | Finding / disposition                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Code quality       | Strict TS, ESLint, Prettier, workspace boundaries, typed command union                       | Domain logic is independent; workflows use focused feature components and backend services                                                       |
| Security           | Deny-all writes, transactional permissions, invitation HMAC, AES-GCM, App Check, rate limits | Fixed detailed dose disclosure through aggregate-only permission; fixed pending invitations surviving grantor revocation; added regression tests |
| Data correctness   | Version checks, idempotency, deterministic IDs, contextual timezone policy                   | Fixed exact-time schedule replacement boundary; retained original confirmation metadata in correction audit events; preserved family actor role  |
| Efficiency         | Indexed durable queues, subscription limits, rolling horizon, aggregate reports              | Conservative worker bounds; no production-scale throughput claim; large lists intentionally bounded                                              |
| Testing            | Unit, rules, emulator transactions, real callable browser flows, axe                         | Pure-module coverage is scoped; external services are not represented as validated by mocks                                                      |
| Accessibility      | Contrast, inline links, focus dialogs, labeled errors, keyboard/mobile checks                | Corrected measured contrast failures and color-only inline links; human screen-reader review pending                                             |
| Problem alignment  | Medication, appointment, invitation, reminders, caregiver assistance and reporting           | Required core workflows implemented; optional MFA/Calendar/localization are documented as absent                                                 |
| Google services    | Real SDK integration and v2 exports                                                          | Auth/Firestore/Functions work with emulators; production configuration and provider activation remain manual                                     |
| Vercel readiness   | Root monorepo config, static build, SPA fallback, headers                                    | Deployment check scans frontend output for backend-only markers; no deployed URL is fabricated                                                   |
| Supply chain       | Exact dependency versions, root/backend locks, compatible patched overrides                  | Initial audit findings remediated; overrides are tested against backend and frontend workflows                                                   |
| Deployment privacy | Firebase source ignore rules                                                                 | Explicitly exclude local captured invitation mail and `.secret.local` from upload; automated check prevents regression                           |

## Findings and source evidence

Paths below are relative to the repository root. Severity describes the risk before correction; remaining items are explicitly open.

| Severity | Finding                                                                                          | Source and regression evidence                                                                                                          | Disposition                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| High     | An aggregate-only reader could otherwise learn medication names from dose documents              | `firestore.rules`, `functions/src/analytics/service.ts`; `tests/rules/firestore.test.ts`, `tests/integration/workflows.test.ts`         | Fixed: raw dose reads require medication permission; aggregate responses expose counts only                           |
| High     | An invitation could outlive its grantor's permission                                             | `functions/src/invitations/service.ts`; `tests/integration/workflows.test.ts`                                                           | Fixed: redemption transaction rechecks active grantor membership and every granted permission                         |
| High     | Local captured invitation emails could enter a deployment package                                | `firebase.json`, `scripts/check-deployment.mjs`                                                                                         | Fixed: explicit runtime/mail/secret exclusions and deployment boundary check                                          |
| High     | Vulnerable transitive dependencies in the initial dependency graph                               | `package.json`, `package-lock.json`, `functions/package-lock.json`                                                                      | Patched overrides; verified full dependency audits separately from production-only verification                       |
| Medium   | Schedule replacement could retain an occurrence exactly at the edit boundary                     | `functions/src/medications/service.ts`; `tests/integration/workflows.test.ts`                                                           | Fixed: future invalidation includes the boundary; deterministic IDs and version checks prevent duplicate regeneration |
| Medium   | Correction history could lose the original confirmation actor or outcome                         | `functions/src/medications/service.ts`; `tests/integration/workflows.test.ts`                                                           | Fixed: audit event preserves original state, actor, source, time, and reason                                          |
| Medium   | Optional KMS initialization added work to function discovery                                     | `functions/src/runtime.ts`                                                                                                              | Fixed: SDK/client load lazily and are reused; backend load measured under Node 22                                     |
| Medium   | Label association, low contrast and color-only links reduced form accessibility                  | `apps/web/src/components/ui.tsx`, `apps/web/src/styles/app.css`; `apps/web/src/components/ui.test.tsx`, `tests/e2e/application.spec.ts` | Fixed: explicit labels, stronger contrast, underlined inline links, browser regression and axe checks                 |
| Medium   | Slow SMTP and large circles can exceed the bounded worker's capacity                             | `functions/src/notifications/worker.ts`, `functions/src/index.ts`                                                                       | Open operational gate: measure queue latency and load before increasing capacity                                      |
| Medium   | Deployed attestation, provider delivery, IAM and data-rights operations need real-service review | `docs/FIREBASE_DEPLOYMENT.md`, `docs/KNOWN_LIMITATIONS.md`                                                                              | Open release gate; no credentials or live deployment were available                                                   |
| Low      | Some production JavaScript chunks exceed Vite's 500 kB warning threshold                         | `apps/web/vite.config.ts`, `apps/web/src/main.tsx`                                                                                      | Open optimization: routes are lazy-loaded; profile real-device transfer and execution before further vendor splitting |
| Low      | Automated accessibility coverage cannot establish full assistive-technology usability            | `tests/e2e/application.spec.ts`, `docs/ACCESSIBILITY.md`                                                                                | Open human review: screen reader, high zoom, elder usability and real devices                                         |

Additional release-check corrections:

- **High, fixed:** global `lib/` ignore patterns hid `apps/web/src/lib/firebase.ts` from Git, lint and formatting. `.gitignore`, `.prettierignore`, and `eslint.config.js` now target only `functions/lib`; `scripts/check-deployment.mjs` guards source inclusion.
- **Medium, fixed:** Node 22 could not link ESM workspace imports from backend TypeScript during Playwright collection. `functions/package.json` now declares ESM source consistently; the deployable entry remains explicitly CommonJS at `lib/index.cjs`. All browser tests are discoverable under Node 22.
- **Low, fixed:** emulator token verification does not enforce production token expiry behavior. `functions/src/index.ts` now rejects expired or malformed expiry claims explicitly before email checks, with a real callable-protocol regression in `tests/integration/workflows.test.ts`. Production SDK signature verification remains mandatory.

Code quality and synchronization were also inspected in `packages/shared/src/schemas.ts`, `apps/web/src/hooks/useLive.ts`, and `apps/web/src/app/CircleContext.tsx`: strict command schemas, subscription cleanup, access-error clearing and access-keyed subtree resets have direct unit/browser evidence. `docs/REQUIREMENTS_MATRIX.md` maps the original workflows to implementation and verification. Vercel build paths, SPA fallback, and security headers are declared in `vercel.json`; actual hosted delivery remains unverified.

## Baseline 2.0 verification — 15 November 2026

The baseline 2.0 `npm run verify` completed with exit code **0** on Windows using **Node 22.23.5**, npm, Java **26.0.1**, Firebase emulators and Playwright Chromium. CI is configured for Node 22 and Java 21; the hosted CI job itself has not been run. No production credentials were used.

| Check                                      | Observed result                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Prettier, ESLint, strict TypeScript        | Passed; lint permits zero warnings                                                                     |
| Unit/component suite                       | **57 passed**, 6 files                                                                                 |
| Firestore authorization rules              | **10 passed**                                                                                          |
| Backend/emulator integration               | **21 passed**                                                                                          |
| Chromium user workflows                    | **10 passed**, 58.5 seconds, no retries                                                                |
| Axe accessibility suite                    | **1 passed**, 16 route/role/dialog states, zero detected violations; 39.3 seconds including startup    |
| Scoped V8 coverage                         | **100%** statements (78), branches (66), functions (26), lines (63), across three pure modules only    |
| Frontend and backend production builds     | Passed; Vite retains the documented large-chunk optimization warning                                   |
| Deployment boundaries                      | Source inclusion, SPA/worker paths, local-mail/secret exclusions and browser secret-marker scan passed |
| Root full dependency audit                 | **0 known vulnerabilities**, including development dependencies                                        |
| Standalone Functions dependency audit      | **0 known vulnerabilities**                                                                            |
| Production-only dependency audit in verify | **0 known vulnerabilities**                                                                            |

The browser workflows exercise registration/verification/onboarding; medication creation and keyboard confirmation across two authenticated browsers; appointment creation/reschedule/cancellation; assistance and escalation lifecycle; immediate membership revocation; 390px layout; unauthenticated route protection; emailed invitation redemption; and insights, encrypted-note round trip and saved preferences. Screenshots from the actual synthetic-data run are `docs/screenshots/dashboard.png` and `docs/screenshots/mobile.png`.

The coverage percentage is **not whole-application coverage**. Automated axe findings are not a WCAG certification; dependency audits are not a penetration test. External SMTP receipt, Google OAuth, real App Check, FCM and KMS remain unverified. The final raw execution log is in the ignored `.runtime/verify.log`, with generated reports in `coverage/`, `playwright-report/` and `test-results/`.

## Remaining release gates

Configure and deploy actual Firebase/Vercel services, verify production App Check/OAuth/SMTP/FCM/KMS, review IAM and billing limits, establish retention/deletion/backups/monitoring, and perform human assistive-technology and elder usability testing. See KNOWN_LIMITATIONS.md. No app-security or healthcare-compliance perfection claim is made.
