import { Localized } from '../../i18n/Localized';
import { AppointmentCompanion } from './Companion';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarDays, Plus, MapPin, Pencil, Check, X, ExternalLink } from 'lucide-react';
import { appointmentSchema, type Appointment, type RecordWithId } from '@carecircle/shared';
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
type AppointmentRecord = RecordWithId<Appointment> & { scheduledAt: number };
function AppointmentForm({
  appointment,
  onSaved,
}: {
  appointment?: AppointmentRecord;
  onSaved: () => void;
}) {
  const { circleId, circle } = useCircle(),
    action = useAction();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof appointmentSchema>, unknown, Appointment>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: appointment
      ? appointmentSchema.strip().parse(appointment)
      : {
          clinician: '',
          specialty: '',
          localDate: '',
          localTime: '09:00',
          timeZone: circle?.timeZone || 'Asia/Kolkata',
          location: '',
          teleconsultationUrl: '',
          instructions: '',
          status: 'scheduled',
          reminderMinutes: [1440, 60],
        },
  });
  return (
    <form
      onSubmit={handleSubmit(async (data) => {
        if (
          await action.run(() =>
            command({
              action: 'saveAppointment',
              circleId,
              resourceId: appointment?.id || crypto.randomUUID(),
              version: appointment?.version || 0,
              appointment: data,
            }),
          )
        )
          onSaved();
      })}
    >
      <div className="form-grid">
        <Field label="Clinician" error={errors.clinician?.message}>
          <input {...register('clinician')} />
        </Field>
        <Field label="Specialty">
          <input {...register('specialty')} />
        </Field>
        <Field label="Date" error={errors.localDate?.message}>
          <input type="date" {...register('localDate')} />
        </Field>
        <Field label="Time" error={errors.localTime?.message}>
          <input type="time" {...register('localTime')} />
        </Field>
        <Field label="Time zone" error={errors.timeZone?.message}>
          <input {...register('timeZone')} />
        </Field>
        <Field label="Hospital / location" error={errors.location?.message}>
          <input {...register('location')} />
        </Field>
      </div>
      <Field label="Teleconsultation link (optional)" error={errors.teleconsultationUrl?.message}>
        <input type="url" {...register('teleconsultationUrl')} placeholder="https://" />
      </Field>
      <Field label="Preparation instructions">
        <textarea rows={2} {...register('instructions')} />
      </Field>
      <Field
        label="Reminder lead times in minutes"
        error={errors.reminderMinutes?.message}
        hint="Separate with commas. 1440 = one day; 60 = one hour."
      >
        <input
          defaultValue={appointment?.reminderMinutes.join(', ') || '1440, 60'}
          {...register('reminderMinutes', {
            setValueAs: (value) =>
              typeof value === 'string' ? value.split(',').filter(Boolean).map(Number) : value,
          })}
        />
      </Field>
      {action.feedback}
      <Button disabled={action.pending}>
        {action.pending
          ? 'Saving…'
          : appointment
            ? 'Save appointment changes'
            : 'Create appointment'}
      </Button>
    </form>
  );
}
export default function Appointments() {
  const { circleId, can } = useCircle();
  const records = useLive<AppointmentRecord>(
    can('appointment.read') ? `careCircles/${circleId}/appointments` : null,
    ['scheduledAt', 'asc'],
    [],
    100,
  );
  const [editing, setEditing] = useState<AppointmentRecord | null | undefined>(undefined),
    [cancelling, setCancelling] = useState<AppointmentRecord | null>(null);
  const [companionId, setCompanionId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const action = useAction();
  if (!can('appointment.read'))
    return <Notice>Appointment access has not been shared with you.</Notice>;
  const status = (appointment: AppointmentRecord, next: Appointment['status']) =>
    action.run(() =>
      command({
        action: 'saveAppointment',
        circleId,
        resourceId: appointment.id,
        version: appointment.version,
        appointment: { ...appointmentSchema.strip().parse(appointment), status: next },
      }),
    );
  return (
    <>
      <PageHeading
        title="Time for your health"
        action={
          can('appointment.write') && (
            <Button onClick={() => setEditing(null)}>
              <Plus size={19} /> Add appointment
            </Button>
          )
        }
      >
        Every appointment, with the details your circle needs.
      </PageHeading>
      <div className="section-toolbar">
        <h2>
          <Localized value={'Your appointments'} />
        </h2>
        <div className="segmented">
          <Button
            variant={view === 'list' ? 'primary' : 'ghost'}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            List
          </Button>
          <Button
            variant={view === 'calendar' ? 'primary' : 'ghost'}
            aria-pressed={view === 'calendar'}
            onClick={() => setView('calendar')}
          >
            Calendar agenda
          </Button>
        </div>
      </div>
      {action.feedback}
      {records.error && <Notice error>{records.error}</Notice>}
      {records.loading ? (
        <p role="status">Loading appointments…</p>
      ) : !records.data.length ? (
        <Empty title="Your calendar is clear">
          Add an appointment to keep your care circle in the loop.
        </Empty>
      ) : (
        <div className={view === 'calendar' ? 'appointment-agenda' : 'appointment-list'}>
          {records.data.map((appointment) => (
            <article className="panel appointment-card" key={appointment.id}>
              <div className="date-tile">
                <CalendarDays size={21} />
                <strong>{appointment.localDate.slice(8)}</strong>
                <span>
                  {new Intl.DateTimeFormat('en', {
                    month: 'short',
                    timeZone: appointment.timeZone,
                  }).format(appointment.scheduledAt)}
                </span>
              </div>
              <div className="appointment-content">
                <Status value={appointment.status} />
                <h2>{appointment.clinician}</h2>
                <p>{appointment.specialty || 'Medical appointment'}</p>
                <p>
                  <strong>{formatDate(appointment.scheduledAt, appointment.timeZone)}</strong> ·{' '}
                  {appointment.timeZone}
                </p>
                <p className="with-icon">
                  <MapPin size={17} />
                  {appointment.location}
                </p>
                <Button variant="secondary" onClick={() => setCompanionId(appointment.id)}>
                  <Localized value={'Prepare / visit notes'} />
                </Button>
                {appointment.instructions && <p>{appointment.instructions}</p>}
                {appointment.teleconsultationUrl && (
                  <a
                    href={appointment.teleconsultationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="with-icon"
                  >
                    Open teleconsultation <ExternalLink size={16} />
                  </a>
                )}
                {can('appointment.write') && appointment.status === 'scheduled' && (
                  <div className="card-actions">
                    <Button variant="ghost" onClick={() => setEditing(appointment)}>
                      <Pencil size={17} /> Edit / reschedule
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={action.pending}
                      onClick={() => void status(appointment, 'completed')}
                    >
                      <Check size={17} />
                      <Localized value={'Complete'} />
                    </Button>
                    <Button variant="ghost" onClick={() => setCancelling(appointment)}>
                      <X size={17} />
                      <Localized value={'Cancel'} />
                    </Button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {companionId && (
        <AppointmentCompanion
          key={companionId}
          appointmentId={companionId}
          onClose={() => setCompanionId(null)}
        />
      )}
      <Modal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? 'Edit appointment' : 'Add an appointment'}
      >
        {editing !== undefined && (
          <AppointmentForm
            appointment={editing || undefined}
            onSaved={() => setEditing(undefined)}
          />
        )}
      </Modal>
      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Cancel this appointment?"
        description="Its pending reminders will become invalid. The appointment record stays in your care history."
      >
        {action.feedback}
        <Button
          variant="danger"
          disabled={action.pending}
          onClick={() => {
            if (cancelling)
              void status(cancelling, 'cancelled').then((ok) => {
                if (ok) setCancelling(null);
              });
          }}
        >
          Cancel appointment
        </Button>
      </Modal>
    </>
  );
}
