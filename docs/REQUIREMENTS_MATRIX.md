# Requirements evidence

Implemented means an inspectable backend/UI path exists. Local verification means an executed emulator or automated check supports the claim. Production activation remains a separate gate. Optional features are not silently counted as complete.

| ID      | Original requirement        | Frontend / backend evidence                                                    | Verification / activation                                                                                                 |
| ------- | --------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 | Registration and login      | AuthPage, AuthContext, callable verified identity                              | Browser registration/verification/login, protected-route test; production Google OAuth pending                            |
| REQ-002 | Elder healthcare profile    | Onboarding/ProfileForm, createCircle/updateProfile                             | Browser onboarding, integration create, schema consent checks                                                             |
| REQ-003 | Passcode-based invitation   | Members/Join, invitations/service                                              | Guessing, identity, expiry, reuse, concurrency, grantor revocation, transport failure tests; real invitation browser flow |
| REQ-004 | Family access               | CircleProvider + explicit permissions                                          | Rules isolation and aggregate-only negative tests; synthetic family demo                                                  |
| REQ-005 | Caregiver access            | Shared caregiver dashboard and scoped commands                                 | Two-browser live care, caregiver follow-up, revocation tests                                                              |
| REQ-006 | Medication creation/editing | MedicationForm/Medications, medications/service                                | Browser create, integration concurrent edits/versions, CRUD state tests                                                   |
| REQ-007 | Medication schedules        | Temporal occurrence engine, rolling task queue                                 | Leap-day, weekday, month, timezone, DST, pause/archive, generation retry tests                                            |
| REQ-008 | Adherence tracking          | DoseList/History/Insights, transaction confirmations and aggregate API         | Concurrent confirmation, idempotency, correction, denominator and aggregate tests                                         |
| REQ-009 | Appointment management      | Appointments, appointments/service                                             | Browser creation/reschedule/cancel; stale reminder version tests                                                          |
| REQ-010 | Upcoming dose email         | notificationJobs + SMTP adapter                                                | Captured-mail worker test; real SMTP credentials/receipt pending                                                          |
| REQ-011 | Unconfirmed-dose email      | Configurable occurrence timing, worker follow-up/escalation                    | Deterministic timing, worker, escalation and browser follow-up tests; SMTP activation pending                             |
| REQ-012 | Appointment email reminder  | Versioned reminder jobs                                                        | Reschedule/cancel invalidation tests; SMTP activation pending                                                             |
| REQ-013 | Real-time shared updates    | Bounded onSnapshot hooks, keyed access subtree                                 | Two independent browser sessions and revocation without refresh                                                           |
| REQ-014 | Smart caregiver escalation  | Scheduler, alerts, assistance lifecycle                                        | Worker overlap/retry/stale/recipient tests; browser acknowledgement/outcome                                               |
| REQ-015 | Elderly-first accessibility | Semantic forms, large controls, Radix dialogs, preferences                     | Axe critical screens/dialogs, keyboard confirmation, mobile overflow; human assistive-technology review pending           |
| REQ-016 | Privacy and authorization   | Rules, backend permissions, HMAC, AES-GCM, App Check, rate limits              | Rules/adversarial/crypto tests; production attestation and IAM review pending                                             |
| REQ-017 | Google services integration | Firebase Auth/Firestore/Functions/FCM, Scheduler, Secret Manager, optional KMS | Auth/Firestore/callables emulated; Scheduler handler locally invoked; FCM/KMS/Secret Manager external activation pending  |
| REQ-018 | Vercel deployment readiness | Root Vercel config, Vite output, SPA routes and headers                        | Production build and deployment-boundary check; actual deployment/live smoke pending                                      |

## Page mapping

Landing, signup, login, recovery, and privacy are separate public routes. Onboarding combines profile creation and circle creation into one consent-based transaction. `/members` combines member, invitation, and permission management; `/join` redeems codes. `/dashboard` supplies elder, caregiver, and family views from the same permission-aware components. Circle selection handles assigned profiles. `/medications` includes details and schedule management; `/history` holds paginated confirmations; `/appointments` includes agenda/coordination; `/alerts` and `/assistance` contain notification and follow-up workflows; `/activity` is the audit timeline; `/settings` contains notification, accessibility, profile, and private-note preferences. This consolidation avoids empty or duplicate pages.

## Release acceptance

Core backend paths and local verification are implemented. A production release still requires real Firebase/App Check/SMTP configuration, actual Firebase and Vercel deployments, real-service smoke tests, human accessibility review, operational monitoring/backups, and a data retention/rights policy. Do not treat those manual gates as satisfied by file presence.

## CareCircle 3.0 additions

The complete new feature-to-implementation/test mapping is in [UPGRADE_3_0.md](UPGRADE_3_0.md). All five primary features and all five secondary modules have concrete UI and backend paths. The supplied dedicated UI specification defines the visual tokens/fonts; the 3.0 specification defines behavior. Future OCR/journal/offline/review/routine modules remain intentionally unimplemented. See KNOWN_LIMITATIONS.md for external service activation and partial explanatory-copy localization.
