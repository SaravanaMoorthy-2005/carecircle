import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  CalendarDays,
  ShieldCheck,
  Users,
  Pill,
  HeartHandshake,
} from 'lucide-react';
import { Logo } from '../components/ui';
export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="brand-link">
          <Logo />
        </Link>
        <nav aria-label="Public navigation">
          <Link to="/privacy">Your privacy</Link>
          <Link to="/login">Sign in</Link>
          <Link to="/signup" className="button button-primary">
            Create your circle <ArrowRight size={18} />
          </Link>
        </nav>
      </header>
      <main>
        <section className="landing-hero">
          <div>
            <p className="eyebrow">CONNECTED CARE. CONFIDENT LIVING.</p>
            <h1>
              Everyday care.
              <br />
              <span>Extraordinary people.</span>
            </h1>
            <p className="hero-description">
              A calmer way to manage medications, appointments, and the people who look out for you.
              Stay independent, with your circle by your side.
            </p>
            <div className="hero-actions">
              <Link to="/signup" className="button button-primary">
                Start your care circle <ArrowRight size={18} />
              </Link>
              <Link to="/join" className="button button-secondary">
                I have an invitation
              </Link>
            </div>
            <p className="hero-assurance">
              <ShieldCheck size={18} /> Your information. Your people. Your permission.
            </p>
          </div>
          <div className="hero-care-card">
            <span className="hero-card-icon">
              <HeartHandshake size={46} strokeWidth={1.5} />
            </span>
            <p className="eyebrow">A LITTLE LESS TO WORRY ABOUT</p>
            <h2>
              Everything that matters,
              <br />
              in one caring place.
            </h2>
            <ul>
              <li>
                <span>
                  <Pill size={22} />
                </span>
                <div>
                  <strong>A clearer daily routine</strong>
                  <p>Schedules and confirmations, shared securely.</p>
                </div>
                <Check size={18} />
              </li>
              <li>
                <span>
                  <CalendarDays size={22} />
                </span>
                <div>
                  <strong>Room for what’s next</strong>
                  <p>Appointments your circle can coordinate.</p>
                </div>
                <Check size={18} />
              </li>
              <li>
                <span>
                  <Users size={22} />
                </span>
                <div>
                  <strong>Support that stays connected</strong>
                  <p>Invite the people you trust, on your terms.</p>
                </div>
                <Check size={18} />
              </li>
            </ul>
            <div className="hero-card-footer">You’re at the centre of every care decision.</div>
          </div>
        </section>
        <section className="landing-principles">
          <article>
            <span>01</span>
            <h2>Your routine, made clearer</h2>
            <p>
              Keep clinician-provided medication instructions and scheduled doses together. Record
              what happened with one clear action.
            </p>
          </article>
          <article>
            <span>02</span>
            <h2>Your people, kept in the loop</h2>
            <p>
              Family and caregivers see only what you share. Care updates appear across authorized
              views without a refresh.
            </p>
          </article>
          <article>
            <span>03</span>
            <h2>Your independence, respected</h2>
            <p>
              Readable text, large controls, and accessible workflows. You decide who joins, who can
              edit, and when access ends.
            </p>
          </article>
        </section>
      </main>
      <footer className="landing-footer">
        <Logo />
        <p>A thoughtful companion for everyday care. Not a medical or emergency service.</p>
        <Link to="/privacy">Privacy information</Link>
      </footer>
    </div>
  );
}
