import { Component, Suspense, lazy, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './app/AuthContext';
import { CircleProvider } from './app/CircleContext';
import { LocaleProvider } from './i18n/LocaleContext';
import { Reauthentication } from './app/Reauthentication';
import './styles/app.css';
import '@fontsource-variable/stack-sans-text';
import '@fontsource-variable/stack-sans-headline';
import '@fontsource/noto-sans-tamil/400.css';
import '@fontsource/noto-sans-tamil/600.css';
import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-devanagari/600.css';
import './styles/premium.css';
const Landing = lazy(() => import('./features/Landing'));
const Privacy = lazy(() => import('./features/Privacy'));
const AuthPage = lazy(() => import('./features/authentication/AuthPage'));
const Shell = lazy(() => import('./app/Shell'));
const Dashboard = lazy(() => import('./features/caregiver/Dashboard'));
const Medications = lazy(() => import('./features/medications/Medications'));
const Appointments = lazy(() => import('./features/appointments/Appointments'));
const History = lazy(() => import('./features/adherence/History'));
const Insights = lazy(() => import('./features/analytics/Insights'));
const Members = lazy(() => import('./features/care-circles/Members'));
const Join = lazy(() => import('./features/care-circles/Join'));
const Assistance = lazy(() => import('./features/assistance/Assistance'));
const Alerts = lazy(() => import('./features/reminders/Alerts'));
const Activity = lazy(() => import('./features/security/Activity'));
const Settings = lazy(() => import('./features/settings/Settings'));
const More = lazy(() => import('./features/More'));
const Inventory = lazy(() => import('./features/inventory/Inventory'));
const Tasks = lazy(() => import('./features/tasks/Tasks'));
const Prescriptions = lazy(() => import('./features/prescriptions/Prescriptions'));
const Passport = lazy(() => import('./features/caregiver/Passport'));
const Wellbeing = lazy(() => import('./features/caregiver/Wellbeing'));
const Handoff = lazy(() => import('./features/caregiver/Handoff'));
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="verification-screen">
        <h1>Let’s reconnect.</h1>
        <p>The care space could not be displayed. Reload to reconnect securely.</p>
        <button className="button button-primary" onClick={() => location.reload()}>
          Reload CareCircle
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
document.documentElement.classList.toggle(
  'large-text',
  localStorage.getItem('carecircle.large') === 'true',
);
document.documentElement.classList.toggle(
  'high-contrast',
  localStorage.getItem('carecircle.contrast') === 'true',
);
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <LocaleProvider>
        <AuthProvider>
          <Reauthentication />
          <CircleProvider>
            <Suspense
              fallback={
                <main className="loading-screen" role="status">
                  Opening CareCircle…
                </main>
              }
            >
              <Routes>
                <Route path="/" element={<AuthPage />} />
                <Route path="/welcome" element={<Landing />} />
                <Route path="/privacy" element={<Privacy />} />
                {['login', 'signup', 'reset-password'].map((path) => (
                  <Route path={`/${path}`} element={<AuthPage />} key={path} />
                ))}
                <Route element={<Shell />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/medications" element={<Medications />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/appointments" element={<Appointments />} />
                  <Route path="/insights" element={<Insights />} />
                  <Route path="/members" element={<Members />} />
                  <Route path="/join" element={<Join />} />
                  <Route path="/assistance" element={<Assistance />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/activity" element={<Activity />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/more" element={<More />} />
                  <Route path="/inventory" element={<Inventory />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/prescriptions" element={<Prescriptions />} />
                  <Route path="/passport" element={<Passport />} />
                  <Route path="/wellbeing" element={<Wellbeing />} />
                  <Route path="/handoff" element={<Handoff />} />
                </Route>
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </CircleProvider>
        </AuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  </ErrorBoundary>,
);
