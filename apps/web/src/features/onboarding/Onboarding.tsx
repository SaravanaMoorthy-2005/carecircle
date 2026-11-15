import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { profileSchema, type Profile } from '@carecircle/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { command } from '../../lib/firebase';
import { Button, Field, PageHeading, useAction } from '../../components/ui';
export function ProfileForm({
  initial,
  onSave,
}: {
  initial?: Profile;
  onSave: (profile: Profile) => Promise<unknown>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof profileSchema>, unknown, Profile>({
    resolver: zodResolver(profileSchema),
    defaultValues: initial
      ? profileSchema.strip().parse(initial)
      : {
          displayName: '',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: 'en',
          emergencyContact: '',
          largeText: false,
          highContrast: false,
        },
  });
  const action = useAction();
  return (
    <form onSubmit={handleSubmit((data) => action.run(() => onSave(data)))}>
      <div className="form-grid">
        <Field label="Profile name" error={errors.displayName?.message}>
          <input
            {...register('displayName')}
            autoComplete="name"
            aria-invalid={!!errors.displayName}
          />
        </Field>
        <Field
          label="Time zone"
          error={errors.timeZone?.message}
          hint="For example: Asia/Kolkata or Europe/London"
        >
          <input {...register('timeZone')} aria-invalid={!!errors.timeZone} />
        </Field>
        <Field label="Preferred language">
          <select {...register('language')}>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="ta">Tamil</option>
          </select>
        </Field>
        <Field label="Emergency contact (optional)">
          <input {...register('emergencyContact')} maxLength={160} />
        </Field>
      </div>
      <p className="muted">
        The interface is currently in English. Your language preference is shared with your care
        team.
      </p>
      <label className="checkbox">
        <input type="checkbox" {...register('largeText')} /> Use larger text
      </label>
      <label className="checkbox">
        <input type="checkbox" {...register('highContrast')} /> Use higher contrast
      </label>
      <label className="checkbox">
        <input type="checkbox" {...register('consent')} /> I agree to store this care profile and
        choose who can access it.
      </label>
      {errors.consent && (
        <p role="alert" className="field-error">
          Please confirm your consent to continue.
        </p>
      )}
      {action.feedback}
      <Button disabled={action.pending}>{action.pending ? 'Saving…' : 'Save care profile'}</Button>
    </form>
  );
}
export default function Onboarding() {
  const { user } = useAuth();
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <div className="narrow-page">
      <PageHeading eyebrow="LET’S MAKE CARE FEEL SIMPLER" title="Create your care circle">
        Start with a profile. You decide who joins and what they can do.
      </PageHeading>
      <section className="panel">
        <ProfileForm
          initial={undefined}
          onSave={async (profile) => {
            await command({
              action: 'createCircle',
              profile: {
                ...profile,
                displayName: profile.displayName || user?.displayName || 'My care',
              },
              requestId,
            });
          }}
        />
      </section>
      <p className="centered">
        Already invited? <Link to="/join">Join an existing care circle</Link>
      </p>
    </div>
  );
}
