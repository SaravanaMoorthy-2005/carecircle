# Database schema and query contract

All timestamps are trusted backend epoch milliseconds for consistent sorting and deterministic tests. Firestore TTL uses a timestamp-compatible Date for rate-limit expiration. Clinical definitions and occurrence records are separate.

| Collection                                    | Fields / purpose                                                                             | Browser access                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------- |
| `users/{uid}`                                 | displayName, email                                                                           | Own verified account get        |
| `users/{uid}/circles/{circleId}`              | server-owned membership mirror                                                               | Own bounded list                |
| `users/{uid}/notificationPreferences/default` | email/push, timing minutes                                                                   | Own get; callable write         |
| `users/{uid}/pushTokens/{hash}`               | token, updatedAt                                                                             | No direct read/write            |
| `users/{uid}/notifications/{jobId}`           | generic message, circleId, delivery                                                          | Own active-circle bounded reads |
| `careCircles/{circleId}`                      | profile, ownerId, consent, version                                                           | Active member get               |
| `.../members/{uid}`                           | role, explicit permissions, status                                                           | Self get; managers bounded list |
| `.../medications/{id}`                        | definition, recurrence, status, version, audit metadata                                      | medication.read                 |
| `.../doseOccurrences/{id}`                    | UTC timestamp, original local date/time/zone, scheduleVersion, state, actor, idempotency key | medication.read                 |
| `.../appointments/{id}`                       | clinician, location, time/zone, status, reminder minutes, version                            | appointment.read                |
| `.../alerts/{id}`                             | category, resourceId, state, priority, version, acknowledgement/outcome                      | alert.read                      |
| `.../assistanceRequests/{id}`                 | category, creator, lifecycle, outcome                                                        | Active members                  |
| `.../auditLogs/{id}`                          | actorId, action, resourceId, circleId, createdAt                                             | audit.read                      |
| `.../invitations/{id}`                        | safe invitation management summary                                                           | members.manage                  |
| `.../private/notes`                           | authenticated encrypted envelope                                                             | Callable privacy.manage only    |
| `invitations/{id}`                            | verifier, recipient, grantor, permissions, attempts, expiry, state                           | Backend only                    |
| `notificationJobs/{id}`                       | source/version, dueAt, nextAttemptAt, state, attempts, lease, delivered UID set              | Backend only                    |
| `scheduleTasks/{circle_medication}`           | nextAt and definition reference                                                              | Backend only                    |
| `rateLimits/{sha256}`                         | count, resetAt, expiresAt                                                                    | Backend only                    |

Indexes are committed in `firestore.indexes.json`, including due jobs, future medication occurrences, daily views, report state/time counts, appointments, alerts, and per-circle user notifications. The emulator does not prove production index deployment; wait for index builds before smoke testing.

No client can write audit events or mutate access. Application audit records are append-only but are not legally immutable against cloud administrators. Retention, backup schedules, exports, and deletion procedures require an operator policy before use with real health data.

## 3.0 collections

Within each care circle: `directory` (sanitized membership projection); `medicationInventory` (versioned estimates); `inventoryAdjustments` (immutable ledger); `medicationVersions` (historical schedules); `doseFollowUps`; `careAssignments` (versioned tasks and coverage); `prescriptionReconciliations` (public permission-scoped summaries); `privateReconciliations` and `privateCompanions` (backend-only encrypted envelopes); `wellbeingSettings/default`; `wellbeingCheckIns/{localDate}`; and `wellbeingExpectations/{checkin_date}`.

Global `wellbeingSchedules` holds bounded worker due times, inaccessible to clients. Task and check-in notifications reuse `notificationJobs`. All new client writes are denied. Task titles/details are shared with members explicitly granted `task.read`; do not put private clinical notes into task titles.
