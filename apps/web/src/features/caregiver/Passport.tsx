import { Localized } from '../../i18n/Localized';
import { useState } from 'react';
import type { Medication } from '@carecircle/shared';
import { useCircle } from '../../app/CircleContext';
import { command } from '../../lib/firebase';
import { Button, Notice, PageHeading, formatDate, useAction } from '../../components/ui';
import { useLocale } from '../../i18n/LocaleContext';
type Summary = {
  displayName: string;
  timeZone: string;
  emergencyContact: string;
  generatedAt: number;
  medications: Pick<
    Medication,
    | 'name'
    | 'strength'
    | 'instructions'
    | 'times'
    | 'weekdays'
    | 'timeZone'
    | 'doctor'
    | 'specialInstructions'
  >[];
  notes: string | null;
  limitReached: boolean;
};
export default function Passport() {
  const { circleId, can } = useCircle(),
    { t } = useLocale(),
    action = useAction();
  const [include, setInclude] = useState(false),
    [summary, setSummary] = useState<Summary | null>(null);
  return (
    <>
      <PageHeading title="CarePassport">
        {t('A private summary for your next care conversation.')}
      </PageHeading>
      <section className="dashboard-card passport-controls">
        <p>
          This summary is generated only for you with your current access. A printed or saved copy
          can contain sensitive health information.
        </p>
        {can('privacy.manage') && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={include}
              onChange={(e) => {
                setInclude(e.target.checked);
                setSummary(null);
              }}
            />
            Include private medical notes (requires recent sign-in)
          </label>
        )}
        <div className="inline-actions">
          <Button
            disabled={action.pending}
            onClick={() =>
              void action.run(
                async () =>
                  setSummary(
                    (await command({
                      action: 'passport',
                      circleId,
                      includePrivateNotes: include,
                    })) as Summary,
                  ),
                'Care summary ready.',
              )
            }
          >
            {summary ? 'Refresh summary' : 'Generate private summary'}
          </Button>
          {summary && (
            <Button variant="secondary" onClick={() => window.print()}>
              <Localized value={'Print / save PDF'} />
            </Button>
          )}
        </div>
        {action.feedback}
      </section>
      {summary && (
        <article className="dashboard-card care-passport">
          <p className="eyebrow">CareCircle · CarePassport</p>
          <h2>{summary.displayName}</h2>
          <p>
            Generated {formatDate(summary.generatedAt, summary.timeZone)} · {summary.timeZone}
          </p>
          <Notice>
            This is a summary of recorded information, not a prescription. Check the clinician’s
            instructions and current medication labels.
          </Notice>
          <h3>Emergency contact</h3>
          <p>{summary.emergencyContact || 'Not supplied'}</p>
          <h3>Active medications</h3>
          {summary.medications.length ? (
            summary.medications.map((m, index) => (
              <section className="passport-medication" key={index}>
                <h4>
                  {m.name} · {m.strength}
                </h4>
                <p>{m.instructions}</p>
                <p>
                  {m.times.join(' · ')} · {m.timeZone}
                </p>
                <p>
                  Scheduled weekdays:{' '}
                  {m.weekdays
                    .map((day) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day - 1])
                    .join(', ')}
                </p>
                {m.doctor && <p>Clinician: {m.doctor}</p>}
                {m.specialInstructions && <p>{m.specialInstructions}</p>}
              </section>
            ))
          ) : (
            <p>No active medications recorded.</p>
          )}
          {summary.limitReached && (
            <Notice>
              Showing the first 100 active medications. Review the medication list for additional
              records.
            </Notice>
          )}
          {summary.notes !== null && (
            <>
              <h3>Private medical notes</h3>
              <p className="preserve-lines">{summary.notes || 'No private notes recorded.'}</p>
            </>
          )}
        </article>
      )}
    </>
  );
}
