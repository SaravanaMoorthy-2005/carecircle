import { createContext, useContext, useState, type ReactNode } from 'react';
import { allowed, type Circle, type Member, type Permission } from '@carecircle/shared';
import { useAuth } from './AuthContext';
import { useDocument, useLive } from '../hooks/useLive';
interface CircleState {
  circle: Circle | null;
  member: Member | null;
  memberships: Member[];
  circleId: string;
  select: (id: string) => void;
  can: (permission: Permission) => boolean;
  loading: boolean;
  error: string;
}
const CircleContext = createContext<CircleState>({
  circle: null,
  member: null,
  memberships: [],
  circleId: '',
  select: () => {},
  can: () => false,
  loading: true,
  error: '',
});
export function CircleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState(sessionStorage.getItem('carecircle.active') || '');
  const list = useLive<Member>(
    user?.emailVerified ? `users/${user.uid}/circles` : null,
    undefined,
    [],
    100,
  );
  const active = list.data.filter((member) => member.status === 'active');
  const circleId =
    active.find((member) => member.circleId === selected)?.circleId || active[0]?.circleId || '';
  const membership = useDocument<Member>(
    circleId && user ? `careCircles/${circleId}/members/${user.uid}` : null,
  );
  const member = membership.data?.status === 'active' ? membership.data : null;
  const profile = useDocument<Circle>(member ? `careCircles/${circleId}` : null);
  const select = (id: string) => {
    sessionStorage.setItem('carecircle.active', id);
    setSelected(id);
  };
  return (
    <CircleContext.Provider
      value={{
        circle: member ? profile.data : null,
        member,
        memberships: active,
        circleId: member ? circleId : '',
        select,
        can: (permission) => allowed(member ?? undefined, permission),
        loading: list.loading || membership.loading || profile.loading,
        error: list.error || membership.error || profile.error,
      }}
    >
      {children}
    </CircleContext.Provider>
  );
}
export const useCircle = () => useContext(CircleContext);
