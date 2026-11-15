import { Localized } from '../../i18n/Localized';
import { CircleNetwork } from './CircleNetwork';
import { permissionLabels } from '../../app/permissionLabels';
import { useNow } from '../medications/DoseList';
import { useState } from 'react';
import { UserPlus, ShieldCheck, Mail, Users, Pencil } from 'lucide-react';
import {
  permissions,
  defaultRolePermissions,
  roleAllows,
  type Permission,
  type Member,
  type InvitationSummary,
} from '@carecircle/shared';
import { useCircle } from '../../app/CircleContext';
import { useAuth } from '../../app/AuthContext';
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
const labels = permissionLabels;
function PermissionPicker({
  value,
  onChange,
  available,
}: {
  value: Permission[];
  onChange: (permissions: Permission[]) => void;
  available: Permission[];
}) {
  return (
    <fieldset className="permission-picker">
      <legend>Choose exactly what they can do</legend>
      {permissions
        .filter((p) => available.includes(p))
        .map((p) => (
          <label className="checkbox" key={p}>
            <input
              type="checkbox"
              checked={value.includes(p)}
              onChange={(event) =>
                onChange(event.target.checked ? [...value, p] : value.filter((v) => v !== p))
              }
            />
            {labels[p]}
          </label>
        ))}
    </fieldset>
  );
}
export default function Members() {
  const { circleId, can, member } = useCircle(),
    { user } = useAuth();
  const records = useLive<Member>(
    can('members.manage') ? `careCircles/${circleId}/members` : null,
    undefined,
    [],
    20,
  );
  const invitations = useLive<InvitationSummary>(
    can('members.manage') ? `careCircles/${circleId}/invitations` : null,
    ['createdAt', 'desc'],
    [],
    30,
  );
  const [inviting, setInviting] = useState(false),
    [editing, setEditing] = useState<Member | null>(null),
    [revoking, setRevoking] = useState<Member | null>(null);
  const [email, setEmail] = useState(''),
    [role, setRole] = useState<'caregiver' | 'family'>('caregiver'),
    [selected, setSelected] = useState<Permission[]>(defaultRolePermissions.caregiver);
  const action = useAction(),
    now = useNow();
  if (!can('members.manage'))
    return (
      <>
        <PageHeading title="Your place in the circle">
          Your access is controlled by the profile owner.
        </PageHeading>
        <CircleNetwork />
        <section className="panel">
          <h2>{member?.displayName}</h2>
          <p>Your role: {member?.role}</p>
          <ul className="permission-list">
            {member?.permissions.map((p) => (
              <li key={p}>
                <ShieldCheck size={17} />
                {labels[p]}
              </li>
            ))}
          </ul>
        </section>
      </>
    );
  return (
    <>
      <PageHeading
        title="Good people. Shared care."
        action={
          <Button
            onClick={() => {
              setEmail('');
              setRole('caregiver');
              setSelected(defaultRolePermissions.caregiver);
              setInviting(true);
            }}
          >
            <UserPlus size={19} />
            <Localized value={'Invite someone'} />
          </Button>
        }
      >
        You choose who joins your circle and exactly what they can access.
      </PageHeading>
      <CircleNetwork />
      <Notice>
        Only the profile owner manages membership. Family roles cannot change clinical schedules or
        privacy settings. Caregiver access is explicitly granted, and sensitive changes require a
        fresh sign-in.
      </Notice>
      {action.feedback}
      {records.error && <Notice error>{records.error}</Notice>}
      <section className="panel">
        <div className="section-title">
          <h2>Care circle members</h2>
          <Users size={21} />
        </div>
        <div className="member-list">
          {records.data.map((person) => (
            <article className="member-row" key={person.uid}>
              <span className="avatar">{person.displayName.slice(0, 1).toUpperCase()}</span>
              <div>
                <h3>
                  {person.displayName}
                  {person.uid === user?.uid ? ' (you)' : ''}
                </h3>
                <p>{person.email}</p>
                <small>
                  {person.role} · {person.permissions.length} permissions
                </small>
              </div>
              <Status value={person.status} />
              {person.role !== 'owner' && person.uid !== user?.uid && (
                <div className="inline-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditing(person);
                      setSelected(person.permissions.filter((p) => roleAllows(person.role, p)));
                    }}
                  >
                    <Pencil size={16} /> Permissions
                  </Button>
                  {person.status === 'active' && (
                    <Button variant="ghost" onClick={() => setRevoking(person)}>
                      Revoke access
                    </Button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Recent invitations</h2>
        {!invitations.data.length ? (
          <Empty title="Care is better with your people">
            Invite a caregiver or family member using a single-use passcode.
          </Empty>
        ) : (
          invitations.data.map((invite) => (
            <article className="invitation-row" key={invite.id}>
              <Mail size={20} />
              <div>
                <strong>{invite.email}</strong>
                <p>
                  {invite.role} · expires {formatDate(invite.expiresAt)}
                </p>
                <small>Invitation ID: {invite.id}</small>
              </div>
              <Status
                value={
                  invite.state === 'pending' && invite.expiresAt < now ? 'expired' : invite.state
                }
              />
              {invite.state === 'pending' && (
                <Button
                  variant="ghost"
                  disabled={action.pending}
                  onClick={() =>
                    void action.run(() =>
                      command({ action: 'revokeInvite', circleId, invitationId: invite.id }),
                    )
                  }
                >
                  Revoke
                </Button>
              )}
            </article>
          ))
        )}
      </section>
      <Modal
        open={inviting}
        onClose={() => setInviting(false)}
        title="Invite someone you trust"
        description="They receive an 8-digit single-use code by email. It expires after 10 minutes."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void action
              .run(
                () =>
                  command({
                    action: 'invite',
                    circleId,
                    invitation: { email, role, permissions: selected },
                  }),
                'The email provider accepted the invitation. This does not confirm delivery.',
              )
              .then((ok) => {
                if (ok) setInviting(false);
              });
          }}
        >
          <Field label="Their email address">
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Their role">
            <select
              value={role}
              onChange={(event) => {
                const next = event.target.value as 'caregiver' | 'family';
                setRole(next);
                setSelected(defaultRolePermissions[next]);
              }}
            >
              <option value="caregiver">
                <Localized value={'Caregiver'} />
              </option>
              <option value="family">
                <Localized value={'Family member'} />
              </option>
            </select>
          </Field>
          <PermissionPicker
            value={selected}
            onChange={setSelected}
            available={permissions.filter((p) => can(p) && roleAllows(role, p))}
          />
          {action.feedback}
          <Button disabled={action.pending}>
            {action.pending ? 'Sending invitation…' : 'Send invitation'}
          </Button>
        </form>
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Update member permissions">
        <PermissionPicker
          value={selected}
          onChange={setSelected}
          available={permissions.filter((p) => can(p) && roleAllows(editing?.role || 'family', p))}
        />
        {action.feedback}
        <Button
          disabled={action.pending}
          onClick={() => {
            if (editing)
              void action
                .run(() =>
                  command({
                    action: 'member',
                    circleId,
                    uid: editing.uid,
                    permissions: selected,
                    status: editing.status,
                  }),
                )
                .then((ok) => {
                  if (ok) setEditing(null);
                });
          }}
        >
          Save permissions
        </Button>
      </Modal>
      <Modal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title="Revoke this person’s access?"
        description="Their protected subscriptions and future care notifications will stop. Records of their previous care actions remain."
      >
        {action.feedback}
        <Button
          variant="danger"
          disabled={action.pending}
          onClick={() => {
            if (revoking)
              void action
                .run(() =>
                  command({
                    action: 'member',
                    circleId,
                    uid: revoking.uid,
                    permissions: [],
                    status: 'revoked',
                  }),
                )
                .then((ok) => {
                  if (ok) setRevoking(null);
                });
          }}
        >
          Revoke access
        </Button>
      </Modal>
    </>
  );
}
