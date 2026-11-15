import { Localized } from '../../i18n/Localized';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck2, Plus, ArrowRight, RotateCcw } from 'lucide-react';
import {
  medicationSchema,
  prescriptionDifference,
  type Medication,
  type PrescriptionItem,
  type RecordWithId,
} from '@carecircle/shared';
import { useCircle } from '../../app/CircleContext';
import { useLive } from '../../hooks/useLive';
import { command } from '../../lib/firebase';
import {
  Button,
  Empty,
  Field,
  Modal,
  Notice,
  PageHeading,
  Status,
  formatDate,
  useAction,
} from '../../components/ui';
import { useLocale } from '../../i18n/LocaleContext';
const MedicationForm = lazy(() => import('../medications/MedicationForm'));
interface Review {
  id: string;
  source: string;
  state: string;
  version: number;
  items: PrescriptionItem[];
  previous: (RecordWithId<Medication> | null)[];
}
export default function Prescriptions() {
  const [scheduleNotice, setScheduleNotice] = useState('');
  const { circleId, can } = useCircle(),
    { t } = useLocale(),
    action = useAction(),
    prefix = 'careCircles/' + circleId + '/';
  const medications = useLive<RecordWithId<Medication>>(
      can('medication.read') ? prefix + 'medications' : null,
      ['updatedAt', 'desc'],
      [],
      100,
    ),
    drafts = useLive<{
      id: string;
      state: string;
      version: number;
      createdAt: number;
      counts: Record<string, number>;
    }>(
      can('prescription.read') ? prefix + 'prescriptionReconciliations' : null,
      ['createdAt', 'desc'],
      [],
      30,
    );
  const [preparing, setPreparing] = useState(false),
    [source, setSource] = useState(''),
    [items, setItems] = useState<PrescriptionItem[]>([]),
    [editing, setEditing] = useState<PrescriptionItem | null | undefined>(undefined),
    [review, setReview] = useState<Review | null>(null),
    [verified, setVerified] = useState(false);
  const start = () => {
    setItems(
      medications.data
        .filter((m) => m.status !== 'archived')
        .slice(0, 20)
        .map((m) => ({
          medicationId: m.id,
          expectedVersion: m.version,
          medication: medicationSchema.strip().parse(m),
        })),
    );
    setSource('');
    setPreparing(true);
  };
  const open = async (id: string) => {
    const result = await command({ action: 'readPrescription', circleId, resourceId: id });
    setReview(result as unknown as Review);
    setVerified(false);
  };
  return (
    <>
      <PageHeading
        eyebrow="DISCHARGESYNC"
        title={t('DischargeSync')}
        action={
          can('prescription.write') && (
            <Button onClick={start}>
              <FileCheck2 size={19} />
              <Localized value={'Prepare a comparison'} />
            </Button>
          )
        }
      >
        A clearer transition from hospital to home.
      </PageHeading>
      <div className="context-links">
        <Link to="/medications">{t('My Medicines')}</Link>
        <Link to="/history">{t('Dose history')}</Link>
      </div>
      <Notice>
        Enter only clinician-issued changes. Drafts do not change the care plan. An authorized
        person must verify and apply them; previous confirmations stay intact.
      </Notice>
      {action.feedback}
      {drafts.error && <Notice error>{drafts.error}</Notice>}
      {preparing && (
        <section className="panel">
          <div className="section-title">
            <h2>
              <Localized value={'Prepare a comparison'} />
            </h2>
            <Button variant="ghost" onClick={() => setPreparing(false)}>
              <Localized value={'Cancel'} />
            </Button>
          </div>
          <Field
            label="Clinician-issued source"
            hint="For example, the clinician and date on the discharge instructions."
          >
            <input
              value={source}
              minLength={3}
              maxLength={300}
              required
              onChange={(e) => setSource(e.target.value)}
            />
          </Field>
          <p className="muted">
            Review up to 20 medicines per comparison. Omitted medicines remain unchanged.
          </p>
          {items.map((item) => {
            const prior = medications.data.find((m) => m.id === item.medicationId) || null,
              difference = prescriptionDifference(prior, item.medication);
            return (
              <article className="draft-row" key={item.medicationId}>
                <div>
                  <Status value={difference.kind} />
                  <h3>{item.medication.name}</h3>
                  <p>
                    {item.medication.times.join(', ')} · {item.medication.instructions}
                  </p>
                </div>
                <div className="inline-actions">
                  <Button variant="secondary" onClick={() => setEditing(item)}>
                    <Localized value={'Edit'} />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setItems(
                        items.map((i) =>
                          i.medicationId === item.medicationId
                            ? {
                                ...i,
                                medication: {
                                  ...i.medication,
                                  status:
                                    i.medication.status === 'archived' ? 'active' : 'archived',
                                },
                              }
                            : i,
                        ),
                      )
                    }
                  >
                    {item.medication.status === 'archived' ? (
                      <>
                        <RotateCcw size={16} />
                        Restore
                      </>
                    ) : (
                      'Discontinue'
                    )}
                  </Button>
                  {!prior && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setItems(items.filter((i) => i.medicationId !== item.medicationId))
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
          <div className="inline-actions" style={{ marginTop: 20 }}>
            <Button
              variant="secondary"
              disabled={items.length >= 20}
              onClick={() => setEditing(null)}
            >
              <Plus size={17} />
              <Localized value={'Add medication'} />
            </Button>
            <Button
              disabled={action.pending || source.trim().length < 3 || !items.length}
              onClick={() =>
                void action.run(async () => {
                  const result = await command({
                    action: 'draftPrescription',
                    circleId,
                    requestId: crypto.randomUUID(),
                    source,
                    items,
                  });
                  await open(String(result.id));
                  setPreparing(false);
                }, 'Comparison saved securely.')
              }
            >
              <Localized value={'Review changes'} />
              <ArrowRight size={17} />
            </Button>
          </div>
        </section>
      )}
      {scheduleNotice && <Notice>{scheduleNotice}</Notice>}
      {!preparing && (
        <section className="panel">
          <h2>Prescription history</h2>
          {drafts.data.length ? (
            drafts.data.map((draft) => (
              <article className="draft-row" key={draft.id}>
                <div>
                  <Status value={draft.state} />
                  <p>{formatDate(draft.createdAt)}</p>
                  <small>
                    {Object.entries(draft.counts)
                      .map(([key, value]) => value + ' ' + t(key))
                      .join(' · ')}
                  </small>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => void action.run(() => open(draft.id), 'Comparison opened.')}
                >
                  <Localized value={'View comparison'} />
                </Button>
              </article>
            ))
          ) : (
            <Empty title="Keep every change clear">
              Your clinician-issued prescription comparisons will appear here.
            </Empty>
          )}
        </section>
      )}
      <Modal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title="Edit proposed medication"
        description="This is a draft. No active schedule changes until the comparison is verified."
      >
        {editing !== undefined && (
          <Suspense fallback={<p>Loading form…</p>}>
            <MedicationForm
              medication={
                editing
                  ? {
                      ...editing.medication,
                      id: editing.medicationId,
                      version: editing.expectedVersion,
                      createdAt: 0,
                      updatedAt: 0,
                    }
                  : undefined
              }
              onSaved={() => {}}
              onDraft={(medication) => {
                if (editing)
                  setItems(
                    items.map((i) =>
                      i.medicationId === editing.medicationId ? { ...i, medication } : i,
                    ),
                  );
                else
                  setItems([
                    ...items,
                    { medicationId: crypto.randomUUID(), expectedVersion: 0, medication },
                  ]);
                setEditing(undefined);
              }}
            />
          </Suspense>
        )}
      </Modal>
      <Modal
        open={!!review}
        onClose={() => setReview(null)}
        title="Before and after"
        description="Check each item against the clinician’s instructions, including timing and frequency."
      >
        {review && (
          <>
            <p>
              <strong>Source:</strong> {review.source}
            </p>
            {review.items.map((item, index) => {
              const prior = review.previous[index] || null,
                difference = prescriptionDifference(prior, item.medication);
              return (
                <article className="comparison-item" key={item.medicationId}>
                  <div className="section-title">
                    <h3>{item.medication.name}</h3>
                    <Status value={difference.kind} />
                  </div>
                  <div className="comparison-grid">
                    <div className="comparison-side">
                      <h3>{t('Before')}</h3>
                      {prior ? (
                        <>
                          <p>
                            {prior.name} · {prior.strength}
                          </p>
                          <p>{prior.instructions}</p>
                          <p>
                            {prior.times.join(', ')} · {prior.weekdays.length} days/week
                          </p>
                          <small>
                            {prior.timeZone} · {prior.status}
                          </small>
                        </>
                      ) : (
                        <p>Not previously prescribed here</p>
                      )}
                    </div>
                    <div className="comparison-side proposed">
                      <h3>{t('Proposed')}</h3>
                      <p>
                        {item.medication.name} · {item.medication.strength}
                      </p>
                      <p>{item.medication.instructions}</p>
                      <p>
                        {item.medication.times.join(', ')} · {item.medication.weekdays.length}{' '}
                        days/week
                      </p>
                      <small>
                        {item.medication.timeZone} · {item.medication.status}
                      </small>
                    </div>
                  </div>
                  {difference.fields.length > 0 && (
                    <p className="muted">Changed: {difference.fields.join(', ')}</p>
                  )}
                </article>
              );
            })}
            {review.state === 'draft' && can('prescription.approve') ? (
              <>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={verified}
                    onChange={(e) => setVerified(e.target.checked)}
                  />
                  I verified every change against the clinician-issued prescription.
                </label>
                {action.feedback}
                <Button
                  disabled={!verified || action.pending}
                  onClick={() =>
                    void action.run(async () => {
                      const result = await command({
                        action: 'applyPrescription',
                        circleId,
                        resourceId: review.id,
                        version: review.version,
                        verified: true,
                      });
                      setReview(null);
                      if (result.schedulesPending)
                        setScheduleNotice(
                          'Prescription applied. Future schedules are queued for the background worker.',
                        );
                    }, 'Verified changes applied. Historical confirmations are preserved.')
                  }
                >
                  <Localized value={'Verify and apply'} />
                </Button>
              </>
            ) : (
              <Notice>
                {review.state === 'applied'
                  ? 'This comparison has already been applied.'
                  : 'Your role can review this draft. An authorized verifier must apply it.'}
              </Notice>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
