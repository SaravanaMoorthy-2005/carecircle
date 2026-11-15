import { Localized } from '../../i18n/Localized';
import { useEffect, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { Smile, HandHeart } from 'lucide-react';
import { useCircle } from '../../app/CircleContext';
import { useDocument, useLive } from '../../hooks/useLive';
import { command } from '../../lib/firebase';
import {
  Button,
  Field,
  Notice,
  PageHeading,
  Status,
  formatDate,
  useAction,
} from '../../components/ui';
import { useLocale } from '../../i18n/LocaleContext';
import { useNow } from '../medications/DoseList';
type CheckIn = {
  id: string;
  state: 'okay' | 'help';
  version: number;
  recordedAt: number;
  recordedName: string;
};
type Preferences = {
  enabled: boolean;
  localTime: string;
  followupMinutes: number;
  version: number;
};
export default function Wellbeing() {
  const { circleId, circle, can } = useCircle(),
    { t } = useLocale(),
    now = useNow(),
    action = useAction();
  const today = Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO(circle!.timeZone)
    .toPlainDate()
    .toString();
  const checkin = useDocument<CheckIn>(`careCircles/${circleId}/wellbeingCheckIns/${today}`),
    settings = useDocument<Preferences>(`careCircles/${circleId}/wellbeingSettings/default`);
  const history = useLive<CheckIn>(
    `careCircles/${circleId}/wellbeingCheckIns`,
    ['recordedAt', 'desc'],
    [],
    30,
  );
  const [prefs, setPrefs] = useState<Preferences>({
    enabled: false,
    localTime: '10:00',
    followupMinutes: 60,
    version: 0,
  });
  useEffect(() => {
    if (settings.data)
      setPrefs({
        enabled: settings.data.enabled,
        localTime: settings.data.localTime,
        followupMinutes: settings.data.followupMinutes,
        version: settings.data.version,
      });
  }, [settings.data]);
  return (
    <>
      <PageHeading title={t('Wellbeing Check-In')}>
        {t('A small check-in. A little more connection.')}
      </PageHeading>
      <div className="settings-grid">
        <section className="dashboard-card wellbeing-card">
          <span className="feature-icon">
            <Smile size={30} />
          </span>
          <h2>{t('How are you feeling today?')}</h2>
          <p>
            {today} · {circle!.timeZone}
          </p>
          {checkin.error && <Notice error>{checkin.error}</Notice>}
          {checkin.data && (
            <Notice>
              {checkin.data.state === 'okay'
                ? t('You reported that you are okay.')
                : t('Help has been requested.')}{' '}
              {formatDate(checkin.data.recordedAt, circle!.timeZone)} · {checkin.data.recordedName}
            </Notice>
          )}
          {can('checkin.write') && (
            <div className="wellbeing-actions">
              {(['okay', 'help'] as const).map((state) => (
                <Button
                  key={state}
                  variant={state === 'okay' ? 'primary' : 'secondary'}
                  disabled={action.pending || checkin.loading || !!checkin.error}
                  onClick={() =>
                    void action.run(
                      () =>
                        command({
                          action: 'checkIn',
                          circleId,
                          version: checkin.data?.version || 0,
                          state,
                          requestId: crypto.randomUUID(),
                        }),
                      state === 'okay'
                        ? 'Check-in recorded.'
                        : 'Help request sent to your care circle.',
                    )
                  }
                >
                  {state === 'okay' ? <Smile /> : <HandHeart />}
                  {t(state === 'okay' ? 'I’m okay' : 'I need help')}
                </Button>
              ))}
            </div>
          )}
          <p className="muted">
            An optional check-in is not a safety assessment. No response means “not reported,” not
            an emergency. For urgent help, contact local emergency services.
          </p>
          {action.feedback}
        </section>
        {can('privacy.manage') && (
          <section className="dashboard-card">
            <h2>Daily check-in preferences</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(async () => {
                  await command({ action: 'wellbeingPreferences', circleId, ...prefs });
                }, 'Check-in preferences saved.');
              }}
            >
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={prefs.enabled}
                  onChange={(e) => setPrefs({ ...prefs, enabled: e.target.checked })}
                />
                Enable gentle daily follow-up
              </label>
              <Field label="Expected check-in time">
                <input
                  type="time"
                  required
                  value={prefs.localTime}
                  onChange={(e) => setPrefs({ ...prefs, localTime: e.target.value })}
                />
              </Field>
              <Field label="Follow up after (minutes)">
                <input
                  type="number"
                  min={15}
                  max={720}
                  required
                  value={prefs.followupMinutes}
                  onChange={(e) => setPrefs({ ...prefs, followupMinutes: Number(e.target.value) })}
                />
              </Field>
              <p className="muted">
                If a check-in is not reported, authorized caregivers receive a gentle follow-up
                after this grace period. Changes apply to the next future check-in.
              </p>
              {settings.error && <Notice error>{settings.error}</Notice>}
              <Button disabled={action.pending || settings.loading || !!settings.error}>
                <Localized value={'Save check-in preferences'} />
              </Button>
            </form>
          </section>
        )}
      </div>
      <section className="dashboard-card">
        <h2>{t('Recent check-ins')}</h2>
        {history.error && <Notice error>{history.error}</Notice>}
        {!history.data.length && <p>{t('No check-ins recorded yet.')}</p>}
        {history.data.map((entry) => (
          <article className="ledger-row" key={entry.id}>
            <strong>{entry.id}</strong>
            <Status value={entry.state} />
            <span>{entry.recordedName}</span>
            <span>{formatDate(entry.recordedAt, circle!.timeZone)}</span>
          </article>
        ))}
      </section>
    </>
  );
}
