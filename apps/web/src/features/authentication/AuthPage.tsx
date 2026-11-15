import { Localized } from '../../i18n/Localized';
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
} from 'firebase/auth';
import {
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  Fingerprint,
  Users,
  HeartHandshake,
  LockKeyhole,
  Check,
  FlaskConical,
  UserRound,
  Stethoscope,
} from 'lucide-react';
import { auth, authReady, configured, emulator } from '../../lib/firebase';
import { useAuth } from '../../app/AuthContext';
import { Button, Field, Logo, Notice, useAction } from '../../components/ui';
import { LanguagePicker, useLocale } from '../../i18n/LocaleContext';

const DEMO_ACCOUNTS = [
  {
    role: 'Elder',
    email: 'elder@carecircle.test',
    password: 'CareCircle-demo-2026!',
    icon: UserRound,
    description: 'Full owner access — medications, circle, settings',
    color: '#4f46e5',
    badge: 'Owner',
  },
  {
    role: 'Caregiver',
    email: 'caregiver@carecircle.test',
    password: 'CareCircle-demo-2026!',
    icon: Stethoscope,
    description: 'Clinical care — prescriptions, adherence, audit log',
    color: '#0891b2',
    badge: 'Caregiver',
  },
  {
    role: 'Family',
    email: 'family@carecircle.test',
    password: 'CareCircle-demo-2026!',
    icon: Users,
    description: 'Family support — tasks, appointments, wellbeing',
    color: '#059669',
    badge: 'Family',
  },
] as const;
export default function AuthPage() {
  const path = useLocation().pathname,
    signup = path === '/signup',
    reset = path === '/reset-password';
  const { user, loading } = useAuth(),
    { t } = useLocale();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [name, setName] = useState(''),
    [show, setShow] = useState(false);
  const action = useAction(),
    passwordValid = password.length >= 12 && password.length <= 128;
  if (loading)
    return (
      <main className="loading-screen" role="status">
        {t('Please wait…')}
      </main>
    );
  if (user && !reset) return <Navigate to="/dashboard" replace />;
  return (
    <main className="auth-page premium-auth">
      <section className="auth-story">
        <Link to="/welcome" className="brand-link">
          <Logo />
        </Link>
        <div className="auth-story-copy">
          <span className="eyebrow">CONNECTED CARE. CONFIDENT LIVING.</span>
          <h2>
            Good care.
            <br />
            Closer together.
          </h2>
          <p>
            A calmer routine. A trusted circle.
            <br />
            More confidence in every day.
          </p>
          <div className="connection-art" aria-hidden="true">
            <div className="connection-line line-one" />
            <div className="connection-line line-two" />
            <div className="connection-core">
              <Fingerprint size={54} strokeWidth={1.4} />
              <strong>
                Your care,
                <br />
                connected.
              </strong>
            </div>
            <div className="connection-person person-one">
              <HeartHandshake size={27} />
              <span>
                <Localized value={'Elder'} />
              </span>
            </div>
            <div className="connection-person person-two">
              <ShieldCheck size={27} />
              <span>
                <Localized value={'Caregiver'} />
              </span>
            </div>
            <div className="connection-person person-three">
              <Users size={27} />
              <span>
                <Localized value={'Family'} />
              </span>
            </div>
          </div>
        </div>
        <div className="auth-promise">
          <span className="icon-tile">
            <LockKeyhole size={22} />
          </span>
          <div>
            <strong>Private by design.</strong>
            <p>You decide who joins your circle.</p>
          </div>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-topline">
          <Link to="/welcome">
            About CareCircle <ArrowRight size={16} />
          </Link>
          <LanguagePicker />
        </div>
        <div className="auth-form">
          <span className="section-chip">
            <ShieldCheck size={15} /> YOUR PRIVATE CARE SPACE
          </span>
          <h1>
            {t(signup ? 'Create your account' : reset ? 'Reset your password' : 'Welcome back')}
          </h1>
          <p className="auth-lead">
            {signup
              ? 'A little connection makes a world of difference.'
              : reset
                ? 'Enter your email to receive a secure recovery link.'
                : 'Your people and your care plan are right here.'}
          </p>
          {!configured && (
            <Notice error>
              Configure Firebase to enable secure sign-in. Local setup instructions are in the
              README.
            </Notice>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(
                async () => {
                  await authReady;
                  const address = email.trim().toLowerCase();
                  if (reset) {
                    await sendPasswordResetEmail(auth, address);
                    return;
                  }
                  if (signup) {
                    if (!passwordValid)
                      throw new Error('Use between 12 and 128 characters for your password.');
                    if (password !== confirmation) throw new Error('Your passwords do not match.');
                    const result = await createUserWithEmailAndPassword(auth, address, password);
                    await updateProfile(result.user, { displayName: name.trim() });
                    await sendEmailVerification(result.user);
                  } else await signInWithEmailAndPassword(auth, address, password);
                },
                reset
                  ? 'If an account exists, recovery instructions have been sent.'
                  : 'Signed in.',
              );
            }}
          >
            {signup && (
              <Field label="Your name">
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={80}
                />
              </Field>
            )}
            <Field label="Email address">
              <input
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                placeholder="you@example.com"
              />
            </Field>
            {!reset && (
              <>
                <div className="password-row">
                  <Field
                    label="Password"
                    hint={signup ? 'Use a unique passphrase of at least 12 characters.' : undefined}
                  >
                    <input
                      type={show ? 'text' : 'password'}
                      autoComplete={signup ? 'new-password' : 'current-password'}
                      minLength={signup ? 12 : 1}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    className="password-toggle"
                    aria-label={t(show ? 'Hide password' : 'Show password')}
                    aria-pressed={show}
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff size={20} /> : <Eye size={20} />}
                  </Button>
                </div>
                {signup && (
                  <>
                    <p className={passwordValid ? 'password-guidance valid' : 'password-guidance'}>
                      <Check size={15} />{' '}
                      {passwordValid
                        ? 'Passphrase length meets the requirement.'
                        : '12 characters minimum · password managers welcome'}
                    </p>
                    <Field label="Confirm password">
                      <input
                        type={show ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        required
                      />
                    </Field>
                    <label className="checkbox auth-consent">
                      <input type="checkbox" required />{' '}
                      <span>
                        I have read the <Link to="/privacy">privacy information</Link> and agree to
                        create my account.
                      </span>
                    </label>
                  </>
                )}
              </>
            )}
            {!signup && !reset && (
              <div className="auth-recovery">
                <span>
                  <LockKeyhole size={14} /> Private session
                </span>
                <Link to="/reset-password">{t('Forgot your password?')}</Link>
              </div>
            )}
            {action.feedback}
            <Button className="full-width" disabled={action.pending || !configured}>
              {action.pending
                ? 'Please wait…'
                : signup
                  ? 'Create account'
                  : reset
                    ? 'Send reset instructions'
                    : 'Sign in securely'}
              <ArrowRight size={19} />
            </Button>
          </form>
          {!reset && (
            <>
              <div className="divider">
                <span>or continue with</span>
              </div>
              <Button
                variant="secondary"
                className="full-width google-button"
                disabled={action.pending || !configured}
                onClick={() =>
                  void action.run(async () => {
                    await authReady;
                    const provider = new GoogleAuthProvider();
                    provider.setCustomParameters({ prompt: 'select_account' });
                    await signInWithPopup(auth, provider);
                  }, 'Signed in.')
                }
              >
                <span className="google-g" aria-hidden="true">
                  G
                </span>
                <Localized value={'Continue with Google'} />
              </Button>
              <p className="auth-switch">
                {signup ? 'Already have an account?' : 'New here?'}{' '}
                <Link to={signup ? '/login' : '/signup'}>
                  {t(signup ? 'Sign in securely' : 'Create your account')}
                </Link>
              </p>
            </>
          )}
          {reset && <Link to="/login">{t('Return to sign in')}</Link>}
          {emulator && !reset && (
            <div className="demo-panel">
              <div className="demo-panel-header">
                <FlaskConical size={15} />
                <span>DEMO QUICK SIGN-IN — LOCAL EMULATOR</span>
              </div>
              <p className="demo-panel-desc">
                Click any role to instantly fill in demo credentials. All data is synthetic and local only.
              </p>
              <div className="demo-role-cards">
                {DEMO_ACCOUNTS.map(({ role, email, password, icon: Icon, description, color, badge }) => (
                  <button
                    key={role}
                    type="button"
                    className="demo-role-card"
                    style={{ '--role-color': color } as React.CSSProperties}
                    onClick={() => {
                      setEmail(email);
                      setPassword(password);
                    }}
                  >
                    <span className="demo-role-icon">
                      <Icon size={20} />
                    </span>
                    <span className="demo-role-info">
                      <strong>{role}</strong>
                      <span className="demo-role-badge">{badge}</span>
                      <small>{description}</small>
                      <code>{email}</code>
                    </span>
                    <ArrowRight size={15} className="demo-role-arrow" />
                  </button>
                ))}
              </div>
              <p className="demo-password-note">
                <LockKeyhole size={12} /> Password: <code>CareCircle-demo-2026!</code>
              </p>
            </div>
          )}
          <div className="role-reassurance">
            <Users size={21} />
            <p>
              Your role and access are set by your care circle’s owner. An invitation connects
              caregivers and family to the right care space.
            </p>
          </div>
        </div>
        <p className="auth-footer">CareCircle · Thoughtful care, together.</p>
      </section>
    </main>
  );
}
