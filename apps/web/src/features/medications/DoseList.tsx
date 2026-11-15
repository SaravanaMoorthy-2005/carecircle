import { Localized } from '../../i18n/Localized';
import { useEffect, useState } from 'react';
import { Check, Pill, SkipForward, RotateCcw, ShieldCheck, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { canConfirm, doseState, type Dose } from '@carecircle/shared';
import { useCircle } from '../../app/CircleContext';
import { command } from '../../lib/firebase';
import {
  Button,
  Empty,
  Field,
  Modal,
  Notice,
  Status,
  formatDate,
  useAction,
} from '../../components/ui';
import { useLocale } from '../../i18n/LocaleContext';
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
export function DoseList({ doses, history = false }: { doses: Dose[]; history?: boolean }) {
  const { circleId, member, can } = useCircle();
  const { t } = useLocale();
  const now = useNow(),
    action = useAction();
  const [confirm, setConfirm] = useState<{
    dose: Dose;
    state: 'taken' | 'skipped';
    requestId: string;
  } | null>(null);
  const [correction, setCorrection] = useState<Dose | null>(null),
    [reason, setReason] = useState('');
  const [record, setRecord] = useState<Dose | null>(null),
    [follow, setFollow] = useState<Dose | null>(null),
    [response, setResponse] = useState<
      'forgot' | 'unavailable' | 'assistance' | 'unwell' | 'already_taken' | null
    >(null),
    [followSaved, setFollowSaved] = useState(false);
  const reasons = {
    forgot: 'I forgot.',
    unavailable: 'Medicine is unavailable.',
    assistance: 'I need assistance.',
    unwell: 'I am feeling unwell.',
    already_taken: 'I already took it but forgot to record.',
  } as const;
  if (!doses.length)
    return (
      <Empty title={history ? 'No recorded doses in this period' : 'A little breathing room'}>
        {history
          ? 'Your care history will appear here as scheduled doses are recorded.'
          : 'There are no scheduled doses in this view. Add a medication to set up your routine.'}
      </Empty>
    );
  return (
    <>
      {action.feedback}
      <div className="dose-list">
        {doses.map((dose) => {
          const state = doseState(dose, now);
          return (
            <article className="dose-row" key={dose.id}>
              <div className="dose-time">
                <strong>{dose.localTime}</strong>
                <span>{history ? dose.localDate : dose.timeZone.replaceAll('_', ' ')}</span>
              </div>
              <span className={`dose-icon dose-icon-${state}`}>
                {state === 'taken' ? <Check size={22} /> : <Pill size={22} />}
              </span>
              <div className="dose-detail">
                <h3>{dose.name}</h3>
                <p>{dose.instructions}</p>
                {dose.confirmedAt && (
                  <small>
                    Confirmed {formatDate(dose.confirmedAt, dose.timeZone)} ·{' '}
                    {dose.confirmedName ||
                      (dose.source === 'owner'
                        ? 'Profile owner'
                        : dose.source === 'family'
                          ? 'Family member'
                          : 'Caregiver')}
                  </small>
                )}
              </div>
              <div className="dose-actions">
                <Status value={state} />
                {can('medication.confirm') && canConfirm(dose, now) && (
                  <div className="inline-actions">
                    <Button
                      disabled={action.pending}
                      onClick={() =>
                        setConfirm({ dose, state: 'taken', requestId: crypto.randomUUID() })
                      }
                    >
                      <Check size={17} />
                      <Localized value={'Mark as Taken'} />
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={action.pending}
                      onClick={() =>
                        setConfirm({ dose, state: 'skipped', requestId: crypto.randomUUID() })
                      }
                    >
                      <SkipForward size={17} />
                      <Localized value={'Skip Dose'} />
                    </Button>
                  </div>
                )}
                {can('medication.confirm') && canConfirm(dose, now) && state === 'unconfirmed' && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setFollow(dose);
                      setResponse(null);
                      setFollowSaved(false);
                    }}
                  >
                    <MessageCircle size={17} />
                    {dose.followUpReason ? 'Update follow-up' : 'What got in the way?'}
                  </Button>
                )}
                {['taken', 'skipped'].includes(state) && (
                  <Button variant="ghost" onClick={() => setRecord(dose)}>
                    <ShieldCheck size={17} />
                    <Localized value={'View confirmation'} />
                  </Button>
                )}
                {history && member?.role === 'owner' && ['taken', 'skipped'].includes(state) && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCorrection(dose);
                      setReason('');
                    }}
                  >
                    <RotateCcw size={16} /> Correct record
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <Modal
        open={!!confirm}
        onClose={() => {
          if (!action.pending) setConfirm(null);
        }}
        title={
          confirm?.state === 'taken' ? 'Confirm this dose was taken' : 'Record this dose as skipped'
        }
        description="Confirm only what you know happened. Your name and the confirmation time are recorded for your care circle."
      >
        {confirm && (
          <>
            <p>
              <strong>{confirm.dose.name}</strong> · {confirm.dose.localTime}
            </p>
            <p>{confirm.dose.instructions}</p>
            {action.feedback}
            <Button
              disabled={action.pending}
              onClick={() =>
                void action
                  .run(
                    () =>
                      command({
                        action: 'confirmDose',
                        circleId,
                        resourceId: confirm.dose.id,
                        version: confirm.dose.version,
                        state: confirm.state,
                        requestId: confirm.requestId,
                      }),
                    'Dose confirmation saved.',
                  )
                  .then((ok) => {
                    if (ok) setConfirm(null);
                  })
              }
            >
              {action.pending ? 'Saving confirmation…' : `Confirm ${confirm.state}`}
            </Button>
          </>
        )}
      </Modal>
      <Modal
        open={!!record}
        onClose={() => setRecord(null)}
        title="SafeDose Shield"
        description="One scheduled dose, one reported action. This record does not verify physical ingestion."
      >
        {record && (
          <>
            <Notice>
              This dose was already marked {record.state === 'taken' ? 'Taken' : 'Skipped'} at{' '}
              {record.confirmedAt
                ? formatDate(record.confirmedAt, record.timeZone)
                : 'the recorded time'}
              .
            </Notice>
            <dl className="details">
              <dt>
                <Localized value={'Medication'} />
              </dt>
              <dd>{record.name}</dd>
              <dt>
                <Localized value={'Scheduled'} />
              </dt>
              <dd>{formatDate(record.scheduledAt, record.timeZone)}</dd>
              <dt>Recorded by</dt>
              <dd>{record.confirmedName || record.source || 'Care member'}</dd>
              <dt>Record saved</dt>
              <dd>
                {record.confirmedAt
                  ? formatDate(record.confirmedAt, record.timeZone)
                  : 'Not available'}
              </dd>
            </dl>
            {member?.role === 'owner' && (
              <Button
                variant="secondary"
                onClick={() => {
                  setCorrection(record);
                  setReason('');
                  setRecord(null);
                }}
              >
                Correct record
              </Button>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={!!follow}
        onClose={() => setFollow(null)}
        title="What got in the way?"
        description="Your response helps your circle offer the right support. It does not change your prescription."
      >
        {follow && (
          <>
            <p>
              <strong>{follow.name}</strong> · {follow.localTime}
            </p>
            <div className="followup-options">
              {Object.entries(reasons).map(([key, label]) => (
                <Button
                  key={key}
                  variant={response === key ? 'primary' : 'secondary'}
                  aria-pressed={response === key}
                  onClick={() => {
                    setResponse(key as keyof typeof reasons);
                    setFollowSaved(false);
                  }}
                >
                  {t(label)}
                </Button>
              ))}
            </div>
            {response === 'forgot' && (
              <Notice>
                Follow your clinician’s instructions: {follow.instructions}. Contact your caregiver
                or pharmacist if unsure about timing. CareCircle does not recommend taking a late
                dose.
              </Notice>
            )}
            {response === 'unwell' && (
              <Notice>
                Contact a healthcare professional if you feel unwell. For immediate danger, use your
                local emergency service; do not wait for a CareCircle response.
              </Notice>
            )}
            {response === 'already_taken' && (
              <Notice>
                You will be asked to confirm the reported action. The record will show when you
                reported it; this does not verify when ingestion occurred.
              </Notice>
            )}
            {followSaved && (
              <Notice>
                {response === 'unavailable'
                  ? 'A refill responsibility is ready in CareShift.'
                  : response === 'assistance' || response === 'unwell'
                    ? 'Your assistance request is recorded for authorized caregivers. Acknowledgement is not guaranteed.'
                    : 'Your response is recorded. Your clinician’s instructions are unchanged.'}
              </Notice>
            )}
            {action.feedback}
            <div className="inline-actions" style={{ marginTop: 20 }}>
              <Button
                disabled={!response || followSaved || action.pending}
                onClick={() => {
                  if (!response) return;
                  void action.run(async () => {
                    const result = await command({
                      action: 'followUp',
                      circleId,
                      resourceId: follow.id,
                      version: follow.version,
                      reason: response,
                      requestId: crypto.randomUUID(),
                    });
                    setFollowSaved(true);
                    setFollow({ ...follow, version: Number(result.version) });
                    if (response === 'already_taken') {
                      setConfirm({
                        dose: { ...follow, version: Number(result.version) },
                        state: 'taken',
                        requestId: crypto.randomUUID(),
                      });
                      setFollow(null);
                    }
                  }, 'Response saved.');
                }}
              >
                <Localized value={'Save response'} />
              </Button>
              <Link
                className="button button-secondary"
                to="/assistance"
                onClick={() => setFollow(null)}
              >
                {t('Contact caregiver')}
              </Link>
            </div>
          </>
        )}
      </Modal>
      <Modal
        open={!!correction}
        onClose={() => setCorrection(null)}
        title="Correct a confirmation"
        description="This reopens the dose as unconfirmed and preserves an audit trail. Sign in again first if your last sign-in was more than five minutes ago."
      >
        <Field label="Reason for correction">
          <textarea
            minLength={5}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        {action.feedback}
        <Button
          disabled={action.pending || reason.trim().length < 5}
          onClick={() => {
            if (correction)
              void action
                .run(() =>
                  command({
                    action: 'correctDose',
                    circleId,
                    resourceId: correction.id,
                    version: correction.version,
                    reason,
                  }),
                )
                .then((ok) => {
                  if (ok) setCorrection(null);
                });
          }}
        >
          Reopen dose
        </Button>
      </Modal>
    </>
  );
}
