import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { medicationSchema, type Medication, type RecordWithId } from '@carecircle/shared';
import { useCircle } from '../../app/CircleContext';
import { command } from '../../lib/firebase';
import { Button, Field, useAction } from '../../components/ui';
export default function MedicationForm({
  medication,
  onSaved,
  onDraft,
}: {
  medication?: RecordWithId<Medication>;
  onSaved: () => void;
  onDraft?: (medication: Medication) => void;
}) {
  const { circle, circleId } = useCircle();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof medicationSchema>, unknown, Medication>({
    resolver: zodResolver(medicationSchema),
    defaultValues: medication
      ? medicationSchema.strip().parse(medication)
      : {
          name: '',
          strength: '',
          instructions: '',
          times: ['08:00'],
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          startDate: new Intl.DateTimeFormat('en-CA', { timeZone: circle?.timeZone }).format(
            new Date(),
          ),
          endDate: null,
          timeZone: circle?.timeZone || 'Asia/Kolkata',
          doctor: '',
          specialInstructions: '',
          status: 'active',
        },
  });
  const action = useAction();
  return (
    <form
      onSubmit={handleSubmit(async (data) => {
        if (onDraft) {
          onDraft(data);
          return;
        }
        const ok = await action.run(() =>
          command({
            action: 'saveMedication',
            circleId,
            resourceId: medication?.id || crypto.randomUUID(),
            version: medication?.version || 0,
            medication: data,
          }),
        );
        if (ok) onSaved();
      })}
    >
      <div className="form-grid">
        <Field label="Medication name" error={errors.name?.message}>
          <input {...register('name')} aria-invalid={!!errors.name} />
        </Field>
        <Field label="Strength / formulation" error={errors.strength?.message}>
          <input
            {...register('strength')}
            placeholder="As written on the prescription"
            aria-invalid={!!errors.strength}
          />
        </Field>
      </div>
      <Field label="Clinician-provided dose instructions" error={errors.instructions?.message}>
        <textarea {...register('instructions')} rows={2} aria-invalid={!!errors.instructions} />
      </Field>
      <div className="form-grid">
        <Field
          label="Dose times"
          error={errors.times?.message}
          hint="24-hour times, separated by commas. Example: 08:00, 20:00"
        >
          <input
            defaultValue={medication?.times.join(', ') || '08:00'}
            {...register('times', {
              setValueAs: (value) =>
                typeof value === 'string' ? value.split(',').map((part) => part.trim()) : value,
            })}
            aria-invalid={!!errors.times}
          />
        </Field>
        <Field label="Time zone" error={errors.timeZone?.message}>
          <input {...register('timeZone')} aria-invalid={!!errors.timeZone} />
        </Field>
      </div>
      <Field
        label="Weekdays"
        error={errors.weekdays?.message}
        hint="1 = Monday through 7 = Sunday. Separate with commas."
      >
        <input
          defaultValue={medication?.weekdays.join(', ') || '1, 2, 3, 4, 5, 6, 7'}
          {...register('weekdays', {
            setValueAs: (value) =>
              typeof value === 'string' ? value.split(',').map(Number) : value,
          })}
        />
      </Field>
      <div className="form-grid">
        <Field label="Start date" error={errors.startDate?.message}>
          <input type="date" {...register('startDate')} />
        </Field>
        <Field label="End date (optional)" error={errors.endDate?.message}>
          <input type="date" {...register('endDate', { setValueAs: (value) => value || null })} />
        </Field>
        <Field label="Prescribing clinician (optional)">
          <input {...register('doctor')} />
        </Field>
        <Field label="Schedule status">
          <select {...register('status')}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
      </div>
      <Field label="Special instructions (optional)">
        <textarea {...register('specialInstructions')} rows={2} />
      </Field>
      <p className="muted">
        Enter the instructions supplied by a clinician. CareCircle does not recommend doses.
        Schedule changes apply to future doses; previous records are preserved.
      </p>
      {action.feedback}
      <Button disabled={action.pending}>
        {onDraft
          ? 'Use in comparison'
          : action.pending
            ? 'Saving schedule…'
            : medication
              ? 'Save medication changes'
              : 'Add medication'}
      </Button>
    </form>
  );
}
