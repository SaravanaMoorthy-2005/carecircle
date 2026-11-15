# Real-time behavior

`onIdTokenChanged` drives identity. `CircleProvider` subscribes to the signed-in user’s membership mirror, then the selected circle’s actual membership, then its profile. Feature hooks attach only when the relevant permission exists.

`useLive` subscribes with `onSnapshot`, a query limit, optional filters/order, and an unsubscribe cleanup. Query identity includes resource, filters, sorting, and bound. When identity changes, old data is not returned while a new listener starts. Error callbacks clear protected records and show an access/connection error. Snapshot metadata marks cached dashboard data as potentially stale.

The protected main subtree is keyed by user ID, circle ID, and permission list. Revocation changes the mirror/membership, removes the selected circle, unmounts feature listeners, and clears displayed data. Sign-out clears auth and active-circle selection. Disk persistence is disabled so medical records are not left in IndexedDB caches. Cached SDK data in a live process is not a security boundary; Firestore rules are.

Dose confirmation awaits a callable response; the UI shows a pending state and does not claim ingestion was recorded before server success. Firestore transaction updates propagate to other active sessions. The E2E test confirms a dose in one browser and observes it in another. Another E2E test revokes a caregiver and verifies the medication disappears without refresh.

The history view uses bounded cursor reads rather than keeping an unbounded historical stream open. Analytics refresh after the latest confirmation or an explicit Refresh; aggregate-only members use explicit refresh because raw occurrences are not shared with them. This avoids exposing medication names through adherence-only access.

## 3.0 synchronization

Inventory, role-scoped directory, care assignments, prescription summaries and wellbeing records use bounded listeners. Current history pages now subscribe live as well as support cursor paging. Protected route subtrees are keyed by identity, circle, role and grants, clearing old private state on access changes. Private payloads are fetched through authorized callables and never persisted in browser storage.

Task state changes are transactional and versioned; stale acceptance, reassignment or completion loses cleanly and requires review. Important task updates enqueue versioned jobs, and recipients are rechecked before delivery. WhyMissed follow-up suppresses stale unconfirmed/escalation jobs without implying the dose was taken. Wellbeing expectations are backend-scheduled; current preferences, version and actual check-in are checked before a gentle follow-up. Cloud Scheduler is not emulated; `npm run reminders:tick` runs medication and wellbeing scheduling locally.
