import { Localized } from '../../i18n/Localized';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CareDirectoryMember, CareTask } from '@carecircle/shared';
import { useCircle } from '../../app/CircleContext';
import { useLive } from '../../hooks/useLive';
import { Button, Empty, Field, Modal, Notice, Status, useAction } from '../../components/ui';
import { command } from '../../lib/firebase';
import { permissionLabels } from '../../app/permissionLabels';
import { useLocale } from '../../i18n/LocaleContext';
export function CircleNetwork() {
  const { circleId, circle, can } = useCircle(),
    { t } = useLocale();
  const members = useLive<CareDirectoryMember>(
    can('members.read') ? `careCircles/${circleId}/directory` : null,
    undefined,
    [],
    20,
  );
  const tasks = useLive<CareTask>(
    can('task.read') ? `careCircles/${circleId}/careAssignments` : null,
    ['updatedAt', 'desc'],
    [],
    100,
  );
  const [selected, setSelected] = useState<CareDirectoryMember | null>(null);
  if (!can('members.read')) return null;
  return (
    <section className="dashboard-card circle-network">
      <div className="section-title">
        <div>
          <p className="eyebrow">{t('Connected care')}</p>
          <h2>{t('Your trusted circle')}</h2>
        </div>
      </div>
      <div className="network-owner">
        <span className="avatar">{circle?.displayName.slice(0, 1)}</span>
        <strong>{circle?.displayName}</strong>
        <small>{t('Care at the centre')}</small>
      </div>
      {members.error && <Notice error>{members.error}</Notice>}
      <div className="network-members">
        {members.data
          .filter((m) => m.status === 'active' && m.role !== 'owner')
          .map((person) => (
            <button
              type="button"
              className="network-member"
              key={person.uid}
              onClick={() => setSelected(person)}
            >
              <span className="avatar">{person.displayName.slice(0, 1)}</span>
              <strong>{person.displayName}</strong>
              <span>{t(person.role === 'caregiver' ? 'Caregiver' : 'Family member')}</span>
              <small>
                {
                  tasks.data.filter(
                    (task) =>
                      task.assignedTo === person.uid &&
                      !['completed', 'declined'].includes(task.state),
                  ).length
                }{' '}
                {t('open responsibilities')}
              </small>
            </button>
          ))}
      </div>
      {members.data.filter((m) => m.status === 'active' && m.role !== 'owner').length === 0 && (
        <Empty title={t('Room for your people')}>
          {t('Invite someone you trust to share care.')}
        </Empty>
      )}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.displayName || 'Circle member'}
      >
        {selected && (
          <>
            <Status value={selected.role} />
            <h3>{t('Shared access')}</h3>
            <ul className="permission-list">
              {selected.permissions.map((p) => (
                <li key={p}>{t(permissionLabels[p])}</li>
              ))}
            </ul>
            <h3>{t('Responsibilities')}</h3>
            {tasks.data
              .filter(
                (task) =>
                  task.assignedTo === selected.uid &&
                  !['completed', 'declined'].includes(task.state),
              )
              .map((task) => (
                <p key={task.id}>
                  {task.title} · <Status value={task.state} />
                </p>
              ))}
            <div className="inline-actions">
              {selected.contactEmail && (
                <a className="button button-secondary" href={`mailto:${selected.contactEmail}`}>
                  {t('Email')}
                </a>
              )}
              {selected.contactPhone && (
                <a className="button button-secondary" href={`tel:${selected.contactPhone}`}>
                  {t('Call')}
                </a>
              )}
              <Link className="button button-primary" to="/assistance">
                {t('Request assistance')}
              </Link>
            </div>
            <p className="muted">
              Contact details appear only when this person chooses to share them.
            </p>
          </>
        )}
      </Modal>
    </section>
  );
}
export function ContactConsent() {
  const { member, circleId } = useCircle(),
    action = useAction();
  const [enabled, setEnabled] = useState(!!member?.contactConsent),
    [phone, setPhone] = useState(member?.contactPhone || '');
  return (
    <section className="panel">
      <h2>Contact sharing</h2>
      <p>Choose whether members with directory access can contact you directly.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(
            () =>
              command({ action: 'contactConsent', circleId, enabled, phone: enabled ? phone : '' }),
            'Contact sharing updated.',
          );
        }}
      >
        <label className="checkbox">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Share my account email and optional phone with my care circle
        </label>
        <Field label="Phone (optional)">
          <input
            type="tel"
            value={phone}
            disabled={!enabled}
            maxLength={30}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        {action.feedback}
        <Button disabled={action.pending}>
          <Localized value={'Save contact sharing'} />
        </Button>
      </form>
    </section>
  );
}
