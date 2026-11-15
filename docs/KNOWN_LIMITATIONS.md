# Known limitations and release responsibilities

- Production Firebase/Vercel deployment, SMTP delivery, Google OAuth, reCAPTCHA Enterprise App Check, FCM push, and KMS have not been exercised with real external credentials. Code paths exist; configuration is not evidence of operation.
- No software can promise zero vulnerabilities. A zero-result dependency audit covers known registry advisories for the lockfile at the time checked; it is not a penetration test.
- No healthcare compliance certification, clinical dosage advice, medical diagnosis, verified ingestion, or emergency response service is claimed.
- Email delivery is at-least-once. A crash after SMTP acceptance can duplicate a message. Revocation cannot recall a message already accepted by an external provider. Browser permission/OS restrictions can suppress push.
- Reminder timing preferences apply to newly generated occurrences; queued occurrences retain their original timing. Medication edits invalidate future instances and regenerate their jobs.
- Corrections reopen a dose and preserve audit evidence. Already-completed reminder jobs are not automatically replayed by a correction; caregivers can use the live view/assistance flow.
- The worker handles 30 jobs and 10 medication schedule tasks and 10 wellbeing schedules per invocation, with up to 20 recipients per circle. Queue backlog must be monitored; no production throughput/load benchmark has been run.
- Lists of medications, appointments, alerts, invitations, and audit activity are bounded to recent/first records. Dose history supports cursor paging. Large-scale multi-circle coordination needs additional pagination and server rollups.
- Aggregate-only access does not expose medication details. Its insights update on explicit refresh; detailed medication readers also trigger refresh from the latest confirmation.
- Self-service data export, account deletion, consent withdrawal with data deletion, ownership transfer, and operator retention tooling are not implemented. An operator must establish and fulfill a documented data-rights process before collecting real health information.
- Optional MFA, Google Calendar integration, Realtime Database presence, offline writes, dark mode, and automatic clinical recommendations are absent. Core navigation, actions, labels and care prompts support English, Hindi and Tamil. Explanatory/legal copy without a translation falls back to English; clinician/user-entered content is preserved verbatim. Native-speaker review and remaining copy translation are required for a fully localized release.
- Automated axe and keyboard/mobile checks do not replace human screen-reader, high zoom, real-device, and elder usability testing.
- The complete verification suite passed locally under Node 22.23.5, matching the Functions Node 22 target. CI is configured for Node 22/Java 21 but has not run on a hosted runner; production deployment/runtime smoke testing remains necessary.
- Key loss is unrecoverable without a valid backup/wrapping key. Rotation across CryptoKey resources or fallback key replacement requires a migration; no automated key-migration tool is included.

- CarePassport print/PDF is explicit and local to the user; a saved copy can outlive access revocation. Summary generation is capped at 100 active medicines with an explicit limit notice.
- Prescription comparisons support up to 20 medicines, and at most 300 pending future occurrences are changed in one atomic reconciliation; larger changes require a reviewed operational workflow. Omitted medications remain unchanged. Stock forecasts cover up to one year and are estimates from reported confirmations.
- Existing 2.0 directory records need the operator migration in UPGRADE_3_0.md. New non-owner capabilities require deliberate grants, not silent permission expansion.
