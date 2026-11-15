import { Localized } from '../../i18n/Localized';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Temporal } from '@js-temporal/polyfill';
import { ArrowUpRight, ShieldCheck, CalendarDays, HeartHandshake, CheckCheck } from 'lucide-react';
import {
  doseState,
  stockForecast,
  taskStatus,
  type Dose,
  type Medication,
  type Inventory,
  type CareAlert,
  type Appointment,
  type RecordWithId,
  type CareTask,
  type CareDirectoryMember,
} from '@carecircle/shared';
import { useCircle } from '../../app/CircleContext';
import { useLive } from '../../hooks/useLive';
import { DoseList, useNow } from '../medications/DoseList';
import { Empty, Notice, PageHeading } from '../../components/ui';
import {
  DashboardCard,
  CalendarWidget,
  CareTimeline,
  MedicationCard,
  AppointmentCard,
  CareMemberCard,
  LoadingSkeleton,
  ReadAloud,
  type TimelineEvent,
} from '../../components/care-ui';
import { AlertCards } from '../assistance/Assistance';
import { useLocale } from '../../i18n/LocaleContext';
export default function Dashboard() {
  const { circle, circleId, can, member } = useCircle(),
    { t, language } = useLocale(),
    now = useNow(),
    timeZone = circle?.timeZone || 'UTC';
  const today = Temporal.Instant.fromEpochMilliseconds(now)
      .toZonedDateTimeISO(timeZone)
      .toPlainDate()
      .toString(),
    [chosenDate, setChosenDate] = useState('');
  const selected = chosenDate || today,
    month = Temporal.PlainDate.from(selected).with({ day: 1 });
  const monthStart = month.toZonedDateTime({ timeZone, plainTime: '00:00' }).epochMilliseconds,
    monthEnd = month
      .add({ months: 1 })
      .toZonedDateTime({ timeZone, plainTime: '00:00' }).epochMilliseconds;
  const prefix = 'careCircles/' + circleId + '/';
  const doses = useLive<Dose>(
    can('medication.read') ? prefix + 'doseOccurrences' : null,
    ['scheduledAt', 'asc'],
    [['localDate', '==', selected]],
    300,
  );
  const otherToday = useLive<Dose>(
    can('medication.read') && selected !== today ? prefix + 'doseOccurrences' : null,
    ['scheduledAt', 'asc'],
    [['localDate', '==', today]],
    300,
  );
  const todayDoses = (selected === today ? doses.data : otherToday.data).filter(
    (d) => d.state !== 'cancelled',
  );
  const medications = useLive<RecordWithId<Medication>>(
    can('medication.read') ? prefix + 'medications' : null,
    ['updatedAt', 'desc'],
    [],
    100,
  );
  const appointments = useLive<RecordWithId<Appointment> & { scheduledAt: number }>(
    can('appointment.read') ? prefix + 'appointments' : null,
    ['scheduledAt', 'asc'],
    [
      ['scheduledAt', '>=', monthStart],
      ['scheduledAt', '<', monthEnd],
    ],
    100,
  );
  const tasks = useLive<CareTask>(
    can('task.read') ? prefix + 'careAssignments' : null,
    ['dueAt', 'asc'],
    [['state', 'in', ['pending', 'accepted', 'in_progress']]],
    100,
  );
  const inventory = useLive<Inventory>(
    can('inventory.read') && can('medication.read') ? prefix + 'medicationInventory' : null,
    undefined,
    [],
    100,
  );
  const directory = useLive<CareDirectoryMember>(
    can('members.read') ? prefix + 'directory' : null,
    undefined,
    [],
    20,
  );
  const alerts = useLive<CareAlert>(
    can('alert.read') ? prefix + 'alerts' : null,
    ['createdAt', 'desc'],
    [['state', 'in', ['created', 'sent', 'acknowledged']]],
    30,
  );
  const assistance = useLive<CareAlert>(
    circleId ? prefix + 'assistanceRequests' : null,
    ['createdAt', 'desc'],
    [['state', 'in', ['created', 'sent', 'acknowledged']]],
    20,
  );
  const firstName = circle?.displayName.split(' ')[0] || '',
    hour = Number(
      new Intl.DateTimeFormat('en', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now),
    );
  const owner = member?.role === 'owner',
    next = todayDoses.find((d) => !['taken', 'skipped', 'cancelled'].includes(d.state));
  const events: TimelineEvent[] = doses.data
    .filter((d) => d.state !== 'cancelled')
    .map((d) => ({
      id: d.id,
      at: d.scheduledAt,
      title: d.name,
      detail: d.instructions,
      status: doseState(d, now),
      type: 'medication',
      to: '/history',
    }));
  appointments.data
    .filter(
      (a) =>
        a.status !== 'cancelled' &&
        Temporal.Instant.fromEpochMilliseconds(a.scheduledAt)
          .toZonedDateTimeISO(timeZone)
          .toPlainDate()
          .toString() === selected,
    )
    .forEach((a) =>
      events.push({
        id: a.id,
        at: a.scheduledAt,
        title: a.clinician,
        detail: a.specialty + ' · ' + a.location,
        status: a.status,
        type: 'appointment',
        to: '/appointments',
      }),
    );
  tasks.data
    .filter(
      (task) =>
        task.state !== 'declined' &&
        Temporal.Instant.fromEpochMilliseconds(task.dueAt)
          .toZonedDateTimeISO(timeZone)
          .toPlainDate()
          .toString() === selected,
    )
    .forEach((task) =>
      events.push({
        id: task.id,
        at: task.dueAt,
        title: task.title,
        detail: task.assignedName || t('Unassigned'),
        status: taskStatus(task, now),
        type: 'task',
        to: '/tasks',
      }),
    );
  const lowStock = inventory.data.filter((stock) => {
    const medication = medications.data.find((m) => m.id === stock.medicationId);
    return medication && stockForecast(stock, medication, now).low;
  });
  const unconfirmed = todayDoses.filter((d) => doseState(d, now) === 'unconfirmed'),
    pending = tasks.data.filter((task) => task.state === 'pending');
  const errors = [
    doses.error,
    appointments.error,
    tasks.error,
    inventory.error,
    alerts.error,
    assistance.error,
  ].filter(Boolean);
  return (
    <div className={owner ? 'careday' : 'carepulse'}>
      <PageHeading
        eyebrow={
          new Intl.DateTimeFormat(language, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            timeZone,
          }).format(now) +
          ' · ' +
          timeZone
        }
        title={
          owner
            ? t(
                hour < 12
                  ? 'Good morning, {name}'
                  : hour < 18
                    ? 'Good afternoon, {name}'
                    : 'Good evening, {name}',
                { name: firstName },
              )
            : t(member?.role === 'family' ? 'Care Overview' : 'Care Overview')
        }
        action={
          <ReadAloud
            text={events
              .map(
                (e) =>
                  new Intl.DateTimeFormat(language, { timeStyle: 'short', timeZone }).format(e.at) +
                  '. ' +
                  e.title +
                  '. ' +
                  e.detail +
                  '. ' +
                  t(e.status),
              )
              .join('. ')}
          />
        }
      >
        {owner
          ? t('Here is your care plan for today.')
          : firstName + '’s care, connected. The right attention, at the right time.'}
      </PageHeading>
      {!!errors.length && <Notice error>{errors[0]}</Notice>}
      {doses.cached && (
        <Notice>
          Reconnecting. These records may be out of date; confirmations require a connection.
        </Notice>
      )}
      <div className="dashboard-layout">
        <div className="dashboard-main">
          {!owner && (
            <div className="pulse-grid">
              {can('medication.read') && (
                <Link className="pulse-stat" to="/history">
                  <span>Unconfirmed today</span>
                  <strong>{unconfirmed.length}</strong>
                  <p>Reported actions pending</p>
                </Link>
              )}
              {can('task.read') && (
                <Link className="pulse-stat" to="/tasks">
                  <span>
                    <Localized value={'Responsibilities'} />
                  </span>
                  <strong>{pending.length}</strong>
                  <p>Awaiting acceptance</p>
                </Link>
              )}
              {can('inventory.read') && can('medication.read') && (
                <Link className="pulse-stat" to="/inventory">
                  <span>
                    <Localized value={'Low supply'} />
                  </span>
                  <strong>{lowStock.length}</strong>
                  <p>
                    <Localized value={'Estimated stock'} />
                  </p>
                </Link>
              )}
            </div>
          )}
          {owner ? (
            <DashboardCard
              title="My next medication"
              className="next-action"
              eyebrow="ONE THING AT A TIME"
              action={
                <span className="section-chip">
                  <ShieldCheck size={14} /> SafeDose
                </span>
              }
            >
              {doses.loading ? (
                <LoadingSkeleton />
              ) : next ? (
                <DoseList doses={[next]} />
              ) : (
                <Empty
                  title={
                    todayDoses.length ? 'Today’s doses are recorded' : 'Your routine starts here'
                  }
                >
                  {todayDoses.length
                    ? 'Your reported actions are saved for your care circle.'
                    : 'Add your clinician-provided schedule in My Medicines.'}
                </Empty>
              )}
              <div className="safe-dose-note">
                <ShieldCheck size={16} />
                <span>
                  SafeDose records reported actions. It does not verify medication ingestion.
                </span>
              </div>
            </DashboardCard>
          ) : (
            <DashboardCard
              title="Needs attention"
              eyebrow="CAREPULSE"
              action={
                <Link to="/alerts">
                  All updates <ArrowUpRight size={15} />
                </Link>
              }
            >
              {alerts.data.length || assistance.data.length ? (
                <>
                  <AlertCards records={alerts.data.slice(0, 3)} collection="alerts" />
                  <AlertCards
                    records={assistance.data.slice(0, 2)}
                    collection="assistanceRequests"
                  />
                </>
              ) : (
                <Empty title="A little breathing room">
                  No unresolved alerts or assistance requests in this care circle.
                </Empty>
              )}
              {unconfirmed.length > 0 && <DoseList doses={unconfirmed.slice(0, 3)} />}
            </DashboardCard>
          )}
          <DashboardCard
            title={selected === today ? 'Today’s care timeline' : 'Your care timeline'}
            action={
              <span className="section-chip">
                <CalendarDays size={14} />
                {selected === today ? t('Today') : selected}
              </span>
            }
          >
            {doses.loading ? (
              <LoadingSkeleton />
            ) : (
              <CareTimeline events={events} timeZone={timeZone} />
            )}
          </DashboardCard>
          {appointments.data.filter((a) => a.scheduledAt >= now && a.status === 'scheduled')
            .length > 0 && (
            <DashboardCard
              title="Coming up"
              action={
                <Link to="/appointments">
                  {t('Appointments')} <ArrowUpRight size={15} />
                </Link>
              }
            >
              <div className="pastel-grid">
                {appointments.data
                  .filter((a) => a.scheduledAt >= now && a.status === 'scheduled')
                  .slice(0, 2)
                  .map((a) => (
                    <AppointmentCard key={a.id} appointment={a} />
                  ))}
              </div>
            </DashboardCard>
          )}
          {can('members.read') && (
            <DashboardCard
              title="Your care circle"
              action={
                <Link to="/members">
                  {t('View care circle')} <ArrowUpRight size={15} />
                </Link>
              }
            >
              <div className="connection-members">
                {directory.data
                  .filter((m) => m.status === 'active' && m.role !== 'owner')
                  .slice(0, 3)
                  .map((m) => (
                    <CareMemberCard key={m.id} member={m} />
                  ))}
              </div>
              {!directory.data.some((m) => m.role !== 'owner' && m.status === 'active') && (
                <p className="muted">Invite a trusted person to share your care routine.</p>
              )}
              {assistance.data.length > 0 && (
                <p>
                  <CheckCheck size={17} /> {assistance.data.length} support request(s) awaiting
                  acknowledgement or resolution.
                </p>
              )}
            </DashboardCard>
          )}
        </div>
        <aside className="utility-column">
          <CalendarWidget
            selected={selected}
            onSelect={setChosenDate}
            timeZone={timeZone}
            appointments={appointments.data}
            medications={medications.data}
          />
          {can('medication.read') && (
            <DashboardCard
              title="My medicines"
              action={
                <Link to="/medications" aria-label="View all medications">
                  <ArrowUpRight size={18} />
                </Link>
              }
            >
              <div className="mini-medicines">
                {medications.data
                  .filter((m) => m.status === 'active')
                  .slice(0, 4)
                  .map((m) => (
                    <MedicationCard medication={m} key={m.id} />
                  ))}
              </div>
              {!medications.data.length && (
                <p className="muted">Your medication list will appear here.</p>
              )}
            </DashboardCard>
          )}
          <DashboardCard className="help-card">
            <HeartHandshake size={30} strokeWidth={1.5} />
            <h2>A little help goes a long way.</h2>
            <p>Reach out to someone in your circle, whenever you need a hand.</p>
            <Link className="button button-primary full-width" to="/assistance">
              {t('Contact caregiver')} <ArrowUpRight size={17} />
            </Link>
            <small>Not an emergency response service.</small>
          </DashboardCard>
        </aside>
      </div>
    </div>
  );
}
