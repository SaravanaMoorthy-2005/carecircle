# Threat model

Assets: healthcare metadata, private notes, care-circle permissions, identity tokens, invitation codes, SMTP credentials, encryption keys, reliable dose records, and reminder recipient lists.

Trust boundaries: browser → Firebase Auth; browser → rules-protected Firestore; browser → callable API; callable → Admin SDK; scheduled worker → external SMTP/FCM; trusted operator → cloud configuration.

| Threat                                        | Control                                                                             | Verification / residual risk                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Anonymous or unverified client                | Firebase token validation + verified-email check                                    | Callable and rules negative tests; production token signing is Firebase-managed                 |
| Cross-circle ID substitution                  | Transactional membership and fixed subcollection paths                              | Integration/rules tests cover direct and query isolation                                        |
| Viewer privilege escalation                   | All client writes denied; explicit grantor subset checks                            | Rules and invitation tests                                                                      |
| Invitation guessing/replay                    | CSPRNG code, HMAC, 10-minute TTL, five attempts, rate limits, transactional consume | Wrong identity, expiry, guessing, parallel redemption tests                                     |
| Invitation from revoked grantor               | Recheck grantor membership and permissions on redemption                            | Regression test in integration suite                                                            |
| Two caregivers confirm simultaneously         | Expected version and idempotency key                                                | Concurrent confirmation test                                                                    |
| Schedule edit duplicates care events          | Versioned deterministic occurrence IDs; future cancellation                         | Recurrence, edit, and rolling-generation tests                                                  |
| Stale notifications leak access               | Recheck current member permissions and source state before send                     | Revoked recipient and stale appointment/dose tests; in-flight external sends cannot be recalled |
| Ciphertext manipulation or cross-circle reuse | AES-GCM tag and document-path AAD                                                   | Wrong key, tamper, malformed envelope, and AAD tests                                            |
| Server secret exposure                        | Secret Manager; no browser/Admin credentials; generic errors                        | Build/source review, deploy guide; operator IAM remains critical                                |
| XSS                                           | React escaping, no raw HTML rendering, escaped email templates, CSP                 | Static review and browser checks; third-party code remains a supply-chain risk                  |
| Abuse and cost exhaustion                     | App Check, per-actor/IP limits, bounded queries/queues                              | Rate-limit concurrency tests; global budgets/WAF/monitoring remain operator tasks               |
| Data retained after revocation                | In-memory Firestore cache; subscription teardown; keyed protected subtree           | Browser revocation test; screenshots/copied data cannot be erased                               |
| Spoofed clinical certainty                    | Taken/Skipped/Unconfirmed wording; explicit assistance limits                       | UI review; self-reported actions cannot verify ingestion or physical safety                     |

Administrative cloud compromise, compromised end-user devices, malicious authorized members, SMTP account compromise, denial of service beyond the application, and human care errors are not eliminated by this implementation. No absolute security or compliance guarantee is asserted.
