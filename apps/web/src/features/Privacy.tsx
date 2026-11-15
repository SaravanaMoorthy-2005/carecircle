import { Link } from 'react-router-dom';
import { Logo, PageHeading } from '../components/ui';
export default function Privacy() {
  return (
    <main className="privacy-page">
      <Link to="/" className="brand-link">
        <Logo />
      </Link>
      <PageHeading title="Your trust belongs at the centre.">
        Plain-language information about your care data.
      </PageHeading>
      <section className="panel prose">
        <h2>What CareCircle stores</h2>
        <p>
          Your account identity, care profile, medication schedules, dose confirmations,
          appointments, membership permissions, notification preferences, and care activity records.
          Private notes are optional. Do not enter information that is unnecessary for care
          coordination.
        </p>
        <h2>Who can see it</h2>
        <p>
          Care data is shared with authenticated, verified members of a care circle according to
          explicit permissions. Profile owners control membership. Authorized server processes read
          data to deliver reminders. Administrators with cloud access may access stored records.
        </p>
        <h2>How data is protected</h2>
        <p>
          Firebase manages account credentials. Backend permission checks, database rules, expiring
          invitations, and encrypted private notes provide multiple layers of protection. This is
          not end-to-end encryption and no healthcare compliance certification is claimed.
        </p>
        <h2>Email and notifications</h2>
        <p>
          Care emails use generic wording to limit health information in inboxes. Invitation emails
          contain a single-use code. Email acceptance is not proof of delivery; notifications may be
          delayed, blocked, or duplicated. Browser push is optional.
        </p>
        <h2>Your choices</h2>
        <p>
          Use Settings to adjust notification and accessibility preferences. Use Care Circle to
          inspect permissions and revoke access. Previously viewed or downloaded information cannot
          be remotely erased from another person’s device. Contact the operator of your deployment
          for data export or account deletion; self-service export and deletion are not currently
          implemented.
        </p>
        <h2>Limits of the service</h2>
        <p>
          CareCircle records reported actions. It does not verify medication ingestion, recommend
          doses, diagnose conditions, or provide an emergency response service. Ask a clinician
          about medical decisions.
        </p>
        <Link to="/dashboard" className="button button-primary">
          Return to your care space
        </Link>
      </section>
    </main>
  );
}
