# Testing and reproducibility

All fixtures are fictional. Emulator helpers reject non-`demo-` project IDs and require explicit emulator hosts. Rules use `demo-carecircle-rules`; backend tests use `demo-carecircle-integration`; browser/callable tests use `demo-carecircle`. Integration reset deletes only the named local emulator database.

## Commands

| Command                    | Performs                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run test`             | Pure scheduling/state/schema/security/crypto and UI/push component tests                                                                         |
| `npm run test:coverage`    | Same suite with V8 coverage and thresholds                                                                                                       |
| `npm run test:rules`       | Deny-by-default Firestore reads/writes/query isolation against emulator                                                                          |
| `npm run test:integration` | Real Firestore transactions, services, worker, rate limits, callable protocol                                                                    |
| `npm run test:e2e`         | Chromium workflows using actual Auth/Firestore/Functions emulators                                                                               |
| `npm run test:a11y`        | axe WCAG-tagged audits across critical routes and dialogs                                                                                        |
| `npm run check:deployment` | Build output, SPA/worker paths, captured-mail exclusions, backend-marker scan                                                                    |
| `npm run verify`           | Formatting → lint → types → unit coverage → both builds → deployment checks → isolated emulator suites/browser/axe → production dependency audit |

Start no separate emulators when using `verify`; it owns startup and shutdown. For individual suites with running emulators, set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`. Java 21+ must be on PATH. Tests never need production credentials. Playwright starts a dev server with emulator mode enabled when no reusable server exists.

## Meaningful coverage

The coverage gate applies to `shared/domain.ts`, `functions/domain/security.ts`, `shared/care.ts`, and `functions/encryption/envelope.ts`: lines/functions/statements ≥80%, branches ≥75%. It deliberately does not claim whole-application coverage. Integration tests exercise Firestore transactions directly; browser tests add the callable protocol, token checks, rendering, and live subscriptions.

Negative cases include malformed schedules, invalid resource IDs, privilege smuggling, wrong invitation identity, expired/consumed/revoked/locked invitation, revoked inviter, concurrent redemption, view-only edits, cross-circle access, stale versions, duplicate/competing confirmations, future confirmations, note tampering, revoked notification recipients, overlapping workers, SMTP failures, invalid alert transitions, and rate-limit contention.

## Evidence and interpretation

Executed results for this workspace are recorded in `FINAL_AUDIT.md` after the final verification run. Raw reproducible reports are in `coverage/`, `playwright-report/`, and `test-results/`; screenshots are in `docs/screenshots/`.

Initial browser checks caught emulator cold-start/reload timeouts and two contrast/link-distinguishability issues. The emulator now avoids remote secret lookup, tests use a bounded cold-start allowance, labels were darkened, and inline text links are underlined. These are corrected issues, not waived accessibility checks.

Native screen-reader behavior, real Google login/popup restrictions, real App Check attestation, SMTP receipt, delivery duplication around process death, real FCM/OS permissions, Cloud KMS, load/cost testing, and hosted security headers remain manual staging checks.

## 3.0 regression suites

`care.test.ts` covers inventory idempotency/correction, follow-up/refill deduplication, role ceilings, concurrent task acceptance, encrypted prescription comparisons and stale reconciliation. `companion.test.ts` covers contact consent, passport scope, note freshness, encrypted visit preparation, check-in versioning and disabled follow-up jobs. They use separate demo projects to avoid reset races. Callable tests reject cached sessions for disabled accounts and revoked auth times.

`upgrade.spec.ts` executes the complete elder → caregiver → family → verified prescription scenario, checks future schedules and preserved history, then covers secondary tools and responsive layouts at 360, 390, 768, 1024, 1280 and 1440 px. It checks calendar keyboard navigation, Tamil/Hindi switching and 200% root text sizing. Axe covers new tool routes and dialogs as well as the original workflows. Calendar/date coercion and a nonresponse-priority bug were fixed from regression failures.
