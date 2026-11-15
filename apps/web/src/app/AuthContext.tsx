import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import { app, auth, command } from '../lib/firebase';
const AuthContext = createContext<{ user: User | null; loading: boolean }>({
  user: null,
  loading: true,
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<{ user: User | null; loading: boolean }>({
    user: null,
    loading: true,
  });
  useEffect(
    () =>
      onIdTokenChanged(
        auth,
        (user) => setValue({ user, loading: false }),
        () => setValue({ user: null, loading: false }),
      ),
    [],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
export async function logout() {
  const token = localStorage.getItem('carecircle.pushToken');
  try {
    if (token) {
      const { deleteToken, getMessaging, isSupported } = await import('firebase/messaging');
      const results = await Promise.allSettled([
        command({ action: 'pushToken', token, remove: true }),
        isSupported().then((supported) => (supported ? deleteToken(getMessaging(app)) : false)),
      ]);
      if (results.some((result) => result.status === 'rejected'))
        console.warn(
          'CareCircle: a device notification cleanup could not be confirmed. Invalid tokens are also removed by the worker.',
        );
    }
  } finally {
    localStorage.removeItem('carecircle.pushToken');
    sessionStorage.removeItem('carecircle.active');
    await signOut(auth);
  }
}
