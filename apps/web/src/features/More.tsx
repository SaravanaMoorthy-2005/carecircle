import { Link } from 'react-router-dom';
import { destinations, routeAllowed } from '../app/navigation';
import { useCircle } from '../app/CircleContext';
import { PageHeading } from '../components/ui';
import { useLocale } from '../i18n/LocaleContext';
export default function More() {
  const { can } = useCircle(),
    { t } = useLocale();
  return (
    <>
      <PageHeading title={t('More')}>Everything you need, with room to breathe.</PageHeading>
      <div className="more-grid">
        {destinations
          .filter((d) => d.path !== '/dashboard' && routeAllowed(d.path, can))
          .map(({ path, label, icon: Icon, description }) => (
            <Link className="more-card" to={path} key={path}>
              <Icon size={25} strokeWidth={1.6} />
              <h2>{t(label)}</h2>
              <p>{t(description)}</p>
            </Link>
          ))}
      </div>
    </>
  );
}
