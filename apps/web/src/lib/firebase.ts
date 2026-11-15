import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  setPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import type { Command } from '@carecircle/shared';
export const emulator = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true';
if (import.meta.env.PROD && import.meta.env.VITE_USE_EMULATORS === 'true')
  throw new Error('Emulators cannot be used in a production build.');
export const configured =
  emulator ||
  Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID,
  );
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (emulator ? 'demo-key' : 'unconfigured'),
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    (emulator ? 'demo-carecircle.firebaseapp.com' : 'unconfigured.invalid'),
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID || (emulator ? 'demo-carecircle' : 'unconfigured'),
  appId: import.meta.env.VITE_FIREBASE_APP_ID || (emulator ? '1:123:web:demo' : 'unconfigured'),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123',
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { localCache: memoryLocalCache() });
export const functions = getFunctions(
  app,
  import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1',
);
if (emulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
if (!emulator && configured && import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}
export const authReady = setPersistence(auth, browserSessionPersistence);
const callable = httpsCallable<Command, Record<string, unknown>>(functions, 'careCommand');
export async function command(input: Command) {
  if (
    [
      'invite',
      'member',
      'revokeInvite',
      'saveNote',
      'readNote',
      'correctDose',
      'applyPrescription',
      'wellbeingPreferences',
    ].includes(input.action) ||
    (input.action === 'passport' && input.includePrivateNotes)
  ) {
    const { ensureRecentAuthentication } = await import('../services/reauth');
    await ensureRecentAuthentication();
  }
  const result = await callable(input);
  return result.data;
}
export function errorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code.startsWith('auth/'))
    return code === 'auth/popup-blocked'
      ? 'Your browser blocked Google sign-in. Allow popups or use email sign-in.'
      : code === 'auth/popup-closed-by-user'
        ? 'Google sign-in was closed. You can try again.'
        : code === 'auth/too-many-requests'
          ? 'Too many attempts. Please wait before trying again.'
          : 'Unable to sign in. Check your details and try again.';
  if (error instanceof Error) return error.message.replace(/^Firebase: /, '').slice(0, 240);
  return 'The action could not be completed. Please try again.';
}
