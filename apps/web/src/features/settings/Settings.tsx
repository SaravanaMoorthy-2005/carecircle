import { Localized } from '../../i18n/Localized';
import { ContactConsent } from '../care-circles/CircleNetwork';
import { LanguagePicker } from '../../i18n/LocaleContext';
import { useEffect, useState } from 'react';
import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { defaultPreferences, preferencesSchema } from '@carecircle/shared';
import { useCircle } from '../../app/CircleContext';
import { useAuth } from '../../app/AuthContext';
import { useDocument } from '../../hooks/useLive';
import { app, command } from '../../lib/firebase';
import { ProfileForm } from '../onboarding/Onboarding';
import { requirePushPermission } from '../../services/push';
import { Button, Field, Notice, PageHeading, useAction } from '../../components/ui';
export default function Settings() {
  const { circle, can, circleId } = useCircle(),
    { user } = useAuth();
  const preference = useDocument<typeof defaultPreferences>(
    user ? `users/${user.uid}/notificationPreferences/default` : null,
  );
  const [prefs, setPrefs] = useState(defaultPreferences),
    [note, setNote] = useState('');
  const [large, setLarge] = useState(localStorage.getItem('carecircle.large') === 'true'),
    [contrast, setContrast] = useState(localStorage.getItem('carecircle.contrast') === 'true');
  const action = useAction();
  useEffect(() => {
    if (preference.data) setPrefs(preferencesSchema.strip().parse(preference.data));
  }, [preference.data]);
  useEffect(() => {
    document.documentElement.classList.toggle('large-text', large);
    document.documentElement.classList.toggle('high-contrast', contrast);
    localStorage.setItem('carecircle.large', String(large));
    localStorage.setItem('carecircle.contrast', String(contrast));
  }, [large, contrast]);
  async function togglePush(enable: boolean) {
    if (!(await isSupported()))
      throw new Error(
        'This browser does not support web push. Email and in-app updates remain available.',
      );
    const messaging = getMessaging(app);
    if (enable) {
      if (!import.meta.env.VITE_FIREBASE_VAPID_KEY)
        throw new Error('Web push is not configured for this deployment.');
      await requirePushPermission(isSupported, () => Notification.requestPermission());
      const registration = await navigator.serviceWorker.register('/messaging-sw.js', {
        type: 'module',
      });
      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration,
      });
      await command({ action: 'pushToken', token, remove: false });
      localStorage.setItem('carecircle.pushToken', token);
    } else {
      const token = localStorage.getItem('carecircle.pushToken');
      if (token) await command({ action: 'pushToken', token, remove: true });
      await deleteToken(messaging);
      localStorage.removeItem('carecircle.pushToken');
    }
    await command({ action: 'preferences', preferences: { ...prefs, push: enable } });
    setPrefs({ ...prefs, push: enable });
  }
  return (
    <>
      <PageHeading title="Care, on your terms">
        Make CareCircle comfortable for you and control your preferences.
      </PageHeading>
      <div className="settings-grid">
        {circleId && <ContactConsent />}
        <section className="panel">
          <h2>
            <Localized value={'Comfort & accessibility'} />
          </h2>
          <LanguagePicker />
          <p>These display preferences apply to this browser.</p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={large}
              onChange={(event) => setLarge(event.target.checked)}
            />{' '}
            <Localized value={'Larger text'} />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={contrast}
              onChange={(event) => setContrast(event.target.checked)}
            />{' '}
            <Localized value={'Higher contrast'} />
          </label>
          <Button
            variant="secondary"
            onClick={() =>
              void action.run(async () => {
                if (!('speechSynthesis' in window))
                  throw new Error('Read-aloud is not supported by this browser.');
                speechSynthesis.cancel();
                speechSynthesis.speak(
                  new SpeechSynthesisUtterance(
                    'Welcome to CareCircle. Use the navigation to review medications, appointments, or request assistance.',
                  ),
                );
              }, 'Read-aloud started.')
            }
          >
            Try read-aloud assistance
          </Button>
        </section>
        <section className="panel">
          <h2>
            <Localized value={'Notification preferences'} />
          </h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void action.run(async () => {
                const validated = preferencesSchema.parse(prefs);
                await command({ action: 'preferences', preferences: validated });
              });
            }}
          >
            <label className="checkbox">
              <input
                type="checkbox"
                checked={prefs.email}
                onChange={(event) => setPrefs({ ...prefs, email: event.target.checked })}
              />{' '}
              Receive care updates by email
            </label>
            <Field label="Upcoming dose reminder (minutes before)">
              <input
                type="number"
                min={0}
                max={120}
                value={prefs.upcomingMinutes}
                onChange={(event) =>
                  setPrefs({ ...prefs, upcomingMinutes: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="Unconfirmed follow-up (minutes after)">
              <input
                type="number"
                min={5}
                max={240}
                value={prefs.unconfirmedMinutes}
                onChange={(event) =>
                  setPrefs({ ...prefs, unconfirmedMinutes: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="Caregiver escalation (minutes after)">
              <input
                type="number"
                min={10}
                max={480}
                value={prefs.escalationMinutes}
                onChange={(event) =>
                  setPrefs({ ...prefs, escalationMinutes: Number(event.target.value) })
                }
              />
            </Field>
            <p className="muted">
              The profile owner’s timing settings apply when new dose occurrences are generated.
              Existing queued times are preserved.
            </p>
            <Button disabled={action.pending}>Save notification preferences</Button>
          </form>
          <Button
            variant="secondary"
            disabled={action.pending}
            onClick={() =>
              void action.run(
                () => togglePush(!prefs.push),
                prefs.push ? 'Push notifications disabled.' : 'Push notifications enabled.',
              )
            }
          >
            {prefs.push ? 'Disable' : 'Enable'} browser notifications
          </Button>
        </section>
      </div>
      {action.feedback}
      {circle && can('privacy.manage') && (
        <>
          <section className="panel">
            <h2>Care profile</h2>
            <ProfileForm
              initial={circle}
              onSave={(profile) =>
                command({ action: 'updateProfile', circleId, version: circle.version, profile })
              }
            />
          </section>
          <section className="panel">
            <h2>Private medical notes</h2>
            <Notice>
              Notes are encrypted on the backend. Only members with privacy permission can request
              decryption. Recent sign-in is required.
            </Notice>
            <Field label="Private note">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={4000}
                rows={4}
              />
            </Field>
            <div className="inline-actions">
              <Button
                variant="secondary"
                disabled={action.pending}
                onClick={() =>
                  void action.run(async () => {
                    const result = await command({ action: 'readNote', circleId });
                    setNote(String(result.note));
                  }, 'Private note loaded.')
                }
              >
                Load private note
              </Button>
              <Button
                disabled={action.pending}
                onClick={() =>
                  void action.run(() => command({ action: 'saveNote', circleId, note }))
                }
              >
                Save encrypted note
              </Button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
