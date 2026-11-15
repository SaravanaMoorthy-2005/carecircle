import { Localized } from '../../i18n/Localized';
import { Link } from 'react-router-dom';
import { Temporal } from '@js-temporal/polyfill';
import {
  doseState,
  type CareAlert,
  type CareTask,
  type Dose,
  type Appointment,
  type RecordWithId,
} from '@carecircle/shared';
import { useCircle } from '../../app/CircleContext';
import { useLive } from '../../hooks/useLive';
import { Button, Notice, PageHeading, Status, formatDate } from '../../components/ui';
import { DashboardCard } from '../../components/care-ui';
import { useNow } from '../medications/DoseList';
export default function Handoff() {
  const { circleId, circle, can } = useCircle(),
    now = useNow(),
    zone = circle!.timeZone;
  const today = Temporal.Instant.fromEpochMilliseconds(now)
      .toZonedDateTimeISO(zone)
      .toPlainDate()
      .toString(),
    path = `careCircles/${circleId}`;
  const doses = useLive<Dose>(
    can('medication.read') ? `${path}/doseOccurrences` : null,
    ['scheduledAt', 'asc'],
    [['localDate', '==', today]],
    100,
  );
  const alerts = useLive<CareAlert>(
    can('alert.read') ? `${path}/alerts` : null,
    ['createdAt', 'desc'],
    [],
    30,
  );
  const tasks = useLive<CareTask>(
    `${path}/careAssignments`,
    ['dueAt', 'asc'],
    [['state', 'in', ['pending', 'accepted', 'in_progress']]],
    100,
  );
  const visits = useLive<RecordWithId<Appointment> & { scheduledAt: number }>(
    can('appointment.read') ? `${path}/appointments` : null,
    ['scheduledAt', 'asc'],
    [['scheduledAt', '>=', now]],
    10,
  );
  return (
    <>
      <PageHeading
        title="Care Handoff"
        action={
          <Button variant="secondary" onClick={() => window.print()}>
            <Localized value={'Print briefing'} />
          </Button>
        }
      >
        A live briefing for {circle!.displayName}. Only information shared with your role appears.
      </PageHeading>
      <p className="muted">
        Updated {formatDate(now, zone)} · {zone}. This briefing is limited to 100 responsibilities,
        30 recent alerts and today’s first 100 doses.
      </p>
      {[doses.error, alerts.error, tasks.error, visits.error].filter(Boolean).map((error, i) => (
        <Notice error key={i}>
          {error}
        </Notice>
      ))}
      <div className="settings-grid">
        {can('medication.read') && (
          <DashboardCard title="Medication follow-up">
            {doses.data
              .filter((dose) => doseState(dose, now) === 'unconfirmed')
              .map((dose) => (
                <p key={dose.id}>
                  <Link to="/history">{dose.name}</Link> · {dose.localTime} ·{' '}
                  {dose.followUpReason || 'Not confirmed'}
                </p>
              ))}
            {!doses.data.some((dose) => doseState(dose, now) === 'unconfirmed') && (
              <p>No unconfirmed doses in today’s loaded records.</p>
            )}
          </DashboardCard>
        )}
        {can('medication.read') && (
          <DashboardCard title="Upcoming medication responsibilities">
            {doses.data
              .filter(
                (dose) =>
                  dose.scheduledAt >= now &&
                  !['taken', 'skipped', 'cancelled'].includes(dose.state),
              )
              .slice(0, 10)
              .map((dose) => (
                <p key={dose.id}>
                  <Link to="/medications">{dose.name}</Link> · {dose.localTime} ·{' '}
                  {dose.instructions}
                </p>
              ))}
            {!doses.data.some(
              (dose) =>
                dose.scheduledAt >= now && !['taken', 'skipped', 'cancelled'].includes(dose.state),
            ) && <p>No upcoming doses in today’s loaded records.</p>}
          </DashboardCard>
        )}
        {can('alert.read') && (
          <DashboardCard title="Open alerts">
            {alerts.data
              .filter((alert) => alert.state !== 'resolved')
              .map((alert) => (
                <p key={alert.id}>
                  <Link to="/alerts">{alert.category}</Link> · <Status value={alert.state} />
                </p>
              ))}
            {!alerts.data.some((alert) => alert.state !== 'resolved') && (
              <p>No open alerts in the recent records.</p>
            )}
          </DashboardCard>
        )}
        <DashboardCard title="Shared responsibilities">
          {tasks.data
            .filter((task) => !['completed', 'declined'].includes(task.state))
            .slice(0, 10)
            .map((task) => (
              <article className="handoff-item" key={task.id}>
                <Link to="/tasks">
                  <strong>{task.title}</strong>
                </Link>
                <p>
                  {task.assignedName || 'Unassigned'} · {formatDate(task.dueAt, zone)}
                </p>
                <Status value={task.state} />
              </article>
            ))}
          {!tasks.data.some((task) => !['completed', 'declined'].includes(task.state)) && (
            <p>No open responsibilities.</p>
          )}
        </DashboardCard>
        {can('appointment.read') && (
          <DashboardCard title="Next appointments">
            {visits.data
              .filter((visit) => visit.status === 'scheduled')
              .map((visit) => (
                <p key={visit.id}>
                  <Link to="/appointments">{visit.clinician}</Link> ·{' '}
                  {formatDate(visit.scheduledAt, zone)}
                </p>
              ))}
            {!visits.data.some((visit) => visit.status === 'scheduled') && (
              <p>No upcoming appointments in the loaded records.</p>
            )}
          </DashboardCard>
        )}
      </div>
    </>
  );
}
