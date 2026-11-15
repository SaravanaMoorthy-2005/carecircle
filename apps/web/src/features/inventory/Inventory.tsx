import { Localized } from '../../i18n/Localized';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageCheck, Plus, History } from 'lucide-react';
import {
  stockForecast,
  type Inventory as Stock,
  type Medication,
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
import { useNow } from '../medications/DoseList';
import { useLocale } from '../../i18n/LocaleContext';
export default function Inventory() {
  const { circleId, circle, can } = useCircle(),
    { t } = useLocale(),
    now = useNow(),
    action = useAction(),
    prefix = 'careCircles/' + circleId + '/';
  const medications = useLive<RecordWithId<Medication>>(
    can('medication.read') ? prefix + 'medications' : null,
    ['updatedAt', 'desc'],
    [],
    100,
  );
  const stocks = useLive<Stock>(
    can('inventory.read') && can('medication.read') ? prefix + 'medicationInventory' : null,
    undefined,
    [],
    100,
  );
  const ledger = useLive<{
    id: string;
    medicationId: string;
    mode: string;
    quantity: number;
    balance: number;
    reason: string;
    createdAt: number;
  }>(
    can('inventory.read') && can('medication.read') ? prefix + 'inventoryAdjustments' : null,
    ['createdAt', 'desc'],
    [],
    30,
  );
  const [editing, setEditing] = useState<RecordWithId<Medication> | null>(null),
    [mode, setMode] = useState<'set' | 'restock'>('set'),
    [quantity, setQuantity] = useState(''),
    [unit, setUnit] = useState('tablets'),
    [perDose, setPerDose] = useState(1),
    [lowDays, setLowDays] = useState(7),
    [reason, setReason] = useState(''),
    [expected, setExpected] = useState(0);
  const edit = (med: RecordWithId<Medication>) => {
    const stock = stocks.data.find((s) => s.medicationId === med.id);
    setEditing(med);
    setMode(stock ? 'restock' : 'set');
    setQuantity('');
    setUnit(stock?.unit || 'tablets');
    setPerDose(stock?.unitsPerDose || 1);
    setLowDays(stock?.lowDays || 7);
    setExpected(stock?.version || 0);
    setReason('');
  };
  return (
    <>
      <PageHeading eyebrow="REFILL GUARDIAN" title={t('Estimated stock')}>
        A little planning helps keep the next dose within reach.
      </PageHeading>
      <div className="context-links">
        <Link to="/medications">{t('My Medicines')}</Link>
        <Link to="/tasks">{t('CareShift')}</Link>
        <Link to="/prescriptions">{t('DischargeSync')}</Link>
      </div>
      <Notice>
        Supply is an estimate based on recorded Taken actions and manual counts. Unconfirmed or
        skipped doses do not reduce stock. No medicines are ordered automatically.
      </Notice>
      {action.feedback}
      {stocks.error && <Notice error>{stocks.error}</Notice>}
      <div className="inventory-grid">
        {medications.data
          .filter((m) => m.status !== 'archived')
          .map((med) => {
            const stock = stocks.data.find((s) => s.medicationId === med.id),
              forecast = stock ? stockForecast(stock, med, now) : null;
            return (
              <article className="panel" key={med.id}>
                <div className="card-top">
                  <span className="icon-tile">
                    <PackageCheck size={23} />
                  </span>
                  {forecast?.low && <Status value="low" />}
                </div>
                <h2>{med.name}</h2>
                <p className="muted">{med.strength}</p>
                <div className="stock-quantity">
                  {stock ? Math.max(0, stock.balance) : '—'}
                  <small>{stock?.unit || t('No inventory recorded')}</small>
                </div>
                {stock && (
                  <p>
                    {forecast?.refillAt ? (
                      <>
                        Estimated supply through {formatDate(forecast.refillAt, med.timeZone)}.
                        Review before this time.
                      </>
                    ) : (
                      'No depletion date within the current one-year schedule.'
                    )}
                    {stock.balance < 0 &&
                      ' Reported consumption exceeded the last count; please recount.'}
                  </p>
                )}
                <div className="inline-actions">
                  {can('inventory.write') && (
                    <Button variant="secondary" onClick={() => edit(med)}>
                      <Plus size={17} />
                      <Localized value={'Update stock'} />
                    </Button>
                  )}
                  <Button
                    disabled={action.pending}
                    onClick={() =>
                      void action.run(
                        () => command({ action: 'requestRefill', circleId, medicationId: med.id }),
                        'Refill responsibility is ready in CareShift.',
                      )
                    }
                  >
                    <Localized value={'Request refill'} />
                  </Button>
                </div>
              </article>
            );
          })}
      </div>
      {!medications.data.length && (
        <Empty title="Your medicines come first">
          Add a prescribed medication before recording its supply.
        </Empty>
      )}
      <section className="panel" style={{ marginTop: 24 }}>
        <div className="section-title">
          <h2>Recent stock adjustments</h2>
          <History size={21} />
        </div>
        {!ledger.data.length && (
          <p className="muted">Counts, restocks and reported administrations will appear here.</p>
        )}
        {ledger.data.map((entry) => (
          <article className="notification-row" key={entry.id}>
            <strong>
              {medications.data.find((m) => m.id === entry.medicationId)?.name || 'Medication'} ·{' '}
              {entry.mode}
            </strong>
            <p>
              {entry.reason} · {entry.quantity} units · estimate after adjustment: {entry.balance}
            </p>
            <small>{formatDate(entry.createdAt, circle?.timeZone)}</small>
          </article>
        ))}
      </section>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Update stock"
        description="Use a physical count or the amount added. This changes an estimate, not a prescription."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editing) return;
            void action
              .run(() =>
                command({
                  action: 'inventory',
                  circleId,
                  medicationId: editing.id,
                  version: expected,
                  requestId: crypto.randomUUID(),
                  mode,
                  quantity: Number(quantity),
                  unit,
                  unitsPerDose: perDose,
                  lowDays,
                  reason,
                }),
              )
              .then((ok) => {
                if (ok) setEditing(null);
              });
          }}
        >
          <p>
            <strong>{editing?.name}</strong>
          </p>
          <Field label="Adjustment type">
            <select value={mode} onChange={(e) => setMode(e.target.value as 'set' | 'restock')}>
              <option value="restock">{t('Restock')}</option>
              <option value="set">{t('Count correction')}</option>
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Quantity">
              <input
                type="number"
                min="0"
                max="100000"
                step="0.01"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
            <Field label="Unit">
              <input
                required
                value={unit}
                maxLength={30}
                onChange={(e) => setUnit(e.target.value)}
              />
            </Field>
            <Field label="Units per administration">
              <input
                type="number"
                min="0.01"
                max="1000"
                step="0.01"
                value={perDose}
                required
                onChange={(e) => setPerDose(Number(e.target.value))}
              />
            </Field>
            <Field label="Low-stock warning days">
              <input
                type="number"
                min="1"
                max="90"
                value={lowDays}
                required
                onChange={(e) => setLowDays(Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label="Reason">
            <textarea
              value={reason}
              minLength={3}
              maxLength={300}
              required
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {action.feedback}
          <Button disabled={action.pending}>
            <Localized value={'Save changes'} />
          </Button>
        </form>
      </Modal>
    </>
  );
}
