import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Info,
  Search,
  X,
} from 'lucide-react';
import { copyTextToClipboard } from '../../utils/formatters';

export type DataAttributes = Record<`data-${string}`, string | number | boolean | undefined>;

/* -------------------------------------------------------------------------- */
/* ToggleSwitch                                                               */
/* -------------------------------------------------------------------------- */

export interface ToggleSwitchProps {
  id?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  label?: React.ReactNode;
  className?: string;
  inputProps?: Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'id' | 'type' | 'checked' | 'disabled' | 'onChange' | 'aria-label' | 'className'
  > &
    DataAttributes;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  id,
  checked,
  disabled = false,
  onChange,
  ariaLabel,
  label,
  className = '',
  inputProps,
}) => (
  <label
    className={`inline-flex items-center gap-2 min-h-[44px] shrink-0 select-none ${
      disabled ? 'cursor-default' : 'cursor-pointer'
    } ${className}`}
  >
    <input
      {...inputProps}
      id={id}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.checked)}
      className="sr-only peer"
    />
    <span
      aria-hidden="true"
      className={`w-11 h-6 rounded-full transition-colors duration-200 relative inline-block shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#090C10] ${
        checked ? 'bg-gradient-to-r from-sky-400 to-emerald-400' : 'bg-white/15'
      } ${disabled ? 'opacity-45' : ''}`}
    >
      <span
        className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-0.5 left-0.5 transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </span>
    {label !== undefined && (
      <span className="text-xs font-medium text-slate-200 whitespace-nowrap">{label}</span>
    )}
  </label>
);

/* -------------------------------------------------------------------------- */
/* SearchField                                                                */
/* -------------------------------------------------------------------------- */

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  clearAriaLabel?: string;
  id?: string;
  className?: string;
  inputClassName?: string;
  inputProps?: Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'id' | 'type' | 'value' | 'onChange' | 'placeholder' | 'aria-label' | 'className'
  > &
    DataAttributes;
}

export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  placeholder,
  ariaLabel,
  clearAriaLabel = '清除搜索',
  id,
  className = '',
  inputClassName = '',
  inputProps,
}) => (
  <div className={`relative flex items-center ${className}`}>
    <Search
      aria-hidden="true"
      className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none"
    />
    <input
      {...inputProps}
      id={id}
      type="search"
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      className={`w-full min-h-[44px] pl-10 pr-11 py-2 rounded-2xl glass-inset text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-400/60 transition-colors ${inputClassName}`}
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label={clearAriaLabel}
        className="w-11 h-11 flex items-center justify-center absolute right-0 text-slate-400 hover:text-slate-100 active:scale-95 rounded-xl transition-all"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);

