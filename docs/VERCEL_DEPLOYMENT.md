# Vercel frontend deployment

1. Push the repository to your Git provider. Import it in Vercel.
2. Set Root Directory to the repository root. Framework: Vite. Install: `npm ci`. Build: `npm run build --workspace @carecircle/web`. Output: `apps/web/dist`. `vercel.json` declares the build, SPA fallback, and security headers.
3. Set the public `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_FUNCTIONS_REGION=us-central1`, and `VITE_FIREBASE_APPCHECK_SITE_KEY` values. Add `VITE_FIREBASE_VAPID_KEY` to enable push. Omit `VITE_USE_EMULATORS`, or set it to `false`.
4. Deploy. Add the stable deployment domain to Firebase Auth authorized domains and the App Check reCAPTCHA Enterprise site. Configure backend `APP_URL` to the HTTPS production origin and redeploy functions.
5. Verify direct navigation and refresh on `/login`, `/dashboard`, `/medications`, `/appointments`, and `/settings`; check that JavaScript/CSS and `messaging-sw.js` return correct content types rather than SPA HTML.
6. Test email and Google popup sign-in, verification/recovery links, App Check, permission revocation, and real push on this domain.

CLI alternative after linking your Vercel account/project:

```text
npx vercel link
npx vercel env add VITE_FIREBASE_API_KEY production
# Repeat for the public variables above.
npx vercel --prod
```

Do not put Firebase Admin credentials, HMAC secrets, SMTP passwords, or note encryption keys in Vercel or any `VITE_` variable. No Vercel backend function hosts the scheduler. Firebase Hosting is unnecessary.

Use a stable staging domain for previews requiring OAuth/App Check. Do not automatically authorize every Vercel preview hostname. Security headers are tested as repository configuration; real header delivery, custom domains, TLS, and OAuth require a deployed smoke test.

## 3.0 release ordering

Deploy the new Firebase backend, rules and `careAssignments(state, dueAt)` index before the frontend. Backfill existing directories with the reviewed operator script in UPGRADE_3_0.md and explicitly review grants. Validate deep links for `/inventory`, `/tasks`, `/prescriptions`, `/passport`, `/wellbeing`, `/handoff`, and `/more`. Configure Auth password policy in Require mode with minimum length 12 and email-enumeration protection. The frontend retains the existing public environment conventions; no new server secret is introduced.
