'use client';
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Check, Copy, Loader2, X } from 'lucide-react';
import { copyText } from '@/utils';

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }>(
  function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
    const v: Record<BtnVariant, string> = {
      primary: 'bg-gradient-to-r from-accent to-accent-2 text-white shadow-lg shadow-accent/25 hover:brightness-110',
      secondary: 'bg-surface-2 text-ink border border-line hover:bg-surface-3',
      ghost: 'text-ink hover:bg-surface-2',
      danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
      outline: 'border border-line-strong text-ink hover:bg-surface-2',
    };
    const s = { sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg', md: 'h-11 px-4 text-[15px] gap-2 rounded-xl', lg: 'h-14 px-6 text-base gap-2.5 rounded-2xl font-semibold' };
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn('inline-flex select-none items-center justify-center font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45', v[variant], s[size], className)}
        {...rest}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
        {children}
      </button>
    );
  },
);

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface/90 p-4 backdrop-blur', className)} {...rest}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-accent/30 to-accent-2/20 text-accent">{icon}</div>}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-6 flex items-center justify-between gap-2 first:mt-0">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-sm font-semibold text-ink/90">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputCls = 'w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/25';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(inputCls, 'h-11', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(inputCls, 'min-h-24 leading-relaxed', className)} {...rest} />;
});

export function Select<T extends string>({ value, onChange, options, className, ...rest }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'>) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className={cn(inputCls, 'h-11 appearance-none pr-8', className)} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Text input that keeps local state and autosaves after a pause and on blur. */
export function AutoText({ value, onSave, multiline, className, delay = 600, ...rest }: { value: string; onSave: (v: string) => void; multiline?: boolean; delay?: number; className?: string; placeholder?: string; rows?: number; 'aria-label'?: string }) {
  const [local, setLocal] = useState(value);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!dirty.current) setLocal(value);
  }, [value]);
  const commit = (v: string) => {
    clearTimeout(timer.current);
    dirty.current = false;
    if (v !== value) onSave(v);
  };
  const change = (v: string) => {
    setLocal(v);
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), delay);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return multiline ? (
    <Textarea value={local} onChange={(e) => change(e.target.value)} onBlur={() => commit(local)} className={className} {...rest} />
  ) : (
    <Input value={local} onChange={(e) => change(e.target.value)} onBlur={() => commit(local)} className={className} {...rest} />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-11 items-center gap-3 text-left text-sm">
      <span className={cn('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-surface-3')}>
        <span className={cn('absolute top-1 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}

export function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-muted">{format ? format(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-8 w-full accent-[var(--accent)]" />
    </label>
  );
}

const badgeTone = {
  neutral: 'bg-surface-3 text-muted',
  accent: 'bg-accent/15 text-accent',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-accent-2/15 text-accent-2',
};
export type Tone = keyof typeof badgeTone;
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', badgeTone[tone], className)}>{children}</span>;
}

export function ProgressBar({ value, indeterminate, className }: { value?: number; indeterminate?: boolean; className?: string }) {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      {indeterminate || value === undefined ? (
        <div className="skeleton h-full w-full opacity-70" />
      ) : (
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-surface-2 text-accent">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy', size = 'sm' }: { text: string; label?: string; size?: 'sm' | 'md' }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size={size}
      variant="ghost"
      icon={done ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}

export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn('pb-safe flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="grid size-10 place-items-center rounded-full hover:bg-surface-2" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; badge?: ReactNode }[] }) {
  return (
    <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition',
            value === t.value ? 'bg-ink text-bg' : 'bg-surface-2 text-muted hover:text-ink',
          )}
        >
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, icon, hint }: { label: string; value: ReactNode; icon?: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-extrabold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{children}</div>;
}

export function InfoNote({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) {
  return (
    <div className={cn('rounded-xl border px-3.5 py-2.5 text-sm', tone === 'info' ? 'border-accent-2/30 bg-accent-2/10 text-ink/90' : 'border-warning/30 bg-warning/10 text-ink/90')}>
      {children}
    </div>
  );
}
