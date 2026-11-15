import { Localized } from '../i18n/Localized';
import { useEffect, useState } from 'react';
import { NavLink, Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  HeartHandshake,
  LogOut,
  Menu,
  Settings,
  Bell,
  LockKeyhole,
  ArrowUpRight,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import { sendEmailVerification } from 'firebase/auth';
import { useAuth, logout } from './AuthContext';
import { useCircle } from './CircleContext';
import { Button, Logo, Modal, Notice, useAction } from '../components/ui';
import Onboarding from '../features/onboarding/Onboarding';
import { emulator } from '../lib/firebase';
import { navigationFor, routeAllowed } from './navigation';
import { LanguagePicker, useLocale } from '../i18n/LocaleContext';
export default function Shell() {
  const { user, loading } = useAuth(),
    {
      circle,
      circleId,
      member,
      memberships,
      select,
      loading: circleLoading,
      error,
      can,
    } = useCircle(),
    { t } = useLocale();
  const location = useLocation(),
    [menu, setMenu] = useState(false),
    action = useAction();
  useEffect(() => {
    setMenu(false);
    document.getElementById('main-content')?.focus();
  }, [location.pathname]);
  const navigation = navigationFor(member?.role || 'owner').filter((item) =>
    routeAllowed(item.path, can),
  );
  const roleName =
    member?.role === 'owner'
      ? 'Elder'
      : member?.role === 'caregiver'
        ? 'Caregiver'
        : 'Family member';
  const links = (
    <>
      {navigation.map(({ path, label, icon: Icon }) => (
        <NavLink to={path} key={path} onClick={() => setMenu(false)}>
          <Icon size={21} strokeWidth={1.7} />
          <span>{t(label)}</span>
        </NavLink>
      ))}
    </>
  );
  if (loading)
    return (
      <main className="loading-screen" role="status">
        {t('Please wait…')}
      </main>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified)
    return (
      <main className="verification-screen">
        <Logo />
        <section className="panel">
          <span className="section-chip">
            <ShieldCheck size={16} /> ONE LAST STEP
          </span>
          <h1>One more step: verify your email</h1>
          <p>Open the verification email sent to {user.email}, then return here.</p>
          {action.feedback}
          <div className="inline-actions">
            <Button
              disabled={action.pending}
              onClick={() =>
                void action.run(async () => {
                  await user.reload();
                  await user.getIdToken(true);
                }, 'Email status refreshed.')
              }
            >
              I’ve verified my email
            </Button>
            <Button
              variant="secondary"
              disabled={action.pending}
              onClick={() =>
                void action.run(() => sendEmailVerification(user), 'Verification email sent.')
              }
            >
              Resend email
            </Button>
            <Button variant="ghost" onClick={() => void logout()}>
              <Localized value={'Sign out'} />
            </Button>
          </div>
        </section>
      </main>
    );
  return (
    <div className={'app-shell workspace-' + (member?.role || 'owner')}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <aside className="sidebar" aria-label="Care navigation">
        <Link to="/dashboard" className="brand-link">
          <Logo />
        </Link>
        <div className="sidebar-label">{t(roleName).toUpperCase()} WORKSPACE</div>
        <nav aria-label="Main navigation">{links}</nav>
        <div className="sidebar-bottom">
          <div className="sidebar-support">
            <HeartHandshake size={25} strokeWidth={1.5} />
            <strong>{t('Care feels better together.')}</strong>
            <Link to={can('members.read') ? '/members' : '/assistance'}>
              {t(can('members.read') ? 'View care circle' : 'Contact caregiver')}{' '}
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="sidebar-profile">
            <span className="avatar">{(user.displayName || user.email || 'C').slice(0, 1)}</span>
            <div>
              <strong>{user.displayName || 'Your account'}</strong>
              <small>{t(roleName)}</small>
            </div>
            <Link className="button button-ghost" to="/more" aria-label={t('More')}>
              <Settings size={19} />
            </Link>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <Button
            variant="ghost"
            className="mobile-menu"
            aria-label={t('Open navigation')}
            aria-expanded={menu}
            onClick={() => setMenu(true)}
          >
            <Menu />
          </Button>
          <div className="circle-selector">
            <span className="avatar small">{circle?.displayName.slice(0, 1) || 'C'}</span>
            <label className="sr-only" htmlFor="active-circle">
              Active care profile
            </label>
            <select
              id="active-circle"
              value={circleId}
              onChange={(e) => select(e.target.value)}
              disabled={!memberships.length}
            >
              {!memberships.length && (
                <option value="">
                  <Localized value={'Your care circle'} />
                </option>
              )}
              {memberships.map((m) => (
                <option key={m.circleId} value={m.circleId}>
                  {m.circleId === circleId && circle
                    ? circle.displayName
                    : 'Care circle ' + m.circleId.slice(0, 6)}{' '}
                  ·{' '}
                  {t(
                    m.role === 'owner'
                      ? 'Elder'
                      : m.role === 'caregiver'
                        ? 'Caregiver'
                        : 'Family member',
                  )}
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </div>
          <div className="topbar-right">
            <LanguagePicker />
            {can('alert.read') && (
              <Link
                className="button button-ghost desktop-only"
                to="/alerts"
                aria-label={t('Notifications')}
              >
                <Bell size={20} />
              </Link>
            )}
            <Link to="/assistance" className="button button-help">
              <HeartHandshake size={18} />
              <span>{t('Need Help')}</span>
            </Link>
            <Button
              variant="ghost"
              aria-label={t('Sign out')}
              onClick={() => void action.run(logout, 'Signed out.')}
            >
              <LogOut size={19} />
            </Button>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          key={user.uid + ':' + circleId + ':' + member?.role + ':' + member?.permissions.join(',')}
          className="main-content"
        >
          {action.error && <Notice error>{action.error}</Notice>}
          {error && <Notice error>{error}</Notice>}
          {circleLoading ? (
            <div className="skeleton-grid" role="status" aria-label="Loading care circle">
              <div className="loading-skeleton" />
              <div className="loading-skeleton" />
            </div>
          ) : !circleId && !['/join', '/settings'].includes(location.pathname) ? (
            <Onboarding />
          ) : !routeAllowed(location.pathname, can) ? (
            <section className="panel permission-denied">
              <LockKeyhole size={36} />
              <h1>This view isn’t in your care access</h1>
              <p>
                Your role protects private information and sensitive changes. Ask the circle owner
                if you need access for your responsibilities.
              </p>
              <Link to="/dashboard" className="button button-primary">
                Back to your overview
              </Link>
            </section>
          ) : (
            <Outlet />
          )}
        </main>
        <footer className="app-footer">
          <span>CareCircle · Connected Care. Confident Living.</span>
          <span>
            {emulator
              ? 'Local preview · fictional data only'
              : 'Your care. Your consent. Your circle.'}
          </span>
        </footer>
      </div>
      {circleId && (
        <nav className="bottom-navigation" aria-label="Mobile navigation">
          {links}
        </nav>
      )}
      <Modal
        open={menu}
        onClose={() => setMenu(false)}
        title="Your care space"
        description="Choose a care view."
      >
        {memberships.length > 1 && (
          <label className="field">
            <span>Active care profile</span>
            <select
              value={circleId}
              onChange={(e) => {
                select(e.target.value);
                setMenu(false);
              }}
            >
              {memberships.map((m) => (
                <option key={m.circleId} value={m.circleId}>
                  {m.circleId === circleId && circle
                    ? circle.displayName
                    : 'Care circle ' + m.circleId.slice(0, 6)}{' '}
                  ·{' '}
                  {t(
                    m.role === 'owner'
                      ? 'Elder'
                      : m.role === 'caregiver'
                        ? 'Caregiver'
                        : 'Family member',
                  )}
                </option>
              ))}
            </select>
          </label>
        )}
        <nav className="mobile-nav-list" aria-label="Expanded navigation">
          {links}
          <NavLink to="/more" onClick={() => setMenu(false)}>
            <Settings size={20} />
            {t('More')}
          </NavLink>
          <NavLink to="/join" onClick={() => setMenu(false)}>
            {t('Join a circle')}
          </NavLink>
        </nav>
      </Modal>
    </div>
  );
}
