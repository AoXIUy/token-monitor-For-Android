import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Clock,
  Copy,
  Eye,
  Laptop,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldAlert,
  Smartphone,
  X,
} from 'lucide-react';
import {
  buildAgQuotaCells,
  formatAgCompactTimestamp,
  formatAgDeviceLabels,
  formatAgSlotLabel,
  inferAgCapabilityPills,
  isAgAccountAbnormal,
  scoreAgAccountAvailability,
  selectVisibleAgManagerAccounts,
  summarizeAgDevice,
} from '../agManagerState.js';
import type {
  AgManagerAccountSummary,
  AgManagerCapabilityPill,
  AgManagerDeviceSnapshot,
  AgManagerQuotaCell,
  AgManagerState,
} from '../types/monitor';
import { copyTextToClipboard, formatShortTime } from '../utils/formatters';
import {
  EmptyState,
  InlineAlert,
  SearchField,
  SegmentedControl,
} from './ui/Primitives';

interface AntigravityManagerViewProps {
  state: AgManagerState;
  connected: boolean;
  now?: number;
  onRefreshSnapshot: () => void;
  onFilterChange: (patch: {
    deviceId?: string;
    tierFilter?: 'all' | 'PRO' | 'ULTRA' | 'FREE';
    statusFilter?: 'all' | 'available' | 'abnormal';
    searchQuery?: string;
  }) => void;
}

type AgAccountSortId = 'default' | 'quota';

const CAPABILITY_TONE_CLASSES: Record<AgManagerCapabilityPill['tone'], string> = {
  violet: 'bg-[var(--tm-violet-soft-bg)] text-[var(--tm-violet-text)] border-[var(--tm-violet-soft-border)]',
  amber: 'bg-[var(--tm-warning-soft-bg)] text-[var(--tm-warning-text)] border-[var(--tm-warning-soft-border)]',
  emerald: 'bg-[var(--tm-success-soft-bg)] text-[var(--tm-success-text)] border-[var(--tm-success-soft-border)]',
};

function quotaPercentTextClass(pct: number): string {
  if (pct <= 15) return 'text-[var(--tm-danger-text)]';
  if (pct <= 50) return 'text-[var(--tm-warning-text)]';
  return 'text-[var(--tm-success-text)]';
}

function quotaBarFillClass(pct: number): string {
  if (pct <= 15) return 'bg-[var(--tm-danger)]';
  if (pct <= 50) return 'bg-[var(--tm-warning)]';
  return 'bg-[var(--tm-success)]';
}

function quotaResetToneClass(tone: AgManagerQuotaCell['resetTone']): string {
  if (tone === '5h') return 'text-[var(--tm-warning-text)]';
  if (tone === 'weekly') return 'text-[var(--tm-accent-text)]';
  return 'text-[var(--tm-text-muted)]';
}

function quotaCellLabel(cell: AgManagerQuotaCell): string {
  if (cell.title) return cell.title;
  if (cell.id === 'gemini-5h' || (cell.family === 'gemini' && cell.resetTone === '5h')) {
    return 'Gemini · 5h';
  }
  if (cell.id === 'claude-5h' || (cell.family === 'claude' && cell.resetTone === '5h')) {
    return 'Claude · 5h';
  }
  if (cell.id === 'gemini-weekly' || (cell.family === 'gemini' && cell.resetTone === 'weekly')) {
    return 'Gemini · 周';
  }
  if (cell.id === 'claude-weekly' || (cell.family === 'claude' && cell.resetTone === 'weekly')) {
    return 'Claude · 周';
  }
  return '配额';
}

function formatCompactModelCountdown(resetIso: string, nowMs: number): string {
  if (!resetIso) return '';
  const targetMs = Date.parse(resetIso);
  if (!Number.isFinite(targetMs)) return '';
  const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  if (diffSec === 0) return '已就绪';
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

function QuotaFamilyIcon({ family }: { family: AgManagerQuotaCell['family'] }) {
  if (family === 'gemini') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="w-3 h-3 text-[var(--tm-accent)] shrink-0"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 2L14.6 9.4L22 12L14.6 14.6L12 22L9.4 14.6L2 12L9.4 9.4Z" />
      </svg>
    );
  }
  if (family === 'claude') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="w-3 h-3 text-[var(--tm-warning)] shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M12 3v18" />
        <path d="M4.5 7.5l15 9" />
        <path d="M19.5 7.5l-15 9" />
      </svg>
    );
  }
  return <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[var(--tm-text-muted)] shrink-0" />;
}

