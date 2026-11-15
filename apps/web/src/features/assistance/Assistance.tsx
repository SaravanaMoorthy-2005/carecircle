import { useState } from 'react';
import { HeartHandshake, Pill, CalendarDays, Phone, MessageCircle } from 'lucide-react';
import type { CareAlert, Command } from '@carecircle/shared';
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
export function AlertCards({
  records,
  collection,
}: {
  records: CareAlert[];
  collection: 'alerts' | 'assistanceRequests';
}) {
  const { circleId, can } = useCircle();
  const action = useAction();
  const [resolving, setResolving] = useState<CareAlert | null>(null),
    [outcome, setOutcome] = useState('');
  const permission = collection === 'alerts' ? 'alert.acknowledge' : 'assistance.respond';
  return (
    <>
      {action.feedback}
      <div className="alert-list">
        {records.map((record) => (
          <article className="panel alert-card" key={record.id}>
            <div className="card-top">
              <span className="icon-tile">
                <HeartHandshake size={23} />
              </span>
              <Status value={record.state} />
            </div>
            <h2>{record.category}</h2>
            <p>Priority: {record.priority}</p>
            {!!record.assignedCaregivers?.length && (
              <p>
                Assigned care team:{' '}
                {record.assignedCaregivers.map((person) => person.displayName).join(', ')}
              </p>
            )}
            <p>Requested {formatDate(record.createdAt)}</p>
            {record.acknowledgedAt && <p>Acknowledged {formatDate(record.acknowledgedAt)}</p>}
            {record.outcome && <p className="outcome">Outcome: {record.outcome}</p>}
            {can(permission) && record.state !== 'resolved' && (
              <div className="card-actions">
                {record.state !== 'acknowledged' ? (
                  <Button
                    disabled={action.pending}
                    onClick={() =>
                      void action.run(
                        () =>
                          command({
                            action: 'alert',
                            circleId,
                            resourceId: record.id,
                            collection,
                            version: record.version,
                            state: 'acknowledged',
                            outcome: '',
                          }),
                        'Acknowledgement recorded.',
                      )
                    }
                  >
                    I’ll follow up
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      setResolving(record);
                      setOutcome('');
                    }}
                  >
                    Record outcome
                  </Button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      <Modal
        open={!!resolving}
        onClose={() => setResolving(null)}
        title="Record the follow-up outcome"
        description="Describe the action taken. Recording an outcome does not verify someone’s physical safety."
      >
        <Field label="Outcome">
          <textarea
            rows={4}
            required
            minLength={5}
            maxLength={500}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
          />
        </Field>
        {action.feedback}
        <Button
          disabled={action.pending || outcome.trim().length < 5}
          onClick={() => {
            if (resolving)
              void action
                .run(() =>
                  command({
                    action: 'alert',
                    circleId,
                    resourceId: resolving.id,
                    collection,
                    version: resolving.version,
                    state: 'resolved',
                    outcome,
                  }),
                )
                .then((ok) => {
                  if (ok) setResolving(null);
                });
          }}
        >
          Resolve request
        </Button>
      </Modal>
    </>
  );
}
export default function Assistance() {
  const { circleId } = useCircle();
  const records = useLive<CareAlert>(
    `careCircles/${circleId}/assistanceRequests`,
    ['createdAt', 'desc'],
    [],
    100,
  );
  const action = useAction();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const categories = [
    ['Medication assistance', Pill],
    ['Appointment assistance', CalendarDays],
    ['Contact caregiver', Phone],
    ['Other assistance', MessageCircle],
  ] as const;
  return (
    <>
      <PageHeading title="A helping hand, when you need it">
        Send a request to authorized members of your care circle.
      </PageHeading>
      <Notice>
        This is not an emergency response service. For urgent danger, contact your local emergency
        service directly. Sending a request does not mean a caregiver has seen it or responded.
      </Notice>
      <section className="panel">
        <h2>What can your circle help with?</h2>
        <div className="help-options">
          {categories.map(([category, Icon]) => (
            <Button
              key={category}
              variant="secondary"
              disabled={action.pending}
              onClick={() =>
                void action
                  .run(
                    () =>
                      command({
                        action: 'help',
                        circleId,
                        requestId,
                        category: category as Extract<Command, { action: 'help' }>['category'],
                      }),
                    'Your assistance request was recorded. Awaiting a caregiver response.',
                  )
                  .then((ok) => {
                    if (ok) setRequestId(crypto.randomUUID());
                  })
              }
            >
              <Icon size={25} />
              {category}
            </Button>
          ))}
        </div>
        {action.feedback}
      </section>
      <h2>Request history</h2>
      {records.error && <Notice error>{records.error}</Notice>}
      {records.data.length ? (
        <AlertCards records={records.data} collection="assistanceRequests" />
      ) : (
        <Empty title="No assistance requests yet">
          Your requests and your care team’s responses will appear here.
        </Empty>
      )}
    </>
  );
}
