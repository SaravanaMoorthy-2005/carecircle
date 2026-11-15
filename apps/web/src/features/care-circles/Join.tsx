import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { command } from '../../lib/firebase';
import { useCircle } from '../../app/CircleContext';
import { Button, Field, PageHeading, useAction } from '../../components/ui';
export default function Join() {
  const [invitationId, setId] = useState(''),
    [code, setCode] = useState('');
  const action = useAction(),
    navigate = useNavigate(),
    { select } = useCircle();
  return (
    <div className="narrow-page">
      <PageHeading title="A place in their circle">
        Use the invitation sent to your verified email address.
      </PageHeading>
      <section className="panel">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              const result = await command({ action: 'redeem', invitationId, code });
              select(String(result.circleId));
              navigate('/dashboard');
            }, 'You joined the circle.');
          }}
        >
          <Field label="Invitation ID">
            <input
              required
              value={invitationId}
              onChange={(event) => setId(event.target.value.trim())}
              autoComplete="off"
            />
          </Field>
          <Field
            label="8-digit invitation code"
            hint="Codes expire after 10 minutes and can be used once."
          >
            <input
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]{8}"
              maxLength={8}
              autoComplete="one-time-code"
              className="code-input"
            />
          </Field>
          {action.feedback}
          <Button disabled={action.pending}>
            {action.pending ? 'Checking invitation…' : 'Join care circle'}
          </Button>
        </form>
      </section>
    </div>
  );
}
