import { Localized } from '../../i18n/Localized';
import { useEffect, useState } from 'react';
import { useCircle } from '../../app/CircleContext';
import { useAuth } from '../../app/AuthContext';
import { command } from '../../lib/firebase';
import { Button, Field, Modal, Notice, useAction } from '../../components/ui';
type Preparation = {
  version: number;
  questions: string;
  notes: string;
  checklist: { id: string; label: string; done: boolean }[];
};
export function AppointmentCompanion({
  appointmentId,
  onClose,
}: {
  appointmentId: string;
  onClose: () => void;
}) {
  const { circleId, can } = useCircle(),
    { user } = useAuth(),
    action = useAction();
  const [data, setData] = useState<Preparation | null>(null),
    [error, setError] = useState(''),
    [item, setItem] = useState(''),
    [followup, setFollowup] = useState('');
  useEffect(() => {
    let live = true;
    void command({ action: 'readCompanion', circleId, appointmentId })
      .then((result) => {
        if (live) setData(result as Preparation);
      })
      .catch(() => {
        if (live) setError('Unable to load appointment preparation. Close and retry.');
      });
    return () => {
      live = false;
    };
  }, [circleId, appointmentId]);
  return (
    <Modal
      open
      onClose={onClose}
      title="Appointment Companion"
      description="Prepare questions, remember essentials and record your visit."
    >
      {error && <Notice error>{error}</Notice>}
      {!data ? (
        <p role="status">Loading preparation…</p>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                const result = await command({
                  action: 'saveCompanion',
                  circleId,
                  appointmentId,
                  ...data,
                });
                setData({ ...data, version: Number(result.version) });
              }, 'Appointment preparation saved.');
            }}
          >
            <Field label="Questions for your clinician">
              <textarea
                rows={3}
                maxLength={2000}
                disabled={!can('appointment.write')}
                value={data.questions}
                onChange={(e) => setData({ ...data, questions: e.target.value })}
              />
            </Field>
            <h3>
              <Localized value={'Preparation checklist'} />
            </h3>
            {data.checklist.map((entry) => (
              <label className="checkbox" key={entry.id}>
                <input
                  type="checkbox"
                  disabled={!can('appointment.write')}
                  checked={entry.done}
                  onChange={(e) =>
                    setData({
                      ...data,
                      checklist: data.checklist.map((c) =>
                        c.id === entry.id ? { ...c, done: e.target.checked } : c,
                      ),
                    })
                  }
                />
                {entry.label}
              </label>
            ))}
            {can('appointment.write') && data.checklist.length < 15 && (
              <div className="inline-actions">
                <Field label="Add checklist item">
                  <input maxLength={120} value={item} onChange={(e) => setItem(e.target.value)} />
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!item.trim()}
                  onClick={() => {
                    setData({
                      ...data,
                      checklist: [
                        ...data.checklist,
                        { id: crypto.randomUUID(), label: item.trim(), done: false },
                      ],
                    });
                    setItem('');
                  }}
                >
                  <Localized value={'Add item'} />
                </Button>
              </div>
            )}
            <Field label="Visit notes">
              <textarea
                rows={4}
                maxLength={2000}
                disabled={!can('appointment.write')}
                value={data.notes}
                onChange={(e) => setData({ ...data, notes: e.target.value })}
              />
            </Field>
            <p className="muted">
              Preparation and visit notes are encrypted and available only to authorized appointment
              viewers.
            </p>
            {can('appointment.write') && (
              <Button disabled={action.pending}>
                <Localized value={'Save preparation'} />
              </Button>
            )}
          </form>
          {can('task.manage') && (
            <section className="companion-followup">
              <h3>After the visit</h3>
              <Field label="Follow-up responsibility">
                <input
                  maxLength={120}
                  value={followup}
                  onChange={(e) => setFollowup(e.target.value)}
                />
              </Field>
              <Button
                variant="secondary"
                disabled={action.pending || followup.trim().length < 3}
                onClick={() =>
                  void action.run(async () => {
                    await command({
                      action: 'saveTask',
                      circleId,
                      resourceId: crypto.randomUUID(),
                      version: 0,
                      task: {
                        title: followup.trim(),
                        detail: 'Follow-up from appointment',
                        category: 'appointment',
                        assignedTo: user!.uid,
                        relatedId: appointmentId,
                        dueAt: Date.now() + 86400000,
                        coverageStart: null,
                        coverageEnd: null,
                      },
                    });
                    setFollowup('');
                  }, 'Follow-up created in CareShift, assigned to you for tomorrow. You can change its schedule there.')
                }
              >
                <Localized value={'Create follow-up task'} />
              </Button>
            </section>
          )}
        </>
      )}
      {action.feedback}
    </Modal>
  );
}
