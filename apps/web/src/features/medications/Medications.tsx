import { Localized } from '../../i18n/Localized';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill, Plus, Pencil, Pause, Play, Archive } from 'lucide-react';
import {
  medicationSchema,
  stockForecast,
  type Inventory,
  type Medication,
  type RecordWithId,
} from '@carecircle/shared';
import { useNow } from './DoseList';
import { useCircle } from '../../app/CircleContext';
import { useLive } from '../../hooks/useLive';
import { command } from '../../lib/firebase';
import { Button, Empty, Modal, Notice, PageHeading, Status, useAction } from '../../components/ui';
const MedicationForm = lazy(() => import('./MedicationForm'));
export default function Medications() {
  const { circleId, can } = useCircle();
  const now = useNow();
  const stocks = useLive<Inventory>(
    can('inventory.read') && can('medication.read')
      ? `careCircles/${circleId}/medicationInventory`
      : null,
    undefined,
    [],
    100,
  );
  const medications = useLive<RecordWithId<Medication>>(
    can('medication.read') ? `careCircles/${circleId}/medications` : null,
    ['updatedAt', 'desc'],
    [],
    100,
  );
  const [editing, setEditing] = useState<RecordWithId<Medication> | null | undefined>(undefined);
  const [detail, setDetail] = useState<RecordWithId<Medication> | null>(null);
  const [archive, setArchive] = useState<RecordWithId<Medication> | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const action = useAction();
  if (!can('medication.read'))
    return (
      <Notice>
        You do not have access to medication details. Ask the profile owner to update your
        permissions.
      </Notice>
    );
  const changeStatus = (med: RecordWithId<Medication>, status: Medication['status']) =>
    action.run(() =>
      command({
        action: 'saveMedication',
        circleId,
        resourceId: med.id,
        version: med.version,
        medication: { ...medicationSchema.strip().parse(med), status },
      }),
    );
  return (
    <>
      <PageHeading
        title="Medication cabinet"
        action={
          can('medication.write') && (
            <Button onClick={() => setEditing(null)}>
              <Plus size={19} />
              <Localized value={'Add medication'} />
            </Button>
          )
        }
      >
        A clear, shared view of the prescribed care routine.
      </PageHeading>
      <div className="context-links">
        <Link to="/history">
          <Localized value={'Dose history'} />
        </Link>
        {can('inventory.read') && (
          <Link to="/inventory">
            <Localized value={'Refill Guardian'} />
          </Link>
        )}
        {can('prescription.read') && (
          <Link to="/prescriptions">
            <Localized value={'DischargeSync'} />
          </Link>
        )}
      </div>
      <div className="section-toolbar">
        <p>
          <strong>{medications.data.filter((m) => m.status === 'active').length}</strong> active
          medications
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />{' '}
          Include archived
        </label>
      </div>
      {action.feedback}
      {medications.error && <Notice error>{medications.error}</Notice>}
      {medications.loading ? (
        <p role="status">Loading medications…</p>
      ) : !medications.data.length ? (
        <Empty title="Build a clearer daily routine">
          Add the first medication using the instructions from your clinician.
        </Empty>
      ) : (
        <div className="medication-grid">
          {medications.data
            .filter((m) => showArchived || m.status !== 'archived')
            .map((m) => (
              <article className="panel medication-card" key={m.id}>
                <div className="card-top">
                  <span className="icon-tile">
                    <Pill size={23} />
                  </span>
                  <Status value={m.status} />
                </div>
                <h2>
                  <button className="heading-button" onClick={() => setDetail(m)}>
                    {m.name}
                  </button>
                </h2>
                <p className="muted">{m.strength}</p>
                <p>{m.instructions}</p>
                <div className="schedule-pills">
                  {m.times.map((time) => (
                    <span key={time}>{time}</span>
                  ))}
                </div>
                <small>
                  {m.weekdays.length === 7 ? 'Every day' : `${m.weekdays.length} days each week`} ·{' '}
                  {m.timeZone}
                </small>
                {can('inventory.read') && (
                  <div className="stock-strip">
                    {(() => {
                      const stock = stocks.data.find((s) => s.medicationId === m.id);
                      return stock ? (
                        <>
                          <strong>
                            {Math.max(0, stock.balance)} {stock.unit}
                          </strong>
                          <span>
                            estimated ·{' '}
                            {stockForecast(stock, m, now).low ? 'low supply' : 'recorded stock'}
                          </span>
                        </>
                      ) : (
                        <span>Stock not yet recorded</span>
                      );
                    })()}
                    <Link to="/inventory">View supply</Link>
                  </div>
                )}
                {can('medication.write') && (
                  <div className="card-actions">
                    <Button variant="ghost" onClick={() => setEditing(m)}>
                      <Pencil size={17} />
                      <Localized value={'Edit'} />
                    </Button>
                    {m.status !== 'archived' && (
                      <Button
                        disabled={action.pending}
                        variant="ghost"
                        onClick={() =>
                          void changeStatus(m, m.status === 'active' ? 'paused' : 'active')
                        }
                      >
                        {m.status === 'active' ? <Pause size={17} /> : <Play size={17} />}{' '}
                        {m.status === 'active' ? 'Pause' : 'Resume'}
                      </Button>
                    )}
                    {m.status !== 'archived' && (
                      <Button
                        variant="ghost"
                        aria-label={`Archive ${m.name}`}
                        onClick={() => setArchive(m)}
                      >
                        <Archive size={17} />
                      </Button>
                    )}
                  </div>
                )}
              </article>
            ))}
        </div>
      )}
      <Modal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? 'Edit medication' : 'Add a medication'}
      >
        {editing !== undefined && (
          <Suspense fallback={<p>Loading form…</p>}>
            <MedicationForm
              medication={editing || undefined}
              onSaved={() => setEditing(undefined)}
            />
          </Suspense>
        )}
      </Modal>
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name || 'Medication details'}
      >
        {detail && (
          <dl className="details">
            <dt>Strength</dt>
            <dd>{detail.strength}</dd>
            <dt>
              <Localized value={'Clinician instructions'} />
            </dt>
            <dd>{detail.instructions}</dd>
            <dt>Prescriber</dt>
            <dd>{detail.doctor || 'Not provided'}</dd>
            <dt>Special instructions</dt>
            <dd>{detail.specialInstructions || 'None recorded'}</dd>
            <dt>Schedule</dt>
            <dd>
              {detail.times.join(', ')} · {detail.timeZone}
            </dd>
            <dt>Date range</dt>
            <dd>
              {detail.startDate} to {detail.endDate || 'ongoing'}
            </dd>
          </dl>
        )}
      </Modal>
      <Modal
        open={!!archive}
        onClose={() => setArchive(null)}
        title="Archive this medication?"
        description="Future scheduled doses will be cancelled. Historical confirmations remain in your care history."
      >
        <Button
          variant="danger"
          disabled={action.pending}
          onClick={() => {
            if (archive)
              void changeStatus(archive, 'archived').then((ok) => {
                if (ok) setArchive(null);
              });
          }}
        >
          Archive medication
        </Button>
        {action.feedback}
      </Modal>
    </>
  );
}
