import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
  type QueryConstraint,
  type DocumentData,
} from 'firebase/firestore';
import type { Dose } from '@carecircle/shared';
import { useCircle } from '../../app/CircleContext';
import { db, errorMessage } from '../../lib/firebase';
import { DoseList } from '../medications/DoseList';
import { Button, Notice, PageHeading } from '../../components/ui';
export default function History() {
  const { circleId, can } = useCircle();
  const [doses, setDoses] = useState<Dose[]>([]),
    [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const access = can('medication.read');
  useEffect(() => {
    if (!access) return;
    let active = true;
    setLoading(true);
    setError('');
    const base: QueryConstraint[] = [
      where('scheduledAt', '<=', Date.now()),
      orderBy('scheduledAt', 'desc'),
      limit(50),
    ];
    if (cursor) base.push(startAfter(cursor));
    const unsubscribe = onSnapshot(
      query(collection(db, `careCircles/${circleId}/doseOccurrences`), ...base),
      (snapshot) => {
        if (active) {
          setDoses(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as Dose));
          setMore(snapshot.size === 50);
          setLoading(false);
        }
      },
      (e) => {
        if (active) {
          setDoses([]);
          setError(errorMessage(e));
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [circleId, access, cursor]);
  if (!access)
    return (
      <Notice>
        Detailed medication history has not been shared with you. Care Insights provides aggregate
        reports when permitted.
      </Notice>
    );
  return (
    <>
      <PageHeading title="Your care history">
        A shared record of scheduled doses and confirmed actions.
      </PageHeading>
      {error && <Notice error>{error}</Notice>}
      <section className="panel">
        {loading ? <p role="status">Loading history…</p> : <DoseList doses={doses} history />}
        <div className="section-toolbar">
          <Button
            variant="secondary"
            disabled={page === 0 || loading}
            onClick={() => {
              setCursor(null);
              setPage(0);
            }}
          >
            Newest records
          </Button>
          <span>Page {page + 1}</span>
          <Button
            variant="secondary"
            disabled={!more || loading}
            onClick={() => {
              const last = doses.at(-1);
              if (!last) return;
              void getDocs(
                query(
                  collection(db, `careCircles/${circleId}/doseOccurrences`),
                  where('__name__', '==', last.id),
                  limit(1),
                ),
              )
                .then((snapshot) => {
                  setCursor(snapshot.docs[0] || null);
                  setPage((p) => p + 1);
                })
                .catch((e) => setError(errorMessage(e)));
            }}
          >
            Older records
          </Button>
        </div>
      </section>
    </>
  );
}