function AgDevicePickerDialog({
  open,
  devices,
  deviceLabels,
  activeDeviceId,
  onSelectDevice,
  onClose,
}: {
  open: boolean;
  devices: AgManagerDeviceSnapshot[];
  deviceLabels: Record<string, string>;
  activeDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [search, setSearch] = useState('');

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open && el.isConnected) el.showModal();
    if (!open && el.open) el.close();
    if (!open) setSearch('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleBack = () => onCloseRef.current();
    window.addEventListener('tm-close-ag-device-picker', handleBack);
    return () => window.removeEventListener('tm-close-ag-device-picker', handleBack);
  }, [open]);

  const filteredDevices = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return devices
      .map((dev) => ({
        dev,
        label: deviceLabels[dev.deviceId] || dev.hostname || dev.deviceId,
        summary: summarizeAgDevice(dev),
      }))
      .filter(({ dev, label }) => {
        if (!kw) return true;
        return [label, dev.hostname, dev.deviceId].some((field) =>
          String(field || '').toLowerCase().includes(kw),
        );
      });
  }, [devices, deviceLabels, search]);

  const choose = (deviceId: string) => {
    onSelectDevice(deviceId);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      id="ag-device-picker-dialog"
      aria-labelledby="ag-device-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="tm-dialog device-picker-sheet mt-auto mb-0 mx-auto w-full max-w-[460px] sm:my-auto sm:w-[calc(100%_-_2rem)] sm:max-w-[420px] max-h-[82dvh] rounded-t-3xl sm:rounded-3xl p-0 overflow-hidden"
    >
      <div className="flex flex-col max-h-[82dvh]">
        <div
          aria-hidden="true"
          className="w-9 h-1 rounded-full bg-[var(--tm-border-strong)] mx-auto mt-2.5 sm:hidden shrink-0"
        />

        <div className="px-5 pt-3.5 pb-3 border-b border-[var(--tm-border-default)] bg-[var(--tm-bg-dialog-header)] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Laptop className="w-4 h-4 text-[var(--tm-accent)] shrink-0" aria-hidden="true" />
              <h2 id="ag-device-picker-title" className="text-base font-bold text-[var(--tm-text-primary)]">
                选择 AG 同步主机
              </h2>
            </div>
            <p className="text-xs text-[var(--tm-text-muted)] mt-0.5 tabular-nums">
              共 {devices.length} 台主机上报账号池快照
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭主机选择"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-1.5 rounded-full flex items-center justify-center text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)] hover:bg-[var(--tm-bg-control-hover)] active:scale-95 transition-all shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {(devices.length > 4 || search !== '') && (
          <div className="px-4 pt-3 shrink-0">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="搜索主机名称或设备 ID…"
              ariaLabel="搜索 AG 同步主机"
              clearAriaLabel="清除主机搜索"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5 space-y-2.5">
          {filteredDevices.length > 0 ? (
            filteredDevices.map(({ dev, label, summary }) => {
              const isSelected = dev.deviceId === activeDeviceId;
              const updatedText = dev.updatedAt ? formatShortTime(Date.parse(dev.updatedAt)) : '';
              return (
                <button
                  key={dev.deviceId}
                  type="button"
                  data-agm-picker-device={dev.deviceId}
                  aria-pressed={isSelected}
                  onClick={() => choose(dev.deviceId)}
                  className={`w-full text-left rounded-2xl p-3.5 border transition-all active:scale-[0.99] ${
                    isSelected
                      ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-border-accent)] shadow-sm'
                      : 'bg-[var(--tm-bg-row)] hover:bg-[var(--tm-bg-row-hover)] border-[var(--tm-border-default)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] flex items-center justify-center text-[var(--tm-accent-text)] shrink-0 mt-0.5">
                        <Server className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-semibold text-[var(--tm-text-primary)] truncate">
                            {label}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--tm-text-muted)] truncate mt-0.5">
                          <span className="font-mono-tabular">{dev.deviceId}</span>
                          {' · '}
                          {dev.settings.autoRefresh
                            ? `自动 ${dev.settings.refreshIntervalMinutes}m`
                            : '手动'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-[var(--tm-border-default)] bg-[var(--tm-bg-control)] text-[var(--tm-text-secondary)] tabular-nums whitespace-nowrap">
                        可用 {summary.available}/{summary.total}
                      </span>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] flex items-center justify-center text-[var(--tm-accent-text)]">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-[var(--tm-border-subtle)] flex items-center justify-between gap-2 text-[11px] tabular-nums flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {summary.ultra > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-[var(--tm-violet-soft-bg)] text-[var(--tm-violet-text)] border border-[var(--tm-violet-soft-border)]">
                          Ultra {summary.ultra}
                        </span>
                      )}
                      {summary.pro > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-[var(--tm-info-soft-bg)] text-[var(--tm-info-text)] border border-[var(--tm-info-soft-border)]">
                          Pro {summary.pro}
                        </span>
                      )}
                      {summary.free > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-[var(--tm-bg-control)] text-[var(--tm-text-secondary)] border border-[var(--tm-border-default)]">
                          Free {summary.free}
                        </span>
                      )}
                      {summary.abnormal > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-[var(--tm-warning-soft-bg)] text-[var(--tm-warning-text)] border border-[var(--tm-warning-soft-border)]">
                          异常 {summary.abnormal}
                        </span>
                      )}
                    </div>
                    {updatedText && (
                      <span className="text-[11px] font-mono-tabular text-[var(--tm-text-muted)] shrink-0">
                        {updatedText}
                      </span>
                    )}
                  </div>

                  {summary.activeSlots.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[11px]">
                      {summary.activeSlots.map((item) => (
                        <span
                          key={item.slot}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)] max-w-full"
                        >
                          <span className="font-semibold shrink-0">{item.label}</span>
                          <span className="text-[var(--tm-text-secondary)] truncate max-w-[160px]">
                            {item.email}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          ) : (
            <p className="text-center text-xs text-[var(--tm-text-muted)] py-5">没有匹配的同步主机</p>
          )}
        </div>
      </div>
    </dialog>
  );
}

function AccountCard({
  account,
  activeClients,
  nowMs,
}: {
  account: AgManagerAccountSummary;
  activeClients: string[];
  nowMs: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopyEmail = useCallback(async () => {
    const target = account.email || account.id;
    let ok = false;
    try {
      ok = await copyTextToClipboard(target);
    } catch {
      ok = false;
    }
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    setCopyState(ok ? 'copied' : 'failed');
    copyTimerRef.current = window.setTimeout(() => {
      setCopyState('idle');
      copyTimerRef.current = null;
    }, 1600);
  }, [account.email, account.id]);

  const isActive = activeClients.length > 0;
  const abnormal = isAgAccountAbnormal(account);
  const models = account.quota?.models || [];
  const quotaCells = useMemo(() => buildAgQuotaCells(account, nowMs), [account, nowMs]);
  const capabilityPills = useMemo(() => inferAgCapabilityPills(account), [account]);
  const slotLabels = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const slot of activeClients) {
      const label = formatAgSlotLabel(slot);
      if (label && !seen.has(label)) {
        seen.add(label);
        list.push(label);
      }
    }
    return list;
  }, [activeClients]);

  const timestampText = formatAgCompactTimestamp(account.quota?.lastUpdated || account.lastUsedAt);

  const abnormalPill = account.banned
    ? {
        label: '已封禁',
        className:
          'bg-[var(--tm-danger-soft-bg)] text-[var(--tm-danger-text)] border-[var(--tm-danger-soft-border)]',
      }
    : account.validationBlocked
      ? {
          label: '待验证',
          className:
            'bg-[var(--tm-warning-soft-bg)] text-[var(--tm-warning-text)] border-[var(--tm-warning-soft-border)]',
        }
      : account.disabled
        ? {
            label: '已停用',
            className:
              'bg-[var(--tm-warning-soft-bg)] text-[var(--tm-warning-text)] border-[var(--tm-warning-soft-border)]',
          }
        : account.quota?.isForbidden
          ? {
              label: '403',
              className:
                'bg-[var(--tm-warning-soft-bg)] text-[var(--tm-warning-text)] border-[var(--tm-warning-soft-border)]',
            }
          : null;

  const tier = (account.subscriptionTier || 'FREE').toUpperCase();
  const tierBadge =
    tier === 'ULTRA'
      ? {
          label: '◆ ULTRA',
          className:
            'bg-[var(--tm-violet-soft-bg)] text-[var(--tm-violet-text)] border-[var(--tm-violet-soft-border)]',
        }
      : tier === 'PRO'
        ? {
            label: '◆ PRO',
            className:
              'bg-[var(--tm-info-soft-bg)] text-[var(--tm-info-text)] border-[var(--tm-info-soft-border)]',
          }
        : {
            label: tier || 'FREE',
            className:
              'bg-[var(--tm-bg-control)] text-[var(--tm-text-secondary)] border-[var(--tm-border-default)]',
          };

  const errorNote =
    account.validationBlocked && account.validationMessage
      ? account.validationMessage
      : account.disabled && account.disabledReason
        ? account.disabledReason
        : account.quota?.isForbidden && account.quota.forbiddenReason
          ? account.quota.forbiddenReason
          : '';

  const cardSurfaceClass = isActive
    ? 'glass-panel border-[var(--tm-border-accent)] ring-1 ring-[var(--tm-accent-soft-border)]'
    : `glass-panel${abnormal ? ' border-[var(--tm-danger-soft-border)]' : ''}`;

  return (
    <article
      data-agm-account={account.id}
      data-agm-active={isActive ? 'true' : undefined}
      className={`relative rounded-2xl border p-3.5 flex flex-col gap-2.5 transition-colors ${cardSurfaceClass} ${
        account.disabled ? 'opacity-85' : ''
      }`}
    >
      {/* Header: truncated email + touch-friendly copy button */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <span
            data-selectable="true"
            title={
              account.name && account.name !== account.email
                ? `${account.name} (${account.email})`
                : account.email
            }
            style={isActive ? { color: 'var(--tm-accent-text)' } : undefined}
            className={`block text-[13.5px] font-semibold leading-tight truncate ${
              isActive ? 'text-sky-300' : 'text-[var(--tm-text-primary)]'
            }`}
          >
            {account.email}
          </span>
          {account.name && account.name !== account.email && (
            <span className="block text-[11px] text-[var(--tm-text-muted)] truncate mt-0.5">
              {account.name}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopyEmail}
          aria-label={copyState === 'copied' ? `已复制 ${account.email}` : `复制邮箱 ${account.email}`}
          className={`shrink-0 inline-flex items-center justify-center gap-1 min-w-[40px] min-h-[40px] px-2.5 rounded-xl border text-[11px] font-medium transition-all active:scale-95 ${
            copyState === 'copied'
              ? 'bg-[var(--tm-success-soft-bg)] border-[var(--tm-success-soft-border)] text-[var(--tm-success-text)]'
              : copyState === 'failed'
                ? 'bg-[var(--tm-danger-soft-bg)] border-[var(--tm-danger-soft-border)] text-[var(--tm-danger-text)]'
                : 'border-[var(--tm-border-default)] bg-[var(--tm-bg-control)] text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] hover:bg-[var(--tm-bg-control-hover)]'
          }`}
        >
          {copyState === 'copied' ? (
            <>
              <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>已复制</span>
            </>
          ) : copyState === 'failed' ? (
            <span>复制失败</span>
          ) : (
            <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Primary status/slot badges + timestamp */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
          {slotLabels.map((label) => (
            <span
              key={label}
              className="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold leading-tight bg-[var(--tm-accent-soft-bg)] text-[var(--tm-accent-text)] border-[var(--tm-accent-soft-border)]"
            >
              {label}
            </span>
          ))}
          {abnormalPill && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold leading-tight ${abnormalPill.className}`}
            >
              {abnormalPill.label}
            </span>
          )}
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold leading-tight ${tierBadge.className}`}
          >
            {tierBadge.label}
          </span>
          {account.hasDeviceProfile && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium leading-tight bg-[var(--tm-bg-control)] text-[var(--tm-text-muted)]">
              独立指纹
            </span>
          )}
        </div>
        {timestampText && (
          <span className="shrink-0 text-[11px] text-[var(--tm-text-muted)] font-mono-tabular whitespace-nowrap">
            {timestampText}
          </span>
        )}
      </div>

      {/* Quiet secondary capability tags */}
      {capabilityPills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {capabilityPills.map((pill) => (
            <span
              key={pill.label}
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] font-medium leading-tight ${CAPABILITY_TONE_CLASSES[pill.tone]}`}
            >
              {pill.label}
            </span>
          ))}
        </div>
      )}

      {/* Compact inline error explanation when needed */}
      {errorNote && (
        <div
          role="status"
          className="text-[11px] leading-snug text-[var(--tm-danger-text)] bg-[var(--tm-danger-soft-bg)] border border-[var(--tm-danger-soft-border)] rounded-xl px-2.5 py-1.5 break-words"
        >
          {errorNote}
        </div>
      )}

      {/* 2-column compact quota meter grid */}
      {quotaCells.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5">
          {quotaCells.map((cell) => {
            const pct = Math.max(0, Math.min(100, Math.round(cell.pct)));
            const label = quotaCellLabel(cell);
            return (
              <div
                key={cell.id}
                aria-label={cell.ariaLabel}
                className={`rounded-xl bg-[var(--tm-bg-row)] border border-[var(--tm-border-subtle)] px-2.5 py-2 flex flex-col gap-1.5 min-w-0 ${
                  cell.isFull ? 'col-span-2' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 min-w-0">
                  <div className="inline-flex items-center gap-1 min-w-0 flex-1">
                    <QuotaFamilyIcon family={cell.family} />
                    <span className="text-[11px] font-medium text-[var(--tm-text-secondary)] truncate">
                      {label}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-bold font-mono-tabular whitespace-nowrap shrink-0 ${quotaPercentTextClass(pct)}`}
                  >
                    {pct}%
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={cell.ariaLabel}
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-1.5 w-full rounded-full bg-[var(--tm-track-bg)] overflow-hidden"
                >
                  <div
                    style={{ width: `${pct}%` }}
                    className={`h-full rounded-full transition-[width] duration-300 ${quotaBarFillClass(pct)}`}
                  />
                </div>
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-medium tabular-nums whitespace-nowrap ${
                      cell.resetText === '已就绪'
                        ? 'text-[var(--tm-success-text)]'
                        : quotaResetToneClass(cell.resetTone)
                    }`}
                  >
                    <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>{cell.resetText}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-[var(--tm-text-muted)] py-0.5">暂无模型额度快照</p>
      )}

      {/* Expanded full per-model quota list */}
      {expanded && models.length > 0 && (
        <div className="rounded-xl bg-[var(--tm-bg-row)] border border-[var(--tm-border-subtle)] px-2.5 py-2 space-y-2 max-h-52 overflow-y-auto">
          {models.map((model) => {
            const pct = Math.max(0, Math.min(100, Math.round(model.percentage)));
            const reset = formatCompactModelCountdown(model.resetTime, nowMs);
            return (
              <div key={model.name} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px] leading-snug">
                  <span className="text-[var(--tm-text-primary)] truncate min-w-0 flex-1">
                    {model.displayName || model.name}
                  </span>
                  <span className="inline-flex items-center gap-1.5 shrink-0 tabular-nums whitespace-nowrap">
                    {reset && <span className="text-[var(--tm-text-muted)]">{reset}</span>}
                    <span className={`font-semibold font-mono-tabular ${quotaPercentTextClass(pct)}`}>
                      {pct}%
                    </span>
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-[var(--tm-track-bg)] overflow-hidden">
                  <div
                    style={{ width: `${pct}%` }}
                    className={`h-full rounded-full ${quotaBarFillClass(pct)}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Read-only footer action bar */}
      {models.length > 0 && (
        <div className="mt-auto pt-0.5">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            className="w-full min-h-[44px] px-3 rounded-xl border border-[var(--tm-border-default)] bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.99] text-xs font-medium text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] inline-flex items-center justify-center gap-1.5 transition-all"
          >
            <span>{expanded ? `收起模型 (${models.length})` : `展开模型 (${models.length})`}</span>
            <ChevronDown
              aria-hidden="true"
              className={`w-3.5 h-3.5 text-[var(--tm-text-muted)] transition-transform duration-150 ${
                expanded ? 'rotate-180 text-[var(--tm-accent-text)]' : ''
              }`}
            />
          </button>
        </div>
      )}
    </article>
  );
}

export const AntigravityManagerView: React.FC<AntigravityManagerViewProps> = ({
  state,
  connected,
  now,
  onRefreshSnapshot,
  onFilterChange,
}) => {
  const [sortBy, setSortBy] = useState<AgAccountSortId>('default');
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (now !== undefined) return;
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [now]);

  const effectiveNow = now ?? clock;

  const { activeDevice, visibleAccounts, counts, activeByAccountKey } = useMemo(
    () => selectVisibleAgManagerAccounts(state),
    [state],
  );

  const deviceLabels = useMemo(
    () => formatAgDeviceLabels(state.devices),
    [state.devices],
  );

  const deviceSummaries = useMemo(() => {
    const map: Record<string, ReturnType<typeof summarizeAgDevice>> = {};
    for (const dev of state.devices) {
      map[dev.deviceId] = summarizeAgDevice(dev);
    }
    return map;
  }, [state.devices]);

  const activeDeviceSummary = useMemo(
    () =>
      activeDevice
        ? deviceSummaries[activeDevice.deviceId] || summarizeAgDevice(activeDevice)
        : null,
    [activeDevice, deviceSummaries],
  );

  const sortedAccounts = useMemo(() => {
    if (sortBy === 'default') return visibleAccounts;
    const scoreMap = new Map<string, number>();
    for (const account of visibleAccounts) {
      scoreMap.set(account.id, scoreAgAccountAvailability(account));
    }
    return [...visibleAccounts].sort(
      (a, b) => (scoreMap.get(b.id) ?? -1) - (scoreMap.get(a.id) ?? -1),
    );
  }, [visibleAccounts, sortBy]);

  const updateRailScrollState = useCallback(() => {
    const rail = railRef.current;
    if (!rail) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    setCanScrollLeft(rail.scrollLeft > 4);
    setCanScrollRight(maxScroll - rail.scrollLeft > 4);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    updateRailScrollState();

    const activeId = activeDevice?.deviceId;
    if (activeId) {
      const btn = Array.from(rail.querySelectorAll<HTMLButtonElement>('button[data-agm-device]')).find(
        (el) => el.dataset.agmDevice === activeId,
      );
      if (btn) {
        const btnRect = btn.getBoundingClientRect();
        const railRect = rail.getBoundingClientRect();
        if (railRect.width > 0) {
          const targetLeft = Math.max(
            0,
            rail.scrollLeft + (btnRect.left - railRect.left) - (railRect.width - btnRect.width) / 2,
          );
          const reducedMotion =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
          if (typeof rail.scrollTo === 'function') {
            rail.scrollTo({ left: targetLeft, behavior: reducedMotion ? 'auto' : 'smooth' });
          } else {
            rail.scrollLeft = targetLeft;
          }
        }
      }
    }

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateRailScrollState())
        : null;
    observer?.observe(rail);
    window.addEventListener('resize', updateRailScrollState);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateRailScrollState);
    };
  }, [activeDevice?.deviceId, state.devices.length, updateRailScrollState]);

  if (!connected) {
    return (
      <EmptyState
        icon={<Smartphone className="w-6 h-6" />}
        title="未连接 Hub"
        description="连接电脑端 Hub 后，可在此只读查看桌面端 Antigravity 账号池与各客户端当前切换状态。"
        compact
      />
    );
  }

  const updatedLabel = activeDevice?.updatedAt
    ? formatShortTime(Date.parse(activeDevice.updatedAt))
    : '';
  const hasActiveFilter = Boolean(
    state.searchQuery.trim() || state.statusFilter !== 'all' || state.tierFilter !== 'all',
  );
  const resetFilters = () =>
    onFilterChange({ searchQuery: '', statusFilter: 'all', tierFilter: 'all' });

  return (
    <div id="ag-manager-view" className="space-y-3">
      {/* Hero Summary & Bounded Multi-Host Switcher */}
      <section className="glass-hero rounded-3xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-[15px] font-bold text-[var(--tm-text-primary)] leading-tight">
                Antigravity 账号池
              </h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] text-[var(--tm-text-secondary)]">
                <Eye className="w-3 h-3 text-[var(--tm-accent-text)]" aria-hidden="true" />
                <span>只读</span>
              </span>
            </div>
            <p className="text-[11px] text-[var(--tm-text-secondary)] mt-1 truncate">
              {activeDevice ? (
                <>
                  {state.devices.length === 1 && (
                    <>主机 {deviceLabels[activeDevice.deviceId] || activeDevice.hostname} · </>
                  )}
                  {activeDevice.settings.autoRefresh
                    ? `自动刷新 ${activeDevice.settings.refreshIntervalMinutes}m`
                    : '自动刷新已关闭'}
                  {updatedLabel ? ` · 更新于 ${updatedLabel}` : ''}
                </>
              ) : (
                '尚未收到桌面端账号池快照'
              )}
            </p>
          </div>
          <button
            type="button"
            id="ag-manager-refresh"
            onClick={onRefreshSnapshot}
            disabled={state.loading}
            aria-label={state.loading ? '正在刷新账号池快照' : '刷新账号池快照'}
            className="min-h-[44px] px-3 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-border-default)] hover:border-[var(--tm-border-accent)] text-xs font-semibold text-[var(--tm-accent-text)] active:scale-95 transition-all inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${state.loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{state.loading ? '读取中…' : '刷新'}</span>
          </button>
        </div>

        {/* Bounded horizontally-scrollable host pill rail + quick picker trigger */}
        {state.devices.length > 1 && (
          <div className="space-y-1.5 pt-2 border-t border-[var(--tm-border-subtle)] min-w-0">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-[var(--tm-text-secondary)] font-medium">
                <Server className="w-3.5 h-3.5 text-[var(--tm-accent)] shrink-0" aria-hidden="true" />
                <span className="tabular-nums">同步主机 ({state.devices.length})</span>
              </span>
              {state.devices.length >= 3 && (
                <button
                  id="ag-manager-device-picker-trigger"
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={devicePickerOpen}
                  onClick={() => setDevicePickerOpen(true)}
                  className="min-h-[36px] px-3 rounded-full bg-[var(--tm-bg-control)] hover:bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-border-default)] hover:border-[var(--tm-accent-soft-border)] text-[11px] font-semibold text-[var(--tm-accent-text)] inline-flex items-center gap-1 active:scale-95 transition-all shrink-0"
                >
                  <span>切换主机</span>
                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="relative w-full min-w-0 overflow-hidden">
              {canScrollLeft && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 w-6 z-10 bg-gradient-to-r from-[var(--tm-bg-hero)] to-transparent"
                />
              )}
              {canScrollRight && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 w-6 z-10 bg-gradient-to-l from-[var(--tm-bg-hero)] to-transparent"
                />
              )}
              <div
                id="ag-manager-devices"
                ref={railRef}
                role="group"
                aria-label="选择主机"
                onScroll={updateRailScrollState}
                className="relative flex w-full min-w-0 items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5"
              >
                {state.devices.map((dev) => {
                  const isSelected = dev.deviceId === activeDevice?.deviceId;
                  const summary = deviceSummaries[dev.deviceId];
                  const label = deviceLabels[dev.deviceId] || dev.hostname || dev.deviceId;
                  const dotClass = isSelected
                    ? 'bg-[var(--tm-accent)]'
                    : summary && summary.abnormal > 0 && summary.available === 0
                      ? 'bg-[var(--tm-warning)]'
                      : 'bg-[var(--tm-success)]';

                  return (
                    <button
                      key={dev.deviceId}
                      type="button"
                      data-agm-device={dev.deviceId}
                      aria-pressed={isSelected}
                      onClick={() => onFilterChange({ deviceId: dev.deviceId })}
                      className={`shrink-0 min-h-[40px] max-w-[220px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-[0.98] ${
                        isSelected
                          ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-border-accent)] text-[var(--tm-text-primary)] shadow-sm'
                          : 'bg-[var(--tm-bg-control)] border-[var(--tm-border-default)] text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] hover:bg-[var(--tm-bg-control-hover)]'
                      }`}
                    >
                      <i aria-hidden="true" className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
                      <span className="truncate">{label}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono-tabular shrink-0 ${
                          isSelected
                            ? 'bg-[var(--tm-accent-soft-bg)] text-[var(--tm-accent-text)]'
                            : 'bg-[var(--tm-bg-row)] text-[var(--tm-text-muted)]'
                        }`}
                      >
                        {summary?.total ?? dev.accounts.length}
                      </span>
                      {summary && summary.abnormal > 0 && (
                        <i
                          aria-hidden="true"
                          className="w-1.5 h-1.5 rounded-full bg-[var(--tm-warning)] shrink-0"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Equalized 5-Tile KPI Telemetry Strip */}
        {activeDevice && activeDeviceSummary && (
          <div className="grid grid-cols-5 gap-1 p-1.5 rounded-2xl glass-inset tabular-nums">
            <button
              type="button"
              aria-pressed={!hasActiveFilter}
              onClick={resetFilters}
              className={`min-h-[44px] rounded-xl py-1.5 px-1 text-center transition-all active:scale-95 flex flex-col items-center justify-center ${
                hasActiveFilter
                  ? 'hover:bg-[var(--tm-bg-row-hover)] text-[var(--tm-text-secondary)]'
                  : 'text-[var(--tm-text-primary)]'
              }`}
            >
              <div className="text-sm font-bold font-mono-tabular leading-tight">{counts.total}</div>
              <div className="text-[11px] text-[var(--tm-text-muted)] font-medium mt-0.5">总计</div>
            </button>
            <button
              type="button"
              aria-pressed={state.tierFilter === 'ULTRA'}
              onClick={() =>
                onFilterChange({ tierFilter: state.tierFilter === 'ULTRA' ? 'all' : 'ULTRA' })
              }
              className={`min-h-[44px] rounded-xl py-1.5 px-1 text-center transition-all active:scale-95 flex flex-col items-center justify-center ${
                state.tierFilter === 'ULTRA'
                  ? 'bg-[var(--tm-violet-soft-bg)] ring-1 ring-[var(--tm-violet-soft-border)]'
                  : 'hover:bg-[var(--tm-bg-row-hover)]'
              }`}
            >
              <div className="text-sm font-bold font-mono-tabular text-[var(--tm-violet-text)] leading-tight">
                {activeDeviceSummary.ultra}
              </div>
              <div className="text-[11px] text-[var(--tm-violet-text)] font-medium mt-0.5">Ultra</div>
            </button>
            <button
              type="button"
              aria-pressed={state.tierFilter === 'PRO'}
              onClick={() =>
                onFilterChange({ tierFilter: state.tierFilter === 'PRO' ? 'all' : 'PRO' })
              }
              className={`min-h-[44px] rounded-xl py-1.5 px-1 text-center transition-all active:scale-95 flex flex-col items-center justify-center ${
                state.tierFilter === 'PRO'
                  ? 'bg-[var(--tm-info-soft-bg)] ring-1 ring-[var(--tm-info-soft-border)]'
                  : 'hover:bg-[var(--tm-bg-row-hover)]'
              }`}
            >
              <div className="text-sm font-bold font-mono-tabular text-[var(--tm-info-text)] leading-tight">
                {activeDeviceSummary.pro}
              </div>
              <div className="text-[11px] text-[var(--tm-info-text)] font-medium mt-0.5">Pro</div>
            </button>
            <button
              type="button"
              aria-pressed={state.tierFilter === 'FREE'}
              onClick={() =>
                onFilterChange({ tierFilter: state.tierFilter === 'FREE' ? 'all' : 'FREE' })
              }
              className={`min-h-[44px] rounded-xl py-1.5 px-1 text-center transition-all active:scale-95 flex flex-col items-center justify-center ${
                state.tierFilter === 'FREE'
                  ? 'bg-[var(--tm-selection-bg)] ring-1 ring-[var(--tm-selection-border)]'
                  : 'hover:bg-[var(--tm-bg-row-hover)]'
              }`}
            >
              <div className="text-sm font-bold font-mono-tabular text-[var(--tm-text-primary)] leading-tight">
                {activeDeviceSummary.free}
              </div>
              <div className="text-[11px] text-[var(--tm-text-muted)] font-medium mt-0.5">Free</div>
            </button>
            <button
              type="button"
              aria-pressed={state.statusFilter === 'abnormal'}
              onClick={() =>
                onFilterChange({
                  statusFilter: state.statusFilter === 'abnormal' ? 'all' : 'abnormal',
                })
              }
              className={`min-h-[44px] rounded-xl py-1.5 px-1 text-center transition-all active:scale-95 flex flex-col items-center justify-center ${
                state.statusFilter === 'abnormal'
                  ? 'bg-[var(--tm-warning-soft-bg)] ring-1 ring-[var(--tm-warning-soft-border)]'
                  : 'hover:bg-[var(--tm-bg-row-hover)]'
              }`}
            >
              <div
                className={`text-sm font-bold font-mono-tabular leading-tight ${
                  counts.abnormal > 0
                    ? 'text-[var(--tm-warning-text)]'
                    : 'text-[var(--tm-text-subtle)]'
                }`}
              >
                {counts.abnormal}
              </div>
              <div
                className={`text-[11px] font-medium mt-0.5 ${
                  counts.abnormal > 0
                    ? 'text-[var(--tm-warning-text)]'
                    : 'text-[var(--tm-text-subtle)]'
                }`}
              >
                异常
              </div>
            </button>
          </div>
        )}

        {/* Active client slots spotlight */}
        {activeDeviceSummary && activeDeviceSummary.activeSlots.length > 0 && (
          <div className="rounded-2xl glass-inset px-3 py-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-medium text-[var(--tm-text-muted)] shrink-0 mr-0.5">
              当前槽位
            </span>
            {activeDeviceSummary.activeSlots.map((slot) => (
              <span
                key={slot.slot}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-[11px] max-w-full"
              >
                <span className="font-semibold text-[var(--tm-accent-text)] shrink-0">
                  {slot.label}
                </span>
                <span className="text-[var(--tm-text-primary)] truncate max-w-[155px]">
                  {slot.email}
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Search, Filter & Sort Toolbar */}
      <div className="glass-panel rounded-2xl p-3 space-y-2.5">
        <SearchField
          id="ag-manager-search"
          ariaLabel="搜索 Antigravity 账号"
          placeholder="搜索邮箱、备注或模型…"
          value={state.searchQuery}
          onChange={(searchQuery) => onFilterChange({ searchQuery })}
        />

        <div className="flex items-center gap-1.5 flex-wrap">
          <div role="group" aria-label="按状态筛选" className="inline-flex items-center gap-1.5 flex-wrap">
            {(
              [
                ['all', `全部 ${counts.total}`],
                ['available', `可用 ${counts.available}`],
                ['abnormal', `异常 ${counts.abnormal}`],
              ] as const
            ).map(([statusKey, label]) => {
              const active = state.statusFilter === statusKey;
              return (
                <button
                  key={statusKey}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onFilterChange({ statusFilter: statusKey })}
                  className={`min-h-[40px] px-3 rounded-full border text-xs font-semibold tabular-nums transition-all active:scale-95 ${
                    active
                      ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]'
                      : 'bg-[var(--tm-bg-control)] border-[var(--tm-border-default)] text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] hover:bg-[var(--tm-bg-control-hover)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <span
            aria-hidden="true"
            className="h-4 w-px bg-[var(--tm-border-default)] mx-0.5 hidden sm:inline-block"
          />

          <div role="group" aria-label="按套餐筛选" className="inline-flex items-center gap-1.5 flex-wrap">
            {(
              [
                ['all', '全套餐'],
                ['ULTRA', 'ULTRA'],
                ['PRO', 'PRO'],
                ['FREE', 'FREE'],
              ] as const
            ).map(([tierKey, label]) => {
              const active = state.tierFilter === tierKey;
              return (
                <button
                  key={tierKey}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onFilterChange({ tierFilter: tierKey })}
                  className={`min-h-[40px] px-3 rounded-full border text-xs font-semibold transition-all active:scale-95 ${
                    active
                      ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]'
                      : 'bg-[var(--tm-bg-control)] border-[var(--tm-border-default)] text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] hover:bg-[var(--tm-bg-control-hover)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[var(--tm-border-subtle)] flex-wrap">
          <div className="flex items-center gap-2 text-[11px] text-[var(--tm-text-muted)] tabular-nums">
            <span>
              显示{' '}
              <strong className="text-[var(--tm-text-primary)] font-semibold">
                {sortedAccounts.length}
              </strong>{' '}
              / {counts.total} 个账号
            </span>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-full bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-border-default)] text-[11px] font-medium text-[var(--tm-accent-text)] active:scale-95 transition-all"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span>重置筛选</span>
              </button>
            )}
          </div>

          <SegmentedControl<AgAccountSortId>
            size="sm"
            tone="accent"
            fullWidth={false}
            ariaLabel="账号排序"
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: 'default', label: '默认' },
              { value: 'quota', label: '高配额优先' },
            ]}
          />
        </div>
      </div>

      {state.error && (
        <InlineAlert
          tone={state.errorCode === 'unsupported_hub' ? 'sky' : 'amber'}
          icon={<ShieldAlert className="w-4 h-4" />}
        >
          {state.error}
        </InlineAlert>
      )}

      {sortedAccounts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {sortedAccounts.map((account) => (
            <AccountCard
              key={`${activeDevice?.deviceId || 'none'}:${account.id}`}
              account={account}
              activeClients={activeByAccountKey[account.id] || []}
              nowMs={effectiveNow}
            />
          ))}
        </div>
      ) : !state.loading && !state.error ? (
        <EmptyState
          compact
          icon={<Smartphone className="w-5 h-5" />}
          title={activeDevice && counts.total > 0 ? '无匹配账号' : '暂无账号池快照'}
          description={
            activeDevice && counts.total > 0
              ? '尝试清空搜索关键字或切换状态筛选。'
              : '请在桌面端 Token Monitor 的独立 Antigravity 账号管理窗口中添加账号并启用同步快照。'
          }
          action={
            activeDevice && counts.total > 0 && hasActiveFilter ? (
              <button
                type="button"
                onClick={resetFilters}
                className="min-h-[44px] px-4 rounded-xl bg-[var(--tm-accent-soft-bg)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-accent-soft-border)] text-xs font-semibold text-[var(--tm-accent-text)] inline-flex items-center gap-1.5 active:scale-[0.98] transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>重置筛选</span>
              </button>
            ) : undefined
          }
        />
      ) : null}

      <AgDevicePickerDialog
        open={devicePickerOpen && state.devices.length > 1}
        devices={state.devices}
        deviceLabels={deviceLabels}
        activeDeviceId={activeDevice?.deviceId || ''}
        onSelectDevice={(deviceId) => onFilterChange({ deviceId })}
        onClose={() => setDevicePickerOpen(false)}
      />
    </div>
  );
};
