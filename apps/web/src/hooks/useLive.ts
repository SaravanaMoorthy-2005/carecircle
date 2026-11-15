import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
  type WhereFilterOp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
type Filter = [string, WhereFilterOp, string | number | string[]];
export function useLive<T>(
  path: string | null,
  order?: [string, 'asc' | 'desc'],
  filters: Filter[] = [],
  max = 100,
) {
  const key = JSON.stringify([path, order, filters, max]);
  const [state, setState] = useState<{
    key: string;
    data: T[];
    loading: boolean;
    error: string;
    cached: boolean;
  }>({ key: '', data: [], loading: true, error: '', cached: false });
  useEffect(() => {
    const [resource, sort, conditions, bound] = JSON.parse(key) as [
      string | null,
      [string, 'asc' | 'desc'] | undefined,
      Filter[],
      number,
    ];
    if (!resource) {
      setState({ key, data: [], loading: false, error: '', cached: false });
      return;
    }
    const constraints: QueryConstraint[] = conditions.map(([field, op, value]) =>
      where(field, op, value),
    );
    if (sort) constraints.push(orderBy(...sort));
    const q = query(collection(db, resource), ...constraints, limit(bound));
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) =>
        setState({
          key,
          data: snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as T),
          loading: false,
          error: '',
          cached: snapshot.metadata.fromCache,
        }),
      () =>
        setState({
          key,
          data: [],
          loading: false,
          error: 'Connection or access issue. Reconnect or check your care-circle access.',
          cached: false,
        }),
    );
  }, [key]);
  return state.key === key
    ? state
    : { key, data: [] as T[], loading: !!path, error: '', cached: false };
}
export function useDocument<T>(path: string | null) {
  const [state, setState] = useState<{
    path: string | null;
    data: T | null;
    loading: boolean;
    error: string;
  }>({ path: null, data: null, loading: true, error: '' });
  useEffect(() => {
    if (!path) {
      setState({ path, data: null, loading: false, error: '' });
      return;
    }
    return onSnapshot(
      doc(db, path),
      (snapshot) =>
        setState({
          path,
          data: snapshot.exists() ? ({ ...snapshot.data(), id: snapshot.id } as T) : null,
          loading: false,
          error: '',
        }),
      () =>
        setState({
          path,
          data: null,
          loading: false,
          error: 'This information is unavailable. Your access may have changed.',
        }),
    );
  }, [path]);
  return state.path === path ? state : { path, data: null, loading: !!path, error: '' };
}
