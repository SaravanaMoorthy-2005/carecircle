import { Localized } from '../../i18n/Localized';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Temporal } from '@js-temporal/polyfill';
import { Plus, UserRound, Clock3, Pencil, CalendarClock } from 'lucide-react';
import {
  allowed,
  scheduledInstant,
  taskStatus,
  taskTransitionAllowed,
  type CareTask,
  type CareTaskInput,
  type CareDirectoryMember,
  type Medication,
  type RecordWithId,
} from '@carecircle/shared';
import { useCircle } from '../../app/CircleContext';
import { useAuth } from '../../app/AuthContext';
import { useLive } from '../../hooks/useLive';
import { command } from '../../lib/firebase';
import { AccessibleTabs } from '../../components/care-ui';
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
export const localInput = (at: number, zone: string) =>
  Temporal.Instant.fromEpochMilliseconds(at)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString()
    .slice(0, 16);
export const inputInstant = (value: string, zone: string) =>
  scheduledInstant(value.slice(0, 10), value.slice(11, 16), zone);
export function CareTaskCard({
  task,
  onEdit,
}: {
  task: CareTask;
  onEdit?: (task: CareTask) => void;
}) {
  const { circleId, circle, can } = useCircle(),
    { user } = useAuth(),
    action = useAction(),
    now = useNow();
  const [transition, setTransition] = useState<
      'accepted' | 'declined' | 'in_progress' | 'completed' | null
    >(null),
    [outcome, setOutcome] = useState('');
  const permitted = can('task.act') && (task.assignedTo === user?.uid || can('task.manage'));
  return (
    <article className="care-task">
      <div className="task-heading">
        <span className="section-chip">{task.category}</span>
        <Status value={taskStatus(task, now)} />
      </div>
      <h2>{task.title}</h2>
      <p>{task.detail}</p>
      <div className="task-metadata">
        <span>
          <UserRound size={16} />
          {task.assignedName || 'Unassigned'}
        </span>
        <span>
          <Clock3 size={16} />
          {formatDate(task.dueAt, circle?.timeZone)}
        </span>
      </div>
      {task.coverageStart && task.coverageEnd && (
        <p>
          <CalendarClock size={17} />
          {formatDate(task.coverageStart, circle?.timeZone)} –{' '}
          {formatDate(task.coverageEnd, circle?.timeZone)}
        </p>
      )}
      {task.outcome && <p className="outcome">{task.outcome}</p>}
      {task.category === 'refill' && (
        <small>
          Completing this task does not change stock. A care manager records the restock separately.
        </small>
      )}
      <div className="inline-actions" style={{ marginTop: 16 }}>
        {onEdit && task.state !== 'completed' && (
          <Button variant="ghost" onClick={() => onEdit(task)} aria-label={'Edit ' + task.title}>
            <Pencil size={17} />
            <Localized value={'Edit'} />
          </Button>
        )}
        {permitted &&
          task.assignedTo &&
          (['accepted', 'in_progress', 'completed', 'declined'] as const)
            .filter((state) => taskTransitionAllowed(task.state, state))
            .map((state) => (
              <Button
                key={state}
                variant={state === 'declined' ? 'ghost' : 'primary'}
                disabled={action.pending}
                onClick={() => {
                  setTransition(state);
                  setOutcome('');
                }}
              >
                {
                  {
                    accepted: 'Accept',
                    in_progress: 'Start task',
                    completed: 'Complete',
                    declined: 'Decline',
                  }[state]
                }
              </Button>
            ))}
      </div>
      {action.feedback}
      <Modal
        open={!!transition}
        onClose={() => setTransition(null)}
        title={
          transition === 'completed'
            ? 'Complete responsibility'
            : transition === 'declined'
              ? 'Decline responsibility'
              : 'Confirm responsibility'
        }
        description="Your care circle will see this status update."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!transition) return;
            void action
              .run(() =>
                command({
                  action: 'taskTransition',
                  circleId,
                  resourceId: task.id,
                  version: task.version,
                  state: transition,
                  outcome,
                }),
              )
              .then((ok) => {
                if (ok) setTransition(null);
              });
          }}
        >
          <p>
            <strong>{task.title}</strong>
          </p>
          {['completed', 'declined'].includes(transition || '') && (
            <Field label="Outcome or reason">
              <textarea
                required
                minLength={3}
                maxLength={500}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              />
            </Field>
          )}
          {action.feedback}
          <Button disabled={action.pending}>
            <Localized value={'Confirm update'} />
          </Button>
        </form>
      </Modal>
    </article>
  );
}
export default function Tasks() {
  const { circleId, circle, can } = useCircle(),
    { t } = useLocale(),
    prefix = 'careCircles/' + circleId + '/',
    zone = circle?.timeZone || 'UTC',
    action = useAction();
  const [tab, setTab] = useState('open');
  const tasks = useLive<CareTask>(
      can('task.read') ? prefix + 'careAssignments' : null,
      ['dueAt', 'asc'],
      [
        [
          'state',
          'in',
          tab === 'history' ? ['completed', 'declined'] : ['pending', 'accepted', 'in_progress'],
        ],
      ],
      100,
    ),
    people = useLive<CareDirectoryMember>(
      can('members.read') ? prefix + 'directory' : null,
      undefined,
      [],
      20,
    ),
    meds = useLive<RecordWithId<Medication>>(
      can('task.manage') && can('medication.read') ? prefix + 'medications' : null,
      undefined,
      [],
      100,
    );
  const [editing, setEditing] = useState<CareTask | null | undefined>(undefined),
    [title, setTitle] = useState(''),
    [category, setCategory] = useState<CareTaskInput['category']>('general'),
    [detail, setDetail] = useState(''),
    [assignedTo, setAssignedTo] = useState(''),
    [due, setDue] = useState(''),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [related, setRelated] = useState('');
  const appointments = useLive<{ id: string; clinician: string; localDate: string }>(
    can('task.manage') && can('appointment.read') ? prefix + 'appointments' : null,
    ['scheduledAt', 'desc'],
    [],
    100,
  );
  const edit = (task: CareTask | null) => {
    setEditing(task);
    setTitle(task?.title || '');
    setCategory(task?.category || 'general');
    setDetail(task?.detail || '');
    setAssignedTo(task?.assignedTo || '');
    setDue(localInput(task?.dueAt || Date.now() + 86400000, zone));
    setStart(task?.coverageStart ? localInput(task.coverageStart, zone) : '');
    setEnd(task?.coverageEnd ? localInput(task.coverageEnd, zone) : '');
    setRelated(task?.relatedId || '');
  };
  const visible = tasks.data.filter((task) =>
    tab === 'history'
      ? ['completed', 'declined'].includes(task.state)
      : !['completed', 'declined'].includes(task.state),
  );
  return (
    <>
      <PageHeading
        eyebrow="CARESHIFT"
        title={t('Responsibilities')}
        action={
          can('task.manage') && (
            <Button onClick={() => edit(null)}>
              <Plus size={19} />
              <Localized value={'Add responsibility'} />
            </Button>
          )
        }
      >
        Everyone knows the next step, and who is taking it.
      </PageHeading>
      <div className="context-links">
        <Link to="/handoff">{t('Care Handoff')}</Link>
        {can('inventory.read') && <Link to="/inventory">{t('Refill Guardian')}</Link>}
      </div>
      <AccessibleTabs
        items={[
          { id: 'open', label: 'Open responsibilities' },
          { id: 'history', label: 'History' },
        ]}
        selected={tab}
        onSelect={setTab}
      />
      {tasks.error && <Notice error>{tasks.error}</Notice>}
      {action.feedback}
      <div className="task-board">
        {visible.map((task) => (
          <CareTaskCard key={task.id} task={task} onEdit={can('task.manage') ? edit : undefined} />
        ))}
      </div>
      {!visible.length && (
        <Empty title="A clear handoff starts here">
          Shared responsibilities will appear here when someone assigns a care task.
        </Empty>
      )}
      <Modal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? 'Edit responsibility' : 'Add responsibility'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action
              .run(() =>
                command({
                  action: 'saveTask',
                  circleId,
                  resourceId: editing?.id || crypto.randomUUID(),
                  version: editing?.version || 0,
                  task: {
                    title,
                    category,
                    detail,
                    assignedTo: assignedTo || null,
                    dueAt: inputInstant(due, zone),
                    coverageStart: category === 'coverage' ? inputInstant(start, zone) : null,
                    coverageEnd: category === 'coverage' ? inputInstant(end, zone) : null,
                    relatedId: related || null,
                  },
                }),
              )
              .then((ok) => {
                if (ok) setEditing(undefined);
              });
          }}
        >
          <Field label="Title">
            <input
              required
              minLength={3}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as CareTaskInput['category']);
                  setRelated('');
                }}
              >
                {['general', 'medication', 'appointment', 'refill', 'coverage'].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assigned to">
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">{t('Unassigned')}</option>
                {people.data
                  .filter((p) => allowed(p, 'task.act'))
                  .map((p) => (
                    <option value={p.uid} key={p.uid}>
                      {p.displayName} · {p.role}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <Field label="Details">
            <textarea value={detail} maxLength={1000} onChange={(e) => setDetail(e.target.value)} />
          </Field>
          {['refill', 'medication'].includes(category) && (
            <Field label="Related medication">
              <select value={related} onChange={(e) => setRelated(e.target.value)}>
                <option value="">No linked medication</option>
                {meds.data.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {category === 'appointment' && (
            <Field label="Related appointment">
              <select value={related} onChange={(e) => setRelated(e.target.value)}>
                <option value="">No linked appointment</option>
                {appointments.data.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.clinician} · {a.localDate}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Due date and time" hint={zone}>
            <input
              type="datetime-local"
              required
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </Field>
          {category === 'coverage' && (
            <div className="form-grid">
              <Field label="Coverage starts">
                <input
                  type="datetime-local"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field label="Coverage ends">
                <input
                  type="datetime-local"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>
            </div>
          )}
          {action.feedback}
          <Button disabled={action.pending}>
            <Localized value={'Save responsibility'} />
          </Button>
        </form>
      </Modal>
    </>
  );
}
