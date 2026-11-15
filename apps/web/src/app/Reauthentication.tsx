import { useEffect, useRef, useState } from 'react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { installReauthentication } from '../services/reauth';
import { Button, Field, Modal, useAction } from '../components/ui';
export function Reauthentication() {
  const [open, setOpen] = useState(false),
    [password, setPassword] = useState('');
  const pending = useRef<{ resolve: () => void; reject: (reason: Error) => void } | null>(null),
    action = useAction();
  useEffect(
    () =>
      installReauthentication(
        () =>
          new Promise<void>((resolve, reject) => {
            pending.current?.reject(new Error('Verification replaced.'));
            pending.current = { resolve, reject };
            setPassword('');
            setOpen(true);
          }),
      ),
    [],
  );
  const close = () => {
    pending.current?.reject(new Error('Identity verification cancelled. No changes were made.'));
    pending.current = null;
    setOpen(false);
  };
  const google = auth.currentUser?.providerData.some((p) => p.providerId === 'google.com');
  return (
    <Modal
      open={open}
      onClose={close}
      title="Confirm your identity"
      description="For sensitive changes, verify it’s you. Your care information stays in place."
    >
      <p>{auth.currentUser?.email}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            const user = auth.currentUser;
            if (!user) throw new Error('Please sign in again.');
            if (google) await reauthenticateWithPopup(user, new GoogleAuthProvider());
            else
              await reauthenticateWithCredential(
                user,
                EmailAuthProvider.credential(user.email!, password),
              );
            await user.getIdToken(true);
            pending.current?.resolve();
            pending.current = null;
            setOpen(false);
          });
        }}
      >
        {!google && (
          <Field label="Password">
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        {action.feedback}
        <Button disabled={action.pending}>Verify and continue</Button>
      </form>
    </Modal>
  );
}
