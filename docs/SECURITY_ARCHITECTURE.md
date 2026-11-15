# Security architecture

## Identity and authorization

Firebase manages passwords and ID tokens. The callable rejects anonymous, expired and unverified identities, enforces production App Check, applies hashed-key per-account and per-IP rate limits, rejects oversized payloads, and parses a strict shared command schema. An explicit expiry check preserves the same boundary in emulators; production SDK signature verification is still required. Privileged access changes and private-note reads/writes require an authentication time within five minutes. The UI opens password or Google reauthentication in place; it never invents a session timestamp. Prescription verification and private-note passport exports also require fresh authentication. Every callable checks the current Admin Auth identity for account disablement, session revocation and verified-email changes.

Active membership, a server-enforced role ceiling and an explicit capability grant are mandatory for non-owners. Active owners possess the full owner capability set. Only owners can manage members or privacy; family roles cannot receive clinical-edit, stock-write or prescription-approval capabilities. The same ceilings apply during invitations, redemption, permission edits, every service authorization and Firestore reads. Resource references are constructed under the caller-selected circle only after membership authorization; invitation resource ownership is checked separately. Grantors cannot grant permissions they do not possess. Owners cannot be revoked through the member-management path, and self-permission edits are denied.

Firestore rules deny every client write and all unspecified reads. Detailed dose records require `medication.read` because they include medication names/instructions. `adherence.read` alone permits sanitized aggregate reports through the backend, not dose-document access. The UI clears data on listener errors and unmounts protected subtrees on account, circle, or permission changes. Persistent Firestore disk cache is disabled. Previously copied data cannot be recalled.

## Invitation algorithm

`crypto.randomInt(0, 100000000)` produces an eight-digit padded code. `randomUUID` identifies the invitation. HMAC-SHA-256 authenticates `invitationId:code` using a backend-only random secret of at least 32 characters. The database stores only the digest, intended email/role/permissions, expiry, remaining attempts, and state. Verification validates shape then uses `timingSafeEqual` on fixed-length digests.

Redemption requires a verified email matching the recipient. Expiry, state, attempts, and the inviter’s current authority are rechecked transactionally. A successful transaction creates membership and consumes the invitation. Incorrect guesses decrement attempts in a committed transaction before returning an error; throwing inside the transaction would incorrectly roll back the counter. Five failed guesses lock the invitation. Numeric codes never appear in public URLs, audit events, or application logs.

Invitation delivery occurs after creation. A transport failure revokes a still-pending invitation and returns an explicit error. Create a new invitation to resend; plaintext codes are never retained for server retry. Local email-capture mailboxes deliberately contain the synthetic email body and are excluded from source/deployment.

## Private notes

AES-256-GCM uses a fresh 96-bit CSPRNG nonce per encryption and a 128-bit authentication tag. The document path is authenticated additional data, preventing ciphertext substitution across circles. Envelopes contain version, algorithm, key identifier, nonce, ciphertext, and tag. The Secret Manager fallback requires a random 32-byte base64 key. Firestore’s own encryption at rest remains enabled.

When `KMS_KEY_RESOURCE` is configured, each note gets a random 256-bit data key. Cloud KMS wraps that key; the envelope stores the wrapped key and KMS resource. Authorized backend reads unwrap and decrypt. Data-key buffers are cleared after use. This protects data at rest from readers without key access; the server can decrypt, so it is not end-to-end encryption.

KMS automatic key-version rotation retains old decrypt capability under the configured CryptoKey. Changing the CryptoKey resource or the fallback secret requires a controlled migration: read with the old key, re-encrypt, verify, and retain recovery backups. A lost key makes notes unrecoverable. Queryable scheduling metadata is intentionally not application-encrypted.

## Integrity and delivery

Medication/appointment edits require the observed version. Confirmations require an eligible nonfuture dose, an expected version, and an idempotency key bound to actor and action. Corrections reopen a confirmed dose, record a reason, and preserve the prior audit history. Archived/paused schedule edits cancel future pending occurrences and preserve historical confirmations.

Job claims are transactional and leased. The worker rereads current resource state and recipient membership before delivery. Cancelled/rescheduled appointments and confirmed/cancelled doses invalidate obsolete jobs. Retries are bounded with exponential backoff. External email is at-least-once: a crash after provider acceptance and before persistence can produce a duplicate. Stable Message-ID is not an exactly-once guarantee. A revocation can race a network send already in progress; no distributed email system can recall accepted messages.

## Operational controls

Use distinct runtime identities, least-privilege Firestore/Secret Manager/FCM permissions, optional KMS encrypt/decrypt grants on one key, monitored scheduler failures, authenticated deployment access, audit retention policy, backups, and budget alerts. Configure Firebase password policy and email-enumeration protection in the console. Optional Firebase MFA requires Identity Platform prerequisites and additional enrollment UI; it is not implemented here. No passkey claim is made.

Vercel security headers include CSP, frame denial, HSTS, MIME sniffing prevention, and restricted browser permissions. The CSP allows only required Firebase/Google endpoints; inline styles are needed by Radix and chart sizing, while inline scripts remain disallowed. Validate Google popup/App Check behavior on the real domain before release.

## 3.0 care data boundaries

Prescription drafts and appointment preparation use the same authenticated AES-GCM envelope and document-path context binding as private notes. Neither is directly readable in Firestore. Passport generation audits access and checks medication permission separately; private notes add owner privacy permission and fresh authentication. Contact fields are copied into the shared directory only after individual consent and are cleared on revocation.

Dose confirmation and inventory consumption share one transaction. Repeated idempotency keys do not consume twice; an audited correction reverses the stored consumed amount. Task transitions require the assigned actor or a care manager plus a matching version. Prescription application checks all expected medication versions before any write, preserves confirmations, and regenerates future schedules only after verified commit.

Membership revocation stops protected subscriptions. Firebase Auth account disablement/revocation is checked on each callable, but an already-issued token may retain direct Firestore read access until expiry unless the operator also revokes that circle membership. Previously printed, spoken or downloaded data cannot be recalled. See UPGRADE_3_0.md for migration and mandatory Auth password policy configuration.