/* -------------------------------------------------------------------------- */
/* SegmentedControl                                                           */
/* -------------------------------------------------------------------------- */

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  dataAttrs?: DataAttributes;
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  id?: string;
  size?: 'md' | 'sm';
  tone?: 'neutral' | 'accent';
  fullWidth?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  id,
  size = 'md',
  tone = 'neutral',
  fullWidth,
  className = '',
}: SegmentedControlProps<T>) {
  const isFullWidth = fullWidth ?? size === 'md';
  const isSm = size === 'sm';

  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      className={`${isFullWidth ? 'flex w-full' : 'inline-flex'} glass-inset ${
        isSm ? 'p-0.5 rounded-xl gap-0.5' : 'p-1 rounded-2xl gap-1'
      } ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        const activeClasses =
          tone === 'accent'
            ? 'bg-sky-400/20 text-sky-100 border border-sky-400/35 shadow-sm'
            : 'bg-slate-800/95 text-white border border-white/12 shadow-[0_2px_8px_rgba(0,0,0,0.35)]';
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            aria-label={option.ariaLabel}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            {...option.dataAttrs}
            className={`${isFullWidth ? 'flex-1 min-w-0' : 'shrink-0'} ${
              isSm
                ? 'min-h-[36px] px-2.5 rounded-lg text-[11px]'
                : 'min-h-[40px] px-2 rounded-xl text-xs'
            } font-semibold transition-all duration-150 whitespace-nowrap inline-flex items-center justify-center gap-1 active:scale-[0.98] disabled:opacity-45 ${
              active
                ? activeClasses
                : 'border border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="truncate">{option.label}</span>
            {option.badge !== undefined && option.badge !== null && option.badge !== false && (
              <span className="text-[11px] tabular-nums opacity-80 shrink-0">{option.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* useCopyFeedback & CopyButton                                               */
/* -------------------------------------------------------------------------- */

export function useCopyFeedback(durationMs = 1600) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string, key = 'default'): Promise<boolean> => {
      const ok = await copyTextToClipboard(text);
      if (!ok) return false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      setCopiedKey(key);
      timerRef.current = window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
        timerRef.current = null;
      }, durationMs);
      return true;
    },
    [durationMs],
  );

  const isCopied = useCallback((key = 'default') => copiedKey === key, [copiedKey]);

  return { copiedKey, isCopied, copy };
}

export interface CopyButtonProps {
  text: string;
  ariaLabel: string;
  label?: string;
  copiedLabel?: string;
  durationMs?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
  onCopied?: () => void;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  ariaLabel,
  label = '复制',
  copiedLabel = '已复制',
  durationMs = 1600,
  disabled = false,
  id,
  className = '',
  onCopied,
}) => {
  const { isCopied, copy } = useCopyFeedback(durationMs);
  const copied = isCopied('btn');

  return (
    <button
      id={id}
      type="button"
      disabled={disabled || !text}
      aria-label={ariaLabel}
      onClick={async () => {
        const ok = await copy(text, 'btn');
        if (ok) onCopied?.();
      }}
      className={`inline-flex items-center justify-center gap-1.5 min-h-[36px] px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all active:scale-[0.97] disabled:opacity-40 shrink-0 whitespace-nowrap ${
        copied
          ? 'bg-emerald-500/14 border-emerald-400/30 text-emerald-200'
          : 'bg-white/[0.05] hover:bg-sky-500/15 border-white/10 text-slate-200 hover:text-sky-200'
      } ${className}`}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" aria-hidden="true" />
          <span>{copiedLabel}</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5 text-sky-300 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
};

/* -------------------------------------------------------------------------- */
/* InlineAlert                                                                */
/* -------------------------------------------------------------------------- */

export type AlertTone = 'amber' | 'rose' | 'sky' | 'emerald';

const ALERT_TONES: Record<
  AlertTone,
  { container: string; icon: string; DefaultIcon: React.ComponentType<{ className?: string }> }
> = {
  amber: {
    container: 'bg-amber-500/12 border-amber-400/30 text-amber-100',
    icon: 'text-amber-300',
    DefaultIcon: AlertTriangle,
  },
  rose: {
    container: 'bg-rose-500/12 border-rose-400/30 text-rose-100',
    icon: 'text-rose-300',
    DefaultIcon: AlertTriangle,
  },
  sky: {
    container: 'bg-sky-400/10 border-sky-400/30 text-sky-100',
    icon: 'text-sky-300',
    DefaultIcon: Info,
  },
  emerald: {
    container: 'bg-emerald-500/12 border-emerald-400/30 text-emerald-100',
    icon: 'text-emerald-300',
    DefaultIcon: CheckCircle2,
  },
};

export interface InlineAlertProps {
  tone: AlertTone;
  children: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  role?: React.AriaRole;
  ariaLive?: 'off' | 'polite' | 'assertive';
  className?: string;
}

export const InlineAlert: React.FC<InlineAlertProps> = ({
  tone,
  children,
  icon,
  action,
  id,
  role = 'status',
  ariaLive,
  className = '',
}) => {
  const palette = ALERT_TONES[tone];
  const DefaultIcon = palette.DefaultIcon;

  return (
    <div
      id={id}
      role={role}
      aria-live={ariaLive}
      className={`rounded-2xl border px-3.5 py-3 text-xs leading-relaxed flex items-center justify-between gap-2.5 flex-wrap ${palette.container} ${className}`}
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <span className={`shrink-0 mt-0.5 ${palette.icon}`} aria-hidden="true">
          {icon !== undefined ? icon : <DefaultIcon className="w-4 h-4" />}
        </span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {action && <div className="flex items-center gap-1.5 shrink-0">{action}</div>}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* EmptyState                                                                 */
/* -------------------------------------------------------------------------- */

const EMPTY_ICON_TONES = {
  sky: 'bg-sky-500/12 border-sky-400/25 text-sky-300',
  violet: 'bg-violet-500/14 border-violet-400/30 text-violet-300',
  slate: 'bg-white/[0.06] border-white/12 text-slate-300',
};

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  tone?: 'sky' | 'violet' | 'slate';
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  id,
  tone = 'sky',
  compact = false,
  className = '',
}) => (
  <div
    id={id}
    className={`glass-panel rounded-3xl text-center space-y-3 ${
      compact ? 'p-5' : 'p-7 my-3'
    } ${className}`}
  >
    {icon && (
      <div
        className={`w-12 h-12 rounded-2xl border flex items-center justify-center mx-auto ${EMPTY_ICON_TONES[tone]}`}
        aria-hidden="true"
      >
        {icon}
      </div>
    )}
    <div className="space-y-1">
      <p className="text-base font-semibold text-slate-100">{title}</p>
      {description && (
        <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
      )}
    </div>
    {action && <div className="pt-1">{action}</div>}
  </div>
);

/* -------------------------------------------------------------------------- */
/* SectionHeader                                                              */
/* -------------------------------------------------------------------------- */

export interface SectionHeaderProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  headingLevel?: 'h2' | 'h3';
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  icon,
  subtitle,
  badge,
  action,
  headingLevel = 'h3',
  className = '',
}) => {
  const HeadingTag = headingLevel;
  return (
    <div className={`flex items-start justify-between gap-2.5 ${className}`}>
      <div className="flex items-start gap-2 min-w-0 flex-1">
        {icon && (
          <span className="shrink-0 mt-0.5 text-sky-400" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <HeadingTag className="text-sm font-semibold text-slate-100 tracking-tight min-w-0 break-words">
              {title}
            </HeadingTag>
            {badge}
          </div>
          {subtitle && (
            <p className="text-[11px] text-slate-400 leading-snug mt-0.5 break-words">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0 flex items-center gap-1.5">{action}</div>}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* ProgressMeter                                                              */
/* -------------------------------------------------------------------------- */

export type MeterTone = 'sky' | 'emerald' | 'amber' | 'danger' | 'custom';

const METER_TONES: Record<Exclude<MeterTone, 'custom'>, string> = {
  sky: 'bg-gradient-to-r from-sky-400 to-cyan-300',
  emerald: 'bg-gradient-to-r from-emerald-400 to-teal-300',
  amber: 'bg-gradient-to-r from-amber-400 to-amber-300',
  danger: 'bg-gradient-to-r from-amber-400 to-rose-400',
};

export interface ProgressMeterProps {
  percent: number | null;
  tone?: MeterTone;
  barClassName?: string;
  heightClass?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * Renders a progress meter with zero phantom fill at 0%.
 * Contract: ONLY the inner fill element carries an inline `style={{ width }}`
 * so `[data-limit-account] [style]` count assertions stay exact.
 */
export const ProgressMeter: React.FC<ProgressMeterProps> = ({
  percent,
  tone = 'sky',
  barClassName,
  heightClass = 'h-1.5',
  ariaLabel,
  className = '',
}) => {
  if (percent === null || !Number.isFinite(percent)) return null;
  const clamped = Math.max(0, Math.min(100, percent));
  const fillClass =
    tone === 'custom'
      ? barClassName || METER_TONES.sky
      : barClassName || METER_TONES[tone];

  return (
    <div
      role={ariaLabel ? 'progressbar' : undefined}
      aria-label={ariaLabel}
      aria-valuenow={ariaLabel ? Math.round(clamped) : undefined}
      aria-valuemin={ariaLabel ? 0 : undefined}
      aria-valuemax={ariaLabel ? 100 : undefined}
      aria-hidden={ariaLabel ? undefined : true}
      className={`${heightClass} w-full rounded-full bg-white/[0.07] overflow-hidden ${className}`}
    >
      <div
        style={{ width: `${clamped}%` }}
        className={`h-full rounded-full transition-[width] duration-300 ${fillClass}`}
      />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* DetailsDisclosure                                                          */
/* -------------------------------------------------------------------------- */

export interface DetailsDisclosureProps
  extends Omit<React.DetailsHTMLAttributes<HTMLDetailsElement>, 'children'> {
  summary: React.ReactNode;
  summaryMeta?: React.ReactNode;
  summaryClassName?: string;
  bodyClassName?: string;
  children: React.ReactNode;
  [dataAttr: `data-${string}`]: unknown;
}

export const DetailsDisclosure: React.FC<DetailsDisclosureProps> = ({
  summary,
  summaryMeta,
  summaryClassName = '',
  bodyClassName = '',
  className = '',
  children,
  ...rest
}) => (
  <details {...rest} className={`group ${className}`}>
    <summary
      className={`list-none [&::-webkit-details-marker]:hidden min-h-[44px] py-2.5 flex items-center justify-between gap-2 text-xs font-medium text-slate-200 select-none ${summaryClassName}`}
    >
      <span className="min-w-0 flex-1 flex items-center gap-2">{summary}</span>
      <span className="inline-flex items-center gap-1.5 shrink-0 text-[11px] text-slate-400">
        {summaryMeta}
        <ChevronDown
          aria-hidden="true"
          className="w-4 h-4 text-slate-400 transition-transform duration-150 group-open:rotate-180 group-open:text-sky-300 shrink-0"
        />
      </span>
    </summary>
    <div className={bodyClassName}>{children}</div>
  </details>
);
