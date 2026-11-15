import { Localized } from '../../i18n/Localized';
import { useEffect, useState } from 'react';
import { useCircle } from '../../app/CircleContext';
import { useLive } from '../../hooks/useLive';
import { command, errorMessage } from '../../lib/firebase';
import type { Dose } from '@carecircle/shared';
import { Button, Notice, PageHeading, formatDate } from '../../components/ui';
interface Metric {
  eligible: number;
  taken: number;
  skipped: number;
  unconfirmed: number;
  rate: number | null;
}
interface Report {
  week: Metric;
  month: Metric;
  days: (Metric & { date: string })[];
  asOf: number;
  unresolved: number | null;
  upcoming: number | null;
  responseSample: number;
  averageResponseMinutes: number | null;
}
export default function Insights() {
  const { circleId, can } = useCircle();
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const access = can('adherence.read');
  const latest = useLive<Dose>(
    can('medication.read') ? `careCircles/${circleId}/doseOccurrences` : null,
    ['confirmedAt', 'desc'],
    [],
    1,
  );
  const signature = latest.data.map((d) => `${d.id}:${d.version}`).join();
  useEffect(() => {
    if (!access) return;
    let active = true;
    const timer = setTimeout(() => {
      void command({ action: 'insights', circleId })
        .then((data) => {
          if (active) {
            setReport(data as unknown as Report);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [circleId, signature, revision, access]);
  if (!can('adherence.read')) return <Notice>Care insights have not been shared with you.</Notice>;
  return (
    <>
      <PageHeading
        title="Small steps, seen clearly"
        action={
          <Button variant="secondary" onClick={() => setRevision((v) => v + 1)}>
            Refresh report
          </Button>
        }
      >
        Understand recorded care activity without assumptions.
      </PageHeading>
      {error && <Notice error>{error}</Notice>}
      {report ? (
        <>
          <div className="insight-stats">
            {[report.week, report.month].map((metric, index) => (
              <article className="panel" key={index}>
                <p className="eyebrow">PAST {index === 0 ? '7' : '30'} DAYS</p>
                <strong className="metric-value">
                  {metric.rate === null ? '—' : `${metric.rate}%`}
                </strong>
                <h2>Taken confirmation rate</h2>
                <p>
                  {metric.taken} taken · {metric.skipped} skipped · {metric.unconfirmed} unconfirmed
                  · {metric.eligible} eligible scheduled doses
                </p>
              </article>
            ))}
          </div>
          <section className="panel">
            <h2>Your circle’s follow-up</h2>
            <p>
              {report.upcoming === null
                ? 'Appointment totals are not shared.'
                : `${report.upcoming} upcoming appointments.`}{' '}
              {report.unresolved === null
                ? 'Alert totals are not shared.'
                : `${report.unresolved} unresolved care alerts.`}
            </p>
            <p>
              {report.averageResponseMinutes === null
                ? 'No acknowledged alerts in the available sample.'
                : `Average caregiver acknowledgement: ${report.averageResponseMinutes} minutes, across the latest ${report.responseSample} acknowledged alerts (maximum 100).`}
            </p>
          </section>
          <section className="panel">
            <h2>A week of care</h2>
            <div
              className="bar-chart"
              role="img"
              aria-label="Daily taken confirmation rates. Exact values are in the table below."
            >
              {report.days.map((day) => (
                <div className="bar-column" key={day.date}>
                  <span>{day.rate === null ? '—' : `${day.rate}%`}</span>
                  <div className="bar-track">
                    <div style={{ height: `${day.rate || 0}%` }} />
                  </div>
                  <span>{day.date.slice(5)}</span>
                </div>
              ))}
            </div>
            <div className="table-scroll">
              <table>
                <caption>Daily confirmation totals</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">
                      <Localized value={'Taken'} />
                    </th>
                    <th scope="col">
                      <Localized value={'Skipped'} />
                    </th>
                    <th scope="col">Eligible</th>
                    <th scope="col">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {report.days.map((day) => (
                    <tr key={day.date}>
                      <th scope="row">{day.date}</th>
                      <td>{day.taken}</td>
                      <td>{day.skipped}</td>
                      <td>{day.eligible}</td>
                      <td>{day.rate === null ? 'No eligible doses' : `${day.rate}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Taken confirmations divided by scheduled occurrences at or before the report time.
              Future and cancelled doses are excluded. Skipped and unconfirmed doses remain in the
              denominator. Daily boundaries use the care profile’s time zone. This is a record of
              confirmations, not a clinical assessment.
            </p>
            <small>Updated {formatDate(report.asOf)}</small>
          </section>
        </>
      ) : (
        <p role="status">Calculating your care insights…</p>
      )}
    </>
  );
}
