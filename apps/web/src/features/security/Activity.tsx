import type { Audit } from '@carecircle/shared';
import { useCircle } from '../../app/CircleContext';
import { useLive } from '../../hooks/useLive';
import { Empty, Notice, PageHeading, formatDate } from '../../components/ui';
export default function Activity() {
  const { circleId, can } = useCircle();
  const records = useLive<Audit>(
    can('audit.read') ? `careCircles/${circleId}/auditLogs` : null,
    ['createdAt', 'desc'],
    [],
    100,
  );
  return (
    <>
      <PageHeading title="A clear record of care">
        Recent actions, recorded by the backend with actor identity and time.
      </PageHeading>
      {!can('audit.read') ? (
        <Notice>Security activity has not been shared with you.</Notice>
      ) : (
        <section className="panel">
          {records.error && <Notice error>{records.error}</Notice>}
          {records.data.length ? (
            <ol className="timeline">
              {records.data.map((record) => (
                <li key={record.id}>
                  <span className="timeline-dot" />
                  <div>
                    <h2>
                      {record.action.replaceAll('.', ' ').replace(/([a-z])([A-Z])/g, '$1 $2')}
                    </h2>
                    <p>{formatDate(record.createdAt)}</p>
                    <small>
                      Actor: {record.actorId} · Record: {record.resourceId}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <Empty title="The story of your circle starts here">
              Important care and access changes will appear in this timeline.
            </Empty>
          )}
          <p className="muted">
            Showing the latest 100 events. Records are append-only through the application; database
            administrators retain administrative access.
          </p>
        </section>
      )}
    </>
  );
}
