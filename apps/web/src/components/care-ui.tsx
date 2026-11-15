import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Temporal } from '@js-temporal/polyfill';
import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pill,
  Volume2,
  Square,
} from 'lucide-react';
import type {
  Appointment,
  CareDirectoryMember,
  Medication,
  RecordWithId,
} from '@carecircle/shared';
import { Button, Empty, Notice, Status, cn, formatDate } from './ui';
import { useLocale } from '../i18n/LocaleContext';

export function DashboardCard({
  title,
  children,
  action,
  className,
  eyebrow,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  eyebrow?: string;
}) {
  const { t } = useLocale();
  return (
    <section className={cn('dashboard-card', className)}>
      {title && (
        <div className="section-title">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2>{t(title)}</h2>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function GlassPanel({ children }: { children: ReactNode }) {
  return <section className="glass-panel">{children}</section>;
}
export function LoadingSkeleton() {
  return (
    <div className="skeleton-grid" role="status" aria-label="Loading care information">
      <div className="loading-skeleton" />
      <span className="sr-only">Loading care information…</span>
    </div>
  );
}
export interface TimelineEvent {
  id: string;
  at: number;
  title: string;
  detail: string;
  status: string;
  type: 'medication' | 'appointment' | 'task';
  to: string;
}
export function CareTimeline({ events, timeZone }: { events: TimelineEvent[]; timeZone: string }) {
  const { t, language } = useLocale();
  return events.length ? (
    <div className="care-timeline">
      {[...events]
        .sort((a, b) => a.at - b.at)
        .map((event) => (
          <article key={event.id} className="timeline-event">
            <span className="timeline-dot" aria-hidden="true" />
            <div className={cn('timeline-body', event.type)}>
              <div className="timeline-meta">
                <span>
                  {new Intl.DateTimeFormat(language, { timeStyle: 'short', timeZone }).format(
                    event.at,
                  )}
                </span>
                <Status value={event.status} />
              </div>
              <Link to={event.to}>
                <h3>{event.title}</h3>
                <p>{event.detail}</p>
              </Link>
            </div>
          </article>
        ))}
    </div>
  ) : (
    <Empty title={t('No scheduled care for this day')}>
      {t('Your next care action will appear here.')}
    </Empty>
  );
}
export function CalendarWidget({
  selected,
  onSelect,
  timeZone,
  appointments,
  medications,
}: {
  selected: string;
  onSelect: (date: string) => void;
  timeZone: string;
  appointments: (Appointment & { scheduledAt: number })[];
  medications: Medication[];
}) {
  const { t, language } = useLocale(),
    today = Temporal.Now.zonedDateTimeISO(timeZone).toPlainDate().toString();
  const [month, setMonth] = useState(() => Temporal.PlainDate.from(selected).with({ day: 1 })),
    [focus, setFocus] = useState(selected);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const first = month.subtract({ days: month.dayOfWeek - 1 }),
    dates = Array.from({ length: 42 }, (_, i) => first.add({ days: i }));
  const display = (date: Temporal.PlainDate, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(
      new Date(date.toString() + 'T12:00:00Z'),
    );
  const move = (date: Temporal.PlainDate) => {
    setFocus(date.toString());
    if (date.month !== month.month || date.year !== month.year) {
      setMonth(date.with({ day: 1 }));
      onSelect(date.toString());
    }
    requestAnimationFrame(() => buttons.current[date.toString()]?.focus());
  };
  const marked = (date: string) =>
    appointments.some(
      (a) =>
        a.status === 'scheduled' &&
        Temporal.Instant.fromEpochMilliseconds(a.scheduledAt)
          .toZonedDateTimeISO(timeZone)
          .toPlainDate()
          .toString() === date,
    ) ||
    medications.some(
      (m) =>
        m.status === 'active' &&
        date >= m.startDate &&
        (!m.endDate || date <= m.endDate) &&
        m.weekdays.includes(Temporal.PlainDate.from(date).dayOfWeek),
    );
  return (
    <section className="dashboard-card calendar-card" aria-label={t('Calendar')}>
      <div className="calendar-header">
        <h2 aria-live="polite">{display(month, { month: 'long', year: 'numeric' })}</h2>
        <div className="inline-actions">
          <Button
            variant="ghost"
            aria-label={t('Previous month')}
            onClick={() => {
              const date = month.subtract({ months: 1 });
              setMonth(date);
              setFocus(date.toString());
              onSelect(date.toString());
            }}
          >
            <ChevronLeft size={18} />
          </Button>
          <Button
            variant="ghost"
            aria-label={t('Next month')}
            onClick={() => {
              const date = month.add({ months: 1 });
              setMonth(date);
              setFocus(date.toString());
              onSelect(date.toString());
            }}
          >
            <ChevronRight size={18} />
          </Button>
        </div>
      </div>
      <div className="calendar-grid">
        {dates.slice(0, 7).map((date) => (
          <span className="calendar-weekday" key={'weekday' + date.toString()}>
            {display(date, { weekday: 'narrow' })}
          </span>
        ))}
        {dates.map((date) => {
          const value = date.toString();
          return (
            <button
              key={value}
              ref={(node) => {
                buttons.current[value] = node;
              }}
              className={cn(
                'calendar-day',
                date.month !== month.month && 'other-month',
                value === today && 'today',
                value === selected && 'selected',
              )}
              aria-label={
                display(date, { dateStyle: 'full' }) + (marked(value) ? ', scheduled care' : '')
              }
              aria-current={value === today ? 'date' : undefined}
              aria-pressed={selected === value}
              tabIndex={focus === value ? 0 : -1}
              onFocus={() => setFocus(value)}
              onClick={() => onSelect(value)}
              onKeyDown={(e) => {
                const delta = (
                  { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 } as Record<
                    string,
                    number
                  >
                )[e.key];
                if (delta) {
                  e.preventDefault();
                  move(date.add({ days: delta }));
                } else if (['Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
                  e.preventDefault();
                  move(
                    e.key === 'Home'
                      ? date.subtract({ days: date.dayOfWeek - 1 })
                      : e.key === 'End'
                        ? date.add({ days: 7 - date.dayOfWeek })
                        : date.add({ months: e.key === 'PageUp' ? -1 : 1 }),
                  );
                }
              }}
            >
              {date.day}
              {marked(value) && <span className="calendar-indicator" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <p className="calendar-legend">
        <i aria-hidden="true" />
        {t('Scheduled')} · {timeZone.replaceAll('_', ' ')}
      </p>
    </section>
  );
}
export function AppointmentCard({
  appointment,
}: {
  appointment: RecordWithId<Appointment> & { scheduledAt: number };
}) {
  return (
    <article className="appointment-mini">
      <div className="section-title">
        <CalendarDays size={22} strokeWidth={1.5} />
        <Status value={appointment.status} />
      </div>
      <h3>{appointment.clinician}</h3>
      <p>{appointment.specialty || 'Care appointment'}</p>
      <p>
        <Clock3 size={15} /> {formatDate(appointment.scheduledAt, appointment.timeZone)}
      </p>
      <p>{appointment.location}</p>
      <Link to="/appointments">
        View appointment <ArrowUpRight size={15} />
      </Link>
    </article>
  );
}
export function MedicationCard({ medication }: { medication: RecordWithId<Medication> }) {
  return (
    <Link to="/medications" className="mini-medication">
      <span className="mini-icon">
        <Pill size={21} strokeWidth={1.5} />
      </span>
      <div>
        <strong>{medication.name}</strong>
        <small>
          {medication.times.join(' · ')} · {medication.status}
        </small>
      </div>
      <ArrowUpRight size={16} />
    </Link>
  );
}
export function CareMemberCard({ member }: { member: CareDirectoryMember }) {
  const { t } = useLocale();
  return (
    <div className="connection-member">
      <span className="avatar">{member.displayName.slice(0, 1)}</span>
      <div>
        <p>{member.displayName}</p>
        <small>
          {t(
            member.role === 'owner'
              ? 'Elder'
              : member.role === 'caregiver'
                ? 'Caregiver'
                : 'Family member',
          )}
        </small>
      </div>
    </div>
  );
}
export function AccessibleTabs({
  items,
  selected,
  onSelect,
}: {
  items: { id: string; label: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="filter-pills" role="tablist" aria-label="View options">
      {items.map((item, index) => (
        <button
          type="button"
          role="tab"
          aria-selected={selected === item.id}
          tabIndex={selected === item.id ? 0 : -1}
          key={item.id}
          onClick={() => onSelect(item.id)}
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            const target =
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? items.length - 1
                  : (index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
            onSelect(items[target]!.id);
            const parent = e.currentTarget.parentElement;
            requestAnimationFrame(() => (parent?.children[target] as HTMLElement)?.focus());
          }}
        >
          {t(item.label)}
        </button>
      ))}
    </div>
  );
}
export function ReadAloud({ text }: { text: string }) {
  const { language, t } = useLocale(),
    [reading, setReading] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setReading(false);
    return () => {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    };
  }, [text, language]);
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setError('');
          if (!('speechSynthesis' in window)) {
            setError(
              'Read-aloud is unavailable in this browser. All care information remains available as text.',
            );
            return;
          }
          if (reading) {
            speechSynthesis.cancel();
            setReading(false);
            return;
          }
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = language === 'ta' ? 'ta-IN' : language === 'hi' ? 'hi-IN' : 'en-IN';
          utterance.rate = 0.85;
          utterance.onend = () => setReading(false);
          utterance.onerror = () => {
            setReading(false);
            setError('The voice is unavailable. You can read the same care plan on screen.');
          };
          speechSynthesis.cancel();
          speechSynthesis.speak(utterance);
          setReading(true);
        }}
      >
        {reading ? <Square size={17} /> : <Volume2 size={18} />}
        {t(reading ? 'Stop reading' : 'Read today’s plan')}
      </Button>
      {error && <Notice>{error}</Notice>}
    </>
  );
}
