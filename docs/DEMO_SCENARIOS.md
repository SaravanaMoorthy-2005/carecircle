# Emulator demo scenarios

Start `npm run emulators`, run `npm run demo:seed`, then start Vite with `VITE_USE_EMULATORS=true`. The script creates fictional Evelyn Harper (owner), Daniel Reyes (caregiver), and Maya Harper (family), synthetic medication, one upcoming appointment, and reminder activity. No fictional health records are embedded in production screens.

1. Sign in as the owner. Review the real Firestore-backed dashboard.
2. Open a second browser/session as caregiver. Confirm an eligible dose as Taken in the owner view; observe the caregiver update without refreshing.
3. Add/edit a medication; inspect deterministic occurrences and audit events. Pause or archive it; verify future pending occurrences are cancelled while history remains.
4. Invite a new verified emulator user. Read its captured email in `functions/.runtime/mail`; enter the invitation ID and code in Join. The code expires after ten minutes, permits five guesses, and is single-use.
5. Create or reschedule an appointment. Run `npm run reminders:tick` to process currently due reminders. Cancelling makes old reminder versions obsolete.
6. Request assistance, switch to caregiver, acknowledge, and record an outcome. Return to the owner view to see the same lifecycle.
7. Revoke caregiver access while its dashboard is open. Protected content disappears and subsequent backend requests fail.
8. Explore larger text, higher contrast, and the keyboard-only confirmation flow. View exact care insight totals in the accessible table.

Scheduler time does not advance automatically in a Firebase emulator. The tests inject deterministic clocks for overdue-dose scenarios; `reminders:tick` uses real local time and the same production job processor. Emails are captured locally rather than sent to actual recipients. Browser push and Google OAuth need real service configuration to validate end to end.
