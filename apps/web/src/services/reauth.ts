import { auth } from '../lib/firebase';
let request: (() => Promise<void>) | undefined;
export function installReauthentication(handler: () => Promise<void>) {
  request = handler;
  return () => {
    request = undefined;
  };
}
export async function ensureRecentAuthentication() {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  const token = await user.getIdTokenResult();
  if (Date.now() - Number(token.claims.auth_time) * 1000 < 240000) return;
  if (!request) throw new Error('Please sign in again to continue.');
  await request();
  await user.getIdToken(true);
}
