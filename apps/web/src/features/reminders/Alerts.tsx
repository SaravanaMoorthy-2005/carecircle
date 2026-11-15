import type { CareAlert } from '@carecircle/shared';
import { useCircle } from '../../app/CircleContext';
import { useLive } from '../../hooks/useLive';
import { Empty, Notice, PageHeading, formatDate } from '../../components/ui';
import { AlertCards } from '../assistance/Assistance';
import { useAuth } from '../../app/AuthContext';
export default function Alerts() {
  const { circleId, can } = useCircle(),
    { user } = useAuth();
  const alerts = useLive<CareAlert>(
    can('alert.read') ? `careCircles/${circleId}/alerts` : null,
    ['createdAt', 'desc'],
    [],
    100,
  );
  const notifications = useLive<{
    id: string;
    message: string;
    createdAt: number;
    delivery: string;
  }>(
    user ? `users/${user.uid}/notifications` : null,
    ['createdAt', 'desc'],
    [['circleId', '==', circleId]],
    50,
  );
  return (
    <>
      <PageHeading title="The right nudge, at the right time">
        Care alerts and private updates from your circle.
      </PageHeading>
      {alerts.error && <Notice error>{alerts.error}</Notice>}
      {alerts.data.length ? (
        <AlertCards records={alerts.data} collection="alerts" />
      ) : (
        <Empty title="No care alerts to show">
          Unconfirmed care actions can trigger a check-in for authorized caregivers.
        </Empty>
      )}
      <section className="panel">
        <h2>Your notifications</h2>
        {notifications.error && <Notice error>{notifications.error}</Notice>}
        {notifications.data.length ? (
          notifications.data.map((notification) => (
            <article className="notification-row" key={notification.id}>
              <p>{notification.message}</p>
              <small>
                {formatDate(notification.createdAt)} ·{' '}
                {notification.delivery === 'accepted'
                  ? 'Email accepted by provider'
                  : notification.delivery}
              </small>
            </article>
          ))
        ) : (
          <p className="muted">No notifications for this care circle.</p>
        )}
      </section>
    </>
  );
}
