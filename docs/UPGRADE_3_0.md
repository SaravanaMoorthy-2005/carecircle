# CareCircle 3.0 — implementation and upgrade guide

The existing React/Vite/Firebase application was extended in place. The starting 2.0 code passed type checking, 57 unit/component tests and both builds; its earlier full verification is retained as baseline evidence in `FINAL_AUDIT.md`.

## Product experience

The dedicated UI specification takes precedence for the visual system: Stack Sans Text and Headline, ink/ivory/lemon/powder/mist/ice/mint tokens, a lightly frosted shell, solid rounded content cards and dark primary actions. Fonts are hosted in the built application, including Tamil and Devanagari fallbacks. The supplied portal reference informed composition; no reference assets or private health records were copied.

Login is the opening screen. The owner’s CareDay prioritizes the next dose, a real care timeline, calendar and trusted people. CarePulse surfaces unconfirmed reports, responsibilities, low-stock estimates and unresolved care alerts. Each role has at most five primary navigation destinations; permission-filtered More and contextual links expose additional tools. Cards, timelines, counters and calendars derive from authorized records, with honest empty states.

## Implemented features

| Feature               | Behavior and integrity boundary                                                                                                                                                                                              | Evidence                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| SafeDose Shield       | Confirmation details show reporter/time; atomic, actor-bound idempotency rejects duplicate recording; owner corrections restore any consumed stock and retain audit evidence                                                 | `care.test.ts`, original workflows, full cross-role browser scenario                               |
| WhyMissed?            | Five persisted follow-up reasons; unavailable supply creates one refill responsibility; assistance/unwell requests notify the care circle; old unconfirmed escalations stop after acknowledged follow-up                     | `care.test.ts`, `DoseList.tsx`                                                                     |
| Refill Guardian       | Starting counts, corrections, restocking, unit quantity per administration, schedule-based forecast, low-supply indicator and adjustment ledger; unconfirmed/skipped reports do not consume stock                            | `care.test.ts`, `shared/care.test.ts`, browser scenario                                            |
| DischargeSync         | Encrypted draft, captured before/after list, Added/Modified/Discontinued/Unchanged comparison, fresh sign-in and explicit verification, version-checked atomic apply, historical versions, future-only schedule regeneration | `care.test.ts`, browser scenario verifies preserved historical document and new future occurrences |
| CareShift             | Assignees, medication/appointment/refill/general/coverage categories, coverage periods, versioned acceptance/decline/start/complete/reassignment, outcome history and scoped notifications                                   | `care.test.ts`, shared transition tests, cross-role browser scenario                               |
| CareVoice             | English/Hindi/Tamil core navigation, actions, form labels, state labels and care prompts; local browser preference and language fonts; user-triggered speech with language and fallback, cleanup on departure                | `messages.test.ts`, calendar/language/browser tests                                                |
| CarePassport          | Explicit generation, current active medication list, emergency contact, optional privileged private notes, audited access and user-controlled print/PDF; no public summary URL                                               | `companion.test.ts`, browser scenario                                                              |
| Appointment Companion | Encrypted questions, versioned preparation checklist, visit notes, and an actual linked follow-up responsibility                                                                                                             | `companion.test.ts`, browser scenario                                                              |
| Wellbeing             | Optional daily report, versioned changes, deduplicated help request, configurable local-time/grace-period follow-up, disabled/stale job suppression; nonresponse is a normal follow-up, never proof of emergency             | `companion.test.ts`, browser scenario                                                              |
| Care Handoff          | Authorized current-day medication follow-up and upcoming doses, open alerts, next appointments and outstanding responsibilities, printable live briefing                                                                     | Shared summary tests, route accessibility checks                                                   |
| Care-circle directory | Profile-centred member view, explicit capabilities and responsibilities, email/phone only after individual consent; revocation clears shared contact details                                                                 | Rules and companion integration tests                                                              |

Clinician-authored medication names/instructions, names, notes and free-text records are preserved verbatim across language changes. Untranslated explanatory/legal copy falls back to English; native-speaker review and complete copy localization remain release work. Speech availability depends on installed browser/OS voices.

## Stronger identity and roles

Passwords remain with Firebase Authentication. Signup adds a 12–128 character passphrase check, confirmation, visibility control, password-manager autocomplete and consent. Configure the same minimum length with **Firebase Authentication password policy in Require mode**, plus email-enumeration protection, before production; UI validation alone cannot impose an Auth service policy. Google account selection, verified-email gating and session persistence remain.

Every callable rereads the Admin Auth identity to reject disabled/revoked accounts or changed/unverified email. Sensitive changes use Firebase password/Google reauthentication, without asking users to abandon an edit. Membership and role ceilings are enforced independently in services and Firestore rules. Only the owner manages members and privacy. A caregiver receives explicit permitted capabilities; a family role cannot acquire clinical schedule edits, inventory writes, prescription approval, member management or private-note access, even through stale/excessive grants. Role labels never come from a login form.

## Upgrade existing circles

Deploy the new backend, Firestore rules and indexes together before exposing the 3.0 frontend. New memberships write a sanitized directory automatically. Existing 2.0 circles need a directory backfill; do not automatically expand their permissions.

Use an authorized operator identity with Application Default Credentials, then review a **single-circle dry run**:

```text
npx tsx scripts/migrate-v3.ts --project PROJECT_ID --circle CIRCLE_ID
npx tsx scripts/migrate-v3.ts --project PROJECT_ID --circle CIRCLE_ID --apply
```

The transaction copies sanitized member fields only, retains consent, clears revoked contacts, and writes an audit event. It does not modify clinical records, existing roles or grants. Owners can then deliberately grant the new capabilities in Members. Legacy excessive grants are ineffective under the new ceilings; the permissions editor filters them when saving. Existing owners gain the complete owner capability set by role.

## Deployment and bounded work

Vercel continues to host the static frontend. Firebase Auth, Firestore, Functions v2, Cloud Scheduler, App Check, Secret Manager and optional FCM/KMS remain the Google integration points. No backend secret belongs in `VITE_` variables. The SPA fallback covers every new deep link. Prescription changes durably queue schedule work; an immediate bounded generation attempt improves responsiveness, and a pending notice leaves retries to the worker after commit.

New modules use lazy routes, bounded reads, listener cleanup and transactions. Vendor chunks separate React, date/time and Firebase services; the measured largest JS chunk is below Vite’s 500 kB warning threshold. This is bundle verification, not a production latency/load benchmark. Core lists remain bounded; review `KNOWN_LIMITATIONS.md` for pagination and operational limits.

OCR, symptom journaling, offline writes, duplicate-medication clinical review and routine planning remain future modules as explicitly requested in the 3.0 specification. No purchases, diagnosis or clinical recommendations are automated.
