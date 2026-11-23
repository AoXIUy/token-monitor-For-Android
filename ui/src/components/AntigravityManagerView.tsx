import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Clock,
  Copy,
  Eye,
  RefreshCw,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import {
  buildAgQuotaCells,
  formatAgCompactTimestamp,
  formatAgSlotLabel,
  inferAgCapabilityPills,
  isAgAccountAbnormal,
  selectVisibleAgManagerAccounts,
} from '../agManagerState.js';
import type {
  AgManagerAccountSummary,
  AgManagerCapabilityPill,
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
        className="w-3 h-3 text-sky-400 shrink-0"
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
      className={`relative rounded-xl border p-2.5 flex flex-col gap-2 transition-colors ${cardSurfaceClass} ${
        account.disabled ? 'opacity-85' : ''
      }`}
    >
      {/* Header: truncated email + touch-friendly copy button */}
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <span
          data-selectable="true"
          title={account.name && account.name !== account.email ? `${account.name} (${account.email})` : account.email}
          className={`text-[13px] font-semibold leading-tight truncate min-w-0 flex-1 ${
            isActive ? 'text-sky-300' : 'text-slate-100'
          }`}
        >
          {account.email}
        </span>
        <button
          type="button"
          onClick={handleCopyEmail}
          aria-label={copyState === 'copied' ? `已复制 ${account.email}` : `复制邮箱 ${account.email}`}
          className={`shrink-0 inline-flex items-center justify-center gap-1 min-w-[28px] h-7 px-1.5 rounded-lg border text-[10.5px] font-medium transition-all active:scale-95 ${
            copyState === 'copied'
              ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
              : copyState === 'failed'
                ? 'bg-rose-500/15 border-rose-400/35 text-rose-300'
                : 'border-transparent text-slate-400 hover:text-slate-100 hover:bg-white/[0.08]'
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
          <span className="shrink-0 text-[10px] text-slate-400/75 tabular-nums whitespace-nowrap leading-[1.45]">
            {timestampText}
          </span>
        )}
      </div>

      {/* Compact inline error explanation when needed */}
      {errorNote && (
        <div
          role="status"
          className="text-[10.5px] leading-snug text-rose-200/95 bg-rose-500/12 border border-rose-400/25 rounded-lg px-2 py-1 break-words"
        >
          {errorNote}
        </div>
      )}

      {/* 2-column compact quota meter grid */}
      {quotaCells.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5">
          {quotaCells.map((cell) => {
            const pct = Math.max(0, Math.min(100, Math.round(cell.pct)));
            return (
              <div
                key={cell.id}
                aria-label={cell.ariaLabel}
                className={`rounded-lg bg-white/[0.04] border border-white/[0.07] px-2 py-1.5 flex flex-col gap-1 min-w-0 ${
                  cell.isFull ? 'col-span-2' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <div className="inline-flex items-center gap-1 min-w-0 flex-1">
                    <QuotaFamilyIcon family={cell.family} />
                    {cell.title && (
                      <span className="text-[10.5px] font-medium text-slate-200/90 truncate">
                        {cell.title}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-0.5 text-[10.5px] font-medium tabular-nums whitespace-nowrap shrink-0 ${quotaResetToneClass(cell.resetTone)}`}
                    >
                      <Clock className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                      <span>{cell.resetText}</span>
                    </span>
                  </div>
                  <span
                    className={`text-[11.5px] font-bold tabular-nums whitespace-nowrap shrink-0 ${quotaPercentTextClass(pct)}`}
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
                  className="h-[3px] w-full rounded-full bg-white/[0.10] overflow-hidden"
                >
                  <div
                    style={{ width: `${pct}%` }}
                    className={`h-full rounded-full transition-[width] duration-300 ${quotaBarFillClass(pct)}`}
                  />
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
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.07] px-2 py-1.5 space-y-1 max-h-44 overflow-y-auto">
          {models.map((model) => {
            const pct = Math.max(0, Math.min(100, Math.round(model.percentage)));
            const reset = formatCompactModelCountdown(model.resetTime);
            return (
              <div
                key={model.name}
                className="flex items-center justify-between gap-2 text-[10.5px] leading-snug"
              >
                <span className="text-slate-300 truncate min-w-0 flex-1">
                  {model.displayName || model.name}
                </span>
                <span className="inline-flex items-center gap-1.5 shrink-0 tabular-nums whitespace-nowrap">
                  {reset && <span className="text-slate-400/85">{reset}</span>}
                  <span className={`font-semibold ${quotaPercentTextClass(pct)}`}>
                    {pct}%
                  </span>
                </span>
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
            className="w-full min-h-[30px] px-2.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.99] text-[11px] font-medium text-slate-300 hover:text-slate-100 inline-flex items-center justify-center gap-1 transition-all"
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
  const { activeDevice, visibleAccounts, counts, activeByAccountKey } = useMemo(
    () => selectVisibleAgManagerAccounts(state),
    [state],
  );

  const tierCounts = useMemo(() => {
    const accounts = activeDevice?.accounts || [];
    let ultra = 0;
    let pro = 0;
    let free = 0;
    for (const acc of accounts) {
      const tier = (acc.subscriptionTier || 'FREE').toUpperCase();
      if (tier === 'ULTRA') ultra += 1;
      else if (tier === 'PRO') pro += 1;
      else free += 1;
    }
    return { ultra, pro, free };
  }, [activeDevice]);

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

  return (
    <div id="ag-manager-view" className="space-y-2.5">
      {/* Compact top summary & filter panel */}
      <div className="glass-panel rounded-2xl p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-[13.5px] font-semibold text-slate-100 leading-tight">
                Antigravity 账号池
              </h2>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-slate-300">
                <Eye className="w-2.5 h-2.5 text-slate-400" aria-hidden="true" />
                <span>只读</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {activeDevice ? (
                <>
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
            className="min-h-[34px] px-2.5 rounded-xl glass-inset text-xs font-medium text-sky-200 hover:border-sky-400/40 active:scale-95 transition-all inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${state.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{state.loading ? '读取中…' : '刷新'}</span>
          </button>
        </div>

        {state.devices.length > 1 && (
          <SegmentedControl
            id="ag-manager-devices"
            size="sm"
            ariaLabel="选择主机"
            value={activeDevice?.deviceId || ''}
            onChange={(deviceId) => onFilterChange({ deviceId })}
            options={state.devices.map((dev) => ({
              value: dev.deviceId,
              label: dev.hostname || dev.deviceId,
            }))}
          />
        )}

        {/* Compact tier count summary pills */}
        {activeDevice && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-white/[0.07] border border-white/10 text-slate-200 tabular-nums">
              <span>总计</span>
              <span>{counts.total}</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-violet-500/15 border border-violet-400/30 text-violet-200 tabular-nums">
              <span>Ultra</span>
              <span>{tierCounts.ultra}</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-sky-400/15 border border-sky-400/30 text-sky-200 tabular-nums">
              <span>Pro</span>
              <span>{tierCounts.pro}</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-white/[0.05] border border-white/10 text-slate-400 tabular-nums">
              <span>Free</span>
              <span>{tierCounts.free}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border tabular-nums ${
                counts.abnormal > 0
                  ? 'bg-amber-400/15 border-amber-400/30 text-amber-300'
                  : 'bg-white/[0.04] border-white/8 text-slate-500'
              }`}
            >
              <span>异常</span>
              <span>{counts.abnormal}</span>
            </span>
          </div>
        )}

        {/* Search + sleek filter chips */}
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
                  className={`min-h-[28px] px-2.5 rounded-full border text-[11px] font-medium tabular-nums transition-all active:scale-95 ${
                    active
                      ? 'bg-sky-400/20 border-sky-400/45 text-sky-100'
                      : 'bg-white/[0.04] border-white/8 text-slate-400 hover:text-slate-200 hover:bg-white/[0.07]'
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
                  className={`min-h-[28px] px-2.5 rounded-full border text-[11px] font-medium transition-all active:scale-95 ${
                    active
                      ? 'bg-sky-400/20 border-sky-400/45 text-sky-100'
                      : 'bg-white/[0.04] border-white/8 text-slate-400 hover:text-slate-200 hover:bg-white/[0.07]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
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

      {visibleAccounts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {visibleAccounts.map((account) => (
            <AccountCard
              key={account.id}
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
        />
      ) : null}
    </div>
  );
};
