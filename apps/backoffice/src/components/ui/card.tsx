import { type VariantProps, cva } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(15,61,46,0.04)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-brand-50 text-brand-800',
        success: 'bg-brand-100 text-brand-800',
        warning: 'bg-warning-50 text-warning',
        danger: 'bg-danger-50 text-danger',
        info: 'bg-info-50 text-info',
        accent: 'bg-accent-100 text-accent-600',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  tone,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
} as const;
const ALERT_STYLES = {
  info: 'bg-info-50 text-info border-info/20',
  success: 'bg-brand-50 text-brand-800 border-brand-200',
  warning: 'bg-warning-50 text-warning border-warning/20',
  danger: 'bg-danger-50 text-danger border-danger/20',
} as const;

/** Message important (erreur de formulaire, information). Annoncé aux lecteurs d'écran. */
export function Alert({
  tone = 'info',
  children,
}: {
  tone?: keyof typeof ICONS;
  children: ReactNode;
}) {
  const Icon = ICONS[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm',
        ALERT_STYLES[tone],
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
