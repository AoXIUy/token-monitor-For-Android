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
  violet: 'bg-violet-500/16 text-violet-300 border-violet-400/30',
  amber: 'bg-amber-400/14 text-amber-300 border-amber-400/30',
  emerald: 'bg-emerald-400/14 text-emerald-300 border-emerald-400/30',
};

function quotaPercentTextClass(pct: number): string {
  if (pct <= 15) return 'text-rose-400';
  if (pct <= 50) return 'text-amber-300';
  return 'text-emerald-400';
}

function quotaBarFillClass(pct: number): string {
  if (pct <= 15) return 'bg-rose-400';
  if (pct <= 50) return 'bg-amber-400';
  return 'bg-emerald-400';
}

function quotaResetToneClass(tone: AgManagerQuotaCell['resetTone']): string {
  if (tone === '5h') return 'text-amber-300';
  if (tone === 'weekly') return 'text-sky-300';
  return 'text-slate-400';
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

function formatCompactModelCountdown(resetIso: string): string {
  if (!resetIso) return '';
  const targetMs = Date.parse(resetIso);
  if (!Number.isFinite(targetMs)) return '';
  const diffSec = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
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
        className="w-3 h-3 text-sky-400 shrink-0"
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
        className="w-3 h-3 text-amber-300 shrink-0"
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
  return <span aria-hidden="true" className="w-2 h-2 rounded-full bg-slate-400/80 shrink-0" />;
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
  const [search, setSearch] = useState('');

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    if (!open) setSearch('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleBack = () => onClose();
    window.addEventListener('tm-close-ag-device-picker', handleBack);
    return () => window.removeEventListener('tm-close-ag-device-picker', handleBack);
  }, [open, onClose]);

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
          className="w-9 h-1 rounded-full bg-white/20 mx-auto mt-2.5 sm:hidden shrink-0"
        />

        <div className="px-5 pt-3.5 pb-3 border-b border-white/10 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Laptop className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
              <h2 id="ag-device-picker-title" className="text-base font-bold text-white">
                选择 AG 同步主机
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              共 {devices.length} 台主机上报账号池快照
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭主机选择"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-1.5 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all shrink-0"
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
                      ? 'bg-sky-500/12 border-sky-400/45 shadow-[0_0_20px_rgba(56,189,248,0.12)]'
                      : 'bg-white/[0.025] hover:bg-white/[0.055] border-white/[0.08]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-sky-300 shrink-0 mt-0.5">
                        <Server className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-semibold text-slate-100 truncate">
                            {label}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          <span className="font-mono-tabular">{dev.deviceId}</span>
                          {' · '}
                          {dev.settings.autoRefresh
                            ? `自动 ${dev.settings.refreshIntervalMinutes}m`
                            : '手动'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-white/10 bg-white/[0.04] text-slate-200 tabular-nums whitespace-nowrap">
                        可用 {summary.available}/{summary.total}
                      </span>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-sky-400/20 border border-sky-400/40 flex items-center justify-center text-sky-300">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 text-[11px] tabular-nums flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {summary.ultra > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-200 border border-violet-400/25">
                          Ultra {summary.ultra}
                        </span>
                      )}
                      {summary.pro > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-sky-400/15 text-sky-200 border border-sky-400/25">
                          Pro {summary.pro}
                        </span>
                      )}
                      {summary.free > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-white/[0.06] text-slate-300 border border-white/10">
                          Free {summary.free}
                        </span>
                      )}
                      {summary.abnormal > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-amber-400/15 text-amber-300 border border-amber-400/25">
                          异常 {summary.abnormal}
                        </span>
                      )}
                    </div>
                    {updatedText && (
                      <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                        {updatedText}
                      </span>
                    )}
                  </div>

                  {summary.activeSlots.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[10.5px]">
                      {summary.activeSlots.map((item) => (
                        <span
                          key={item.slot}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-sky-400/12 border border-sky-400/25 text-sky-200 max-w-full"
                        >
                          <span className="font-semibold shrink-0">{item.label}</span>
                          <span className="text-sky-300/80 truncate max-w-[160px]">{item.email}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          ) : (
            <p className="text-center text-xs text-slate-400 py-5">没有匹配的同步主机</p>
          )}
        </div>
      </div>
    </dialog>
  );
}

