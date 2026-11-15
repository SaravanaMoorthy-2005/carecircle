import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { X, Plus, AlertCircle } from 'lucide-react';
import { useLocale } from '../i18n/LocaleContext';
import {
  cloneElement,
  isValidElement,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { errorMessage } from '../lib/firebase';
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
const buttonVariants = cva('button', {
  variants: {
    variant: {
      primary: 'button-primary',
      secondary: 'button-secondary',
      ghost: 'button-ghost',
      danger: 'button-danger',
    },
  },
  defaultVariants: { variant: 'primary' },
});
export function Button({
  className,
  variant,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  const { t } = useLocale();
  const localize = (child: ReactNode) => (typeof child === 'string' ? t(child.trim()) : child);
  return (
    <button className={cn(buttonVariants({ variant }), className)} {...props}>
      {Array.isArray(children) ? children.map(localize) : localize(children)}
    </button>
  );
}
export function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark">
        <svg width="30" height="30" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <path d="M16 20L43 16L48 43L21 48Z" stroke="currentColor" strokeWidth="3" />
          <g fill="currentColor">
            <circle cx="16" cy="20" r="7" />
            <circle cx="43" cy="16" r="7" />
            <circle cx="48" cy="43" r="7" />
            <circle cx="21" cy="48" r="7" />
            <circle cx="32" cy="32" r="5" />
          </g>
        </svg>
      </span>
      <span>
        Care<span className="logo-accent">Circle</span>
        <span className="logo-caption">CONNECTED CARE. CONFIDENT LIVING.</span>
      </span>
    </span>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const { t } = useLocale();
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-overlay" />
        <DialogPrimitive.Content
          className="modal"
          onOpenAutoFocus={() => {
            previousFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            previousFocus.current?.focus();
          }}
        >
          <div className="modal-header">
            <DialogPrimitive.Title>{t(title)}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" aria-label="Close dialog">
                <X size={20} />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description>
            {description ||
              'Complete the details below. Changes are saved securely to your care circle.'}
          </DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
export function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  hint?: string;
}) {
  const fieldId = useId();
  const { t } = useLocale();
  const describedBy =
    [hint && `${fieldId}-hint`, error && `${fieldId}-error`].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{
          id?: string;
          'aria-describedby'?: string;
          'aria-invalid'?: boolean;
        }>,
        { id: fieldId, 'aria-describedby': describedBy, 'aria-invalid': !!error },
      )
    : children;
  return (
    <div className="field">
      <label htmlFor={fieldId}>
        <span>{t(label)}</span>
      </label>
      {control}
      {hint && <small id={`${fieldId}-hint`}>{hint}</small>}
      {error && (
        <span className="field-error" role="alert" id={`${fieldId}-error`}>
          {label}: {error}
        </span>
      )}
    </div>
  );
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={cn('notice', error && 'notice-error')} role={error ? 'alert' : 'status'}>
      <AlertCircle size={18} />
      <span>{children}</span>
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="empty">
      <span className="empty-icon">
        <Plus size={26} />
      </span>
      <h3>{t(title)}</h3>
      <p>{typeof children === 'string' ? t(children.trim()) : children}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow || 'YOUR CARE, CONNECTED'}</p>
        <h1>{t(title)}</h1>
        {children && <p>{typeof children === 'string' ? t(children.trim()) : children}</p>}
      </div>
      {action}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  const { t } = useLocale();
  return (
    <span className={cn('status', `status-${value}`)}>
      <span aria-hidden="true" />
      {t(value).replaceAll('_', ' ')}
    </span>
  );
}
export function useAction() {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function run(action: () => Promise<unknown>, success = 'Changes saved.') {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPending(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(success);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return {
    pending,
    error,
    message,
    run,
    feedback: (
      <>
        {error && <Notice error>{error}</Notice>}
        {message && <Notice>{message}</Notice>}
      </>
    ),
  };
}
export function formatDate(at: number, timeZone?: string) {
  return new Intl.DateTimeFormat(document.documentElement.lang || 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(at);
}