function AccountCard({
  account,
  activeClients,
}: {
  account: AgManagerAccountSummary;
  activeClients: string[];
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
  const quotaCells = useMemo(() => buildAgQuotaCells(account), [account]);
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
    ? { label: '已封禁', className: 'bg-rose-500/16 text-rose-300 border-rose-400/30' }
    : account.validationBlocked
      ? { label: '待验证', className: 'bg-amber-400/15 text-amber-300 border-amber-400/30' }
      : account.disabled
        ? { label: '已停用', className: 'bg-amber-400/15 text-amber-300 border-amber-400/30' }
        : account.quota?.isForbidden
          ? { label: '403', className: 'bg-amber-400/15 text-amber-300 border-amber-400/30' }
          : null;

  const tier = (account.subscriptionTier || 'FREE').toUpperCase();
  const tierBadge = tier === 'ULTRA'
    ? {
        label: '◆ ULTRA',
        className: 'bg-gradient-to-br from-violet-500/45 to-fuchsia-500/40 text-purple-100 border-purple-400/50',
      }
    : tier === 'PRO'
      ? {
          label: '◆ PRO',
          className: 'bg-gradient-to-br from-blue-500/45 to-indigo-500/45 text-sky-100 border-blue-400/45',
        }
      : {
          label: tier || 'FREE',
          className: 'bg-white/[0.06] text-slate-300 border-white/12',
        };

  const errorNote = account.validationBlocked && account.validationMessage
    ? account.validationMessage
    : account.disabled && account.disabledReason
      ? account.disabledReason
      : account.quota?.isForbidden && account.quota.forbiddenReason
        ? account.quota.forbiddenReason
        : '';

  const cardSurfaceClass = isActive
    ? 'border-sky-400/55 bg-sky-400/[0.07] ring-1 ring-sky-400/20 shadow-[0_10px_26px_-14px_rgba(56,189,248,0.35)]'
    : `glass-panel${abnormal ? ' border-rose-400/25' : ''}`;

  return (
    <article
      data-agm-account={account.id}
      className={`relative rounded-2xl border p-3 flex flex-col gap-2.5 transition-colors ${cardSurfaceClass} ${
        account.disabled ? 'opacity-85' : ''
      }`}
    >
      {/* Header: truncated email + touch-friendly copy button */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <span
            data-selectable="true"
            title={account.name && account.name !== account.email ? `${account.name} (${account.email})` : account.email}
            className={`block text-[13.5px] font-semibold leading-tight truncate ${
              isActive ? 'text-sky-300' : 'text-slate-100'
            }`}
          >
            {account.email}
          </span>
          {account.name && account.name !== account.email && (
            <span className="block text-[11px] text-slate-400 truncate mt-0.5">
              {account.name}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopyEmail}
          aria-label={copyState === 'copied' ? `已复制 ${account.email}` : `复制邮箱 ${account.email}`}
          className={`shrink-0 inline-flex items-center justify-center gap-1 min-w-[32px] h-8 px-2 rounded-xl border text-[11px] font-medium transition-all active:scale-95 ${
            copyState === 'copied'
              ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
              : copyState === 'failed'
                ? 'bg-rose-500/15 border-rose-400/35 text-rose-300'
                : 'border-white/8 bg-white/[0.04] text-slate-300 hover:text-slate-100 hover:bg-white/[0.09]'
          }`}
        >
          {copyState === 'copied' ? (
            <>
              <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>已复制</span>
            </>
          ) : copyState === 'failed' ? (
            <span>复制失败</span>
          ) : (
            <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Compact meta pills + right-aligned timestamp */}
      <div className="flex items-end justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1">
          {slotLabels.map((label) => (
            <span
              key={label}
              className="inline-flex items-center px-1.5 py-[1px] rounded-[5px] border text-[10px] font-semibold leading-[1.45] bg-sky-400/15 text-sky-300 border-sky-400/30"
            >
              {label}
            </span>
          ))}
          {abnormalPill && (
            <span
              className={`inline-flex items-center px-1.5 py-[1px] rounded-[5px] border text-[10px] font-semibold leading-[1.45] ${abnormalPill.className}`}
            >
              {abnormalPill.label}
            </span>
          )}
          <span
            className={`inline-flex items-center px-1.5 py-[1px] rounded-[5px] border text-[10px] font-semibold leading-[1.45] ${tierBadge.className}`}
          >
            {tierBadge.label}
          </span>
          {account.hasDeviceProfile && (
            <span className="inline-flex items-center px-1.5 py-[1px] rounded-[5px] border text-[10px] font-medium leading-[1.45] bg-white/[0.06] text-slate-300/90 border-white/12">
              独立指纹
            </span>
          )}
          {capabilityPills.map((pill) => (
            <span
              key={pill.label}
              className={`inline-flex items-center px-1.5 py-[1px] rounded-[5px] border text-[10px] font-semibold leading-[1.45] ${CAPABILITY_TONE_CLASSES[pill.tone]}`}
            >
              {pill.label}
            </span>
          ))}
        </div>
        {timestampText && (
          <span className="shrink-0 text-[10px] text-slate-400/80 font-mono-tabular whitespace-nowrap leading-[1.45]">
            {timestampText}
          </span>
        )}
      </div>

      {/* Compact inline error explanation when needed */}
      {errorNote && (
        <div
          role="status"
          className="text-[11px] leading-snug text-rose-200/95 bg-rose-500/12 border border-rose-400/25 rounded-xl px-2.5 py-1.5 break-words"
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
                className={`rounded-xl bg-white/[0.04] border border-white/[0.08] px-2.5 py-2 flex flex-col gap-1.5 min-w-0 ${
                  cell.isFull ? 'col-span-2' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 min-w-0">
                  <div className="inline-flex items-center gap-1 min-w-0 flex-1">
                    <QuotaFamilyIcon family={cell.family} />
                    <span className="text-[11px] font-medium text-slate-200/90 truncate">
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
                  className="h-1.5 w-full rounded-full bg-white/[0.10] overflow-hidden"
                >
                  <div
                    style={{ width: `${pct}%` }}
                    className={`h-full rounded-full transition-[width] duration-300 ${quotaBarFillClass(pct)}`}
                  />
                </div>
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <span
                    className={`inline-flex items-center gap-1 text-[10.5px] font-medium tabular-nums whitespace-nowrap ${
                      cell.resetText === '已就绪'
                        ? 'text-emerald-300'
                        : quotaResetToneClass(cell.resetTone)
                    }`}
                  >
                    <Clock className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                    <span>{cell.resetText}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400/80 py-0.5">暂无模型额度快照</p>
      )}

      {/* Expanded full per-model quota list */}
      {expanded && models.length > 0 && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-2.5 py-2 space-y-2 max-h-52 overflow-y-auto">
          {models.map((model) => {
            const pct = Math.max(0, Math.min(100, Math.round(model.percentage)));
            const reset = formatCompactModelCountdown(model.resetTime);
            return (
              <div key={model.name} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px] leading-snug">
                  <span className="text-slate-200 truncate min-w-0 flex-1">
                    {model.displayName || model.name}
                  </span>
                  <span className="inline-flex items-center gap-1.5 shrink-0 tabular-nums whitespace-nowrap">
                    {reset && <span className="text-slate-400">{reset}</span>}
                    <span className={`font-semibold font-mono-tabular ${quotaPercentTextClass(pct)}`}>
                      {pct}%
                    </span>
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-white/[0.08] overflow-hidden">
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

      {/* Compact read-only footer action bar */}
      {models.length > 0 && (
        <div className="mt-auto pt-0.5">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            className="w-full min-h-[34px] px-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.99] text-[11.5px] font-medium text-slate-300 hover:text-slate-100 inline-flex items-center justify-center gap-1 transition-all"
          >
            <span>{expanded ? `收起模型 (${models.length})` : `展开模型 (${models.length})`}</span>
            <ChevronDown
              aria-hidden="true"
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                expanded ? 'rotate-180 text-sky-300' : ''
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
  onRefreshSnapshot,
  onFilterChange,
}) => {
  const [sortBy, setSortBy] = useState<AgAccountSortId>('default');
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

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
    () => (activeDevice ? deviceSummaries[activeDevice.deviceId] || summarizeAgDevice(activeDevice) : null),
    [activeDevice, deviceSummaries],
  );

  const sortedAccounts = useMemo(() => {
    if (sortBy === 'default') return visibleAccounts;
    return [...visibleAccounts].sort(
      (a, b) => scoreAgAccountAvailability(b) - scoreAgAccountAvailability(a),
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

    const observer = typeof ResizeObserver !== 'undefined'
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
      {/* Upgraded Hero Summary & Bounded Multi-Host Switcher */}
      <section className="glass-hero rounded-3xl p-3.5 sm:p-4 space-y-3">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-[15px] font-bold text-white leading-tight">
                Antigravity 账号池
              </h2>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.08] border border-white/12 text-slate-200">
                <Eye className="w-2.5 h-2.5 text-sky-300" aria-hidden="true" />
                <span>只读</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-300/90 mt-1 truncate">
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
              ) : '尚未收到桌面端账号池快照'}
            </p>
          </div>
          <button
            type="button"
            id="ag-manager-refresh"
            onClick={onRefreshSnapshot}
            disabled={state.loading}
            aria-label={state.loading ? '正在刷新账号池快照' : '刷新账号池快照'}
            className="min-h-[36px] px-3 rounded-xl bg-black/30 hover:bg-black/45 border border-white/15 hover:border-sky-400/40 text-xs font-semibold text-sky-100 active:scale-95 transition-all inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-300 ${state.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{state.loading ? '读取中…' : '刷新'}</span>
          </button>
        </div>

        {/* Bounded horizontally-scrollable host pill rail + quick picker trigger */}
        {state.devices.length > 1 && (
          <div className="space-y-1.5 pt-1 border-t border-white/10 min-w-0">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-slate-300 font-medium">
                <Server className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                <span className="tabular-nums">同步主机 ({state.devices.length})</span>
              </span>
              {state.devices.length >= 3 && (
                <button
                  id="ag-manager-device-picker-trigger"
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={devicePickerOpen}
                  onClick={() => setDevicePickerOpen(true)}
                  className="min-h-[28px] px-2.5 rounded-full bg-white/[0.06] hover:bg-sky-400/15 border border-white/12 hover:border-sky-400/35 text-[11px] font-semibold text-sky-200 inline-flex items-center gap-1 active:scale-95 transition-all shrink-0"
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
                  className="pointer-events-none absolute inset-y-0 left-0 w-6 z-10 bg-gradient-to-r from-[#101925] to-transparent"
                />
              )}
              {canScrollRight && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 w-6 z-10 bg-gradient-to-l from-[#101925] to-transparent"
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
                    ? 'bg-sky-400'
                    : summary && summary.abnormal > 0 && summary.available === 0
                      ? 'bg-amber-400'
                      : 'bg-emerald-400';

                  return (
                    <button
                      key={dev.deviceId}
                      type="button"
                      data-agm-device={dev.deviceId}
                      aria-pressed={isSelected}
                      onClick={() => onFilterChange({ deviceId: dev.deviceId })}
                      className={`shrink-0 min-h-[38px] max-w-[220px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-[0.98] ${
                        isSelected
                          ? 'bg-sky-400/22 border-sky-400/50 text-white shadow-[0_2px_12px_rgba(56,189,248,0.2)]'
                          : 'bg-white/[0.05] border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.09]'
                      }`}
                    >
                      <i aria-hidden="true" className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
                      <span className="truncate">{label}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono-tabular shrink-0 ${
                          isSelected
                            ? 'bg-sky-400/25 text-sky-100'
                            : 'bg-white/[0.08] text-slate-400'
                        }`}
                      >
                        {summary?.total ?? dev.accounts.length}
                      </span>
                      {summary && summary.abnormal > 0 && (
                        <i
                          aria-hidden="true"
                          className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 5-Tile KPI Telemetry Strip */}
        {activeDevice && activeDeviceSummary && (
          <div className="grid grid-cols-5 gap-1 p-1.5 rounded-2xl glass-inset">
            <button
              type="button"
              onClick={resetFilters}
              className={`rounded-xl py-1.5 px-1 text-center transition-all active:scale-95 ${
                state.statusFilter === 'all' && state.tierFilter === 'all'
                  ? 'bg-white/[0.08] text-white'
                  : 'text-slate-300 hover:bg-white/[0.05]'
              }`}
            >
              <div className="text-sm font-bold font-mono-tabular leading-tight">{counts.total}</div>
              <div className="text-[10px] text-slate-400 font-medium mt-0.5">总计</div>
            </button>
            <button
              type="button"
              onClick={() =>
                onFilterChange({ tierFilter: state.tierFilter === 'ULTRA' ? 'all' : 'ULTRA' })
              }
              className={`rounded-xl py-1.5 px-1 text-center transition-all active:scale-95 ${
                state.tierFilter === 'ULTRA'
                  ? 'bg-violet-500/22 ring-1 ring-violet-400/45 text-violet-100'
                  : 'hover:bg-white/[0.05]'
              }`}
            >
              <div className="text-sm font-bold font-mono-tabular text-violet-200 leading-tight">
                {activeDeviceSummary.ultra}
              </div>
              <div className="text-[10px] text-violet-300/90 font-medium mt-0.5">Ultra</div>
            </button>
            <button
              type="button"
              onClick={() =>
                onFilterChange({ tierFilter: state.tierFilter === 'PRO' ? 'all' : 'PRO' })
              }
              className={`rounded-xl py-1.5 px-1 text-center transition-all active:scale-95 ${
                state.tierFilter === 'PRO'
                  ? 'bg-sky-500/22 ring-1 ring-sky-400/45 text-sky-100'
                  : 'hover:bg-white/[0.05]'
              }`}
            >
              <div className="text-sm font-bold font-mono-tabular text-sky-200 leading-tight">
                {activeDeviceSummary.pro}
              </div>
              <div className="text-[10px] text-sky-300/90 font-medium mt-0.5">Pro</div>
            </button>
            <button
              type="button"
              onClick={() =>
                onFilterChange({ tierFilter: state.tierFilter === 'FREE' ? 'all' : 'FREE' })
              }
              className={`rounded-xl py-1.5 px-1 text-center transition-all active:scale-95 ${
                state.tierFilter === 'FREE'
                  ? 'bg-white/[0.12] ring-1 ring-white/25 text-white'
                  : 'hover:bg-white/[0.05]'
              }`}
            >
              <div className="text-sm font-bold font-mono-tabular text-slate-200 leading-tight">
                {activeDeviceSummary.free}
              </div>
              <div className="text-[10px] text-slate-400 font-medium mt-0.5">Free</div>
            </button>
            <button
              type="button"
              onClick={() =>
                onFilterChange({
                  statusFilter: state.statusFilter === 'abnormal' ? 'all' : 'abnormal',
                })
              }
              className={`rounded-xl py-1.5 px-1 text-center transition-all active:scale-95 ${
                state.statusFilter === 'abnormal'
                  ? 'bg-amber-400/22 ring-1 ring-amber-400/45 text-amber-100'
                  : 'hover:bg-white/[0.05]'
              }`}
            >
              <div
                className={`text-sm font-bold font-mono-tabular leading-tight ${
                  counts.abnormal > 0 ? 'text-amber-300' : 'text-slate-500'
                }`}
              >
                {counts.abnormal}
              </div>
              <div
                className={`text-[10px] font-medium mt-0.5 ${
                  counts.abnormal > 0 ? 'text-amber-300/90' : 'text-slate-500'
                }`}
              >
                异常
              </div>
            </button>
          </div>
        )}

        {/* Active client slots spotlight */}
        {activeDeviceSummary && activeDeviceSummary.activeSlots.length > 0 && (
          <div className="rounded-2xl glass-inset px-2.5 py-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10.5px] font-medium text-slate-400 shrink-0 mr-0.5">
              当前槽位
            </span>
            {activeDeviceSummary.activeSlots.map((slot) => (
              <span
                key={slot.slot}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-400/12 border border-sky-400/25 text-[10.5px] max-w-full"
              >
                <span className="font-semibold text-sky-300 shrink-0">{slot.label}</span>
                <span className="text-slate-200 truncate max-w-[155px]">{slot.email}</span>
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
          <div role="group" aria-label="按状态筛选" className="inline-flex items-center gap-1 flex-wrap">
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
                  className={`min-h-[30px] px-2.5 rounded-full border text-[11px] font-semibold tabular-nums transition-all active:scale-95 ${
                    active
                      ? 'bg-sky-400/20 border-sky-400/45 text-sky-100'
                      : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.07]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <span aria-hidden="true" className="h-3.5 w-px bg-white/12 mx-0.5 hidden sm:inline-block" />

          <div role="group" aria-label="按套餐筛选" className="inline-flex items-center gap-1 flex-wrap">
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
                  className={`min-h-[30px] px-2.5 rounded-full border text-[11px] font-semibold transition-all active:scale-95 ${
                    active
                      ? 'bg-sky-400/20 border-sky-400/45 text-sky-100'
                      : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.07]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06] flex-wrap">
          <div className="flex items-center gap-2 text-[11px] text-slate-400 tabular-nums">
            <span>
              显示 <strong className="text-slate-200 font-semibold">{sortedAccounts.length}</strong> / {counts.total} 个账号
            </span>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-[10.5px] font-medium text-sky-200 active:scale-95 transition-all"
              >
                <RotateCcw className="w-2.5 h-2.5" aria-hidden="true" />
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
                className="min-h-[40px] px-4 rounded-xl bg-sky-500/18 hover:bg-sky-500/26 border border-sky-400/35 text-xs font-semibold text-sky-100 inline-flex items-center gap-1.5 active:scale-[0.98] transition-all"
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
