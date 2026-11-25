import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  Gauge,
  History,
  Link2,
  RotateCcw,
  Server,
  Sparkles,
} from 'lucide-react';
import { MonitorModel } from '../model/monitorModel';
import {
  LimitAccountPresentationMap,
  LimitProvider,
  LimitsPrefs,
  MonitorStats,
  QuotaHistoryPayload,
  QuotaTabId,
  SubscriptionsPayload,
} from '../types/monitor';
import { QuotaHistoryPreview } from './QuotaHistoryPreview';
import {
  clientTone,
  formatRelativeCountdown,
  formatShortTime,
  limitStatusLabel,
  providerName,
} from '../utils/formatters';
import { sha256Hex } from '../utils/limitsPrefs';
import {
  DetailsDisclosure,
  EmptyState,
  InlineAlert,
  ProgressMeter,
  SearchField,
  SegmentedControl,
} from './ui/Primitives';

interface LimitsViewProps {
  providers: LimitProvider[];
  stats: MonitorStats;
  deviceId: string;
  quotaTab: QuotaTabId;
  subscriptions: SubscriptionsPayload | null;
  subscriptionError: string;
  history: QuotaHistoryPayload | null;
  historyError: string;
  fetchedAt: number;
  foreground: boolean;
  now?: number;
  prefs: LimitsPrefs;
  limitAccountPresentation?: LimitAccountPresentationMap;
  onChangePrefs: (next: LimitsPrefs) => void;
}

type StatusFilterId = 'all' | 'collected' | 'healthy' | 'warn' | 'abnormal';
type LimitSortId = 'default' | 'pressure' | 'updated';
type SubKindFilterId = 'all' | 'subscription' | 'topup';

export const LimitsView: React.FC<LimitsViewProps> = ({
  providers,
  stats,
  deviceId,
  quotaTab,
  subscriptions,
  subscriptionError,
  history,
  historyError,
  fetchedAt,
  foreground,
  now,
  prefs,
  limitAccountPresentation,
  onChangePrefs,
}) => {
  const [openTopUps, setOpenTopUps] = useState<Record<string, boolean>>({});
  const [openHistory, setOpenHistory] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterId>('all');
  const [sortBy, setSortBy] = useState<LimitSortId>('default');
  const [showHiddenDrawer, setShowHiddenDrawer] = useState(false);
  const [lastHidden, setLastHidden] = useState<{ hash: string; title: string } | null>(null);
  const [subKindFilter, setSubKindFilter] = useState<SubKindFilterId>('all');
  const [subSearch, setSubSearch] = useState('');
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (!foreground || now !== undefined) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [foreground, now]);

  const effectiveNow = now ?? clock;

  const hideUncollected = prefs.hideUncollected;
  const showRemaining = prefs.showRemaining;
  const hiddenHashes = prefs.hiddenAccountHashes;

  const setHideUncollected = (updater: boolean | ((prev: boolean) => boolean)) => {
    const nextValue = typeof updater === 'function' ? updater(hideUncollected) : updater;
    onChangePrefs({ ...prefs, hideUncollected: nextValue });
  };

  const setShowRemaining = (updater: boolean | ((prev: boolean) => boolean)) => {
    const nextValue = typeof updater === 'function' ? updater(showRemaining) : updater;
    onChangePrefs({ ...prefs, showRemaining: nextValue });
  };

  useEffect(() => {
    setStatusFilter('all');
    setOpenHistory('');
    setLastHidden(null);
  }, [deviceId]);

  useEffect(() => {
    if (quotaTab !== 'subscriptions') {
      setSubKindFilter('all');
      setSubSearch('');
    }
  }, [quotaTab]);

  const hiddenSet = useMemo(() => new Set(hiddenHashes), [hiddenHashes]);

  useEffect(() => {
    if (lastHidden && !hiddenSet.has(lastHidden.hash)) {
      setLastHidden(null);
    }
  }, [lastHidden, hiddenSet]);

  const subscriptionSummary = useMemo(() => {
    const rows = subscriptions?.subscriptions || [];
    const monthlyMap = new Map<string, { currency: string; sum: number; count: number }>();
    const topupMap = new Map<string, { currency: string; sum: number; count: number }>();
    let otherRecurringCount = 0;
    let nearestTargetMs = Infinity;
    let nearestRenewal: {
      title: string;
      countdown: string;
      targetDate: string;
    } | null = null;
    const nowMs = effectiveNow;

    for (const row of rows) {
      const amt = MonitorModel.subscriptionAmount(row);
      const currency = (row.currency || 'USD').toUpperCase();
      if (row.kind === 'subscription') {
        const interval = String(row.interval || '').toLowerCase();
        const intervalCount = MonitorModel.count(row.intervalCount) || 1;
        if (interval === 'month' && intervalCount === 1 && amt !== null && amt > 0) {
          const prev = monthlyMap.get(currency) || { currency, sum: 0, count: 0 };
          prev.sum += amt;
          prev.count += 1;
          monthlyMap.set(currency, prev);
        } else {
          otherRecurringCount += 1;
        }
      } else if (row.kind === 'topup') {
        if (amt !== null && amt > 0) {
          const prev = topupMap.get(currency) || { currency, sum: 0, count: 0 };
          prev.sum += amt;
          prev.count += 1;
          topupMap.set(currency, prev);
        }
      }

      const renewalTarget = row.nextRenewalOverride || row.endDate;
      if (renewalTarget) {
        const parsedMs = Date.parse(renewalTarget);
        if (Number.isFinite(parsedMs) && parsedMs > nowMs && parsedMs < nearestTargetMs) {
          nearestTargetMs = parsedMs;
          nearestRenewal = {
            title: row.planName || providerName(row.provider),
            countdown: formatRelativeCountdown(
              renewalTarget,
              nowMs,
              row.autoRenew ? '即将续费' : '已到期',
            ),
            targetDate: renewalTarget,
          };
        }
      }
    }

    return {
      monthlyCurrencies: Array.from(monthlyMap.values()),
      topupCurrencies: Array.from(topupMap.values()),
      otherRecurringCount,
      nearestRenewal,
    };
  }, [subscriptions, effectiveNow]);

  const groups = useMemo(
    () => MonitorModel.limitGroups(providers, stats, deviceId, limitAccountPresentation),
    [providers, stats, deviceId, limitAccountPresentation],
  );

  const enrichedGroups = useMemo(() => {
    return groups.map((group) => {
      const items = group.providers.map((provider, itemIdx) => {
        const account = MonitorModel.limitAccount(
          provider,
          stats,
          deviceId,
          limitAccountPresentation,
        );
        const windows = MonitorModel.limitWindows(provider);
        const quotas = windows.map((win) => ({
          win,
          q: MonitorModel.quota(provider, win, { showUsed: !showRemaining }),
        }));
        const spend = MonitorModel.limitSpend(provider);
        const balanceDetails = MonitorModel.limitBalanceDetails(provider);
        const hasHistory = MonitorModel.limitHasHistory(provider);
        const isHealthy = provider.status === 'ok' && !provider.stale;
        const isAbnormal = Boolean(
          provider.stale || (provider.status && provider.status !== 'ok'),
        );
        const pressures = quotas.map(({ q }) => {
          if (q.percent === null) return -1;
          return q.remaining ? 100 - q.percent : q.percent;
        });
        const maxPressure = pressures.length ? Math.max(...pressures) : -1;
        const isWarn =
          hasHistory &&
          quotas.some(
            ({ q }) =>
              q.percent !== null && (q.remaining ? q.percent < 15 : q.percent > 85),
          );
        const updatedMs = Date.parse(provider.updatedAt || '') || 0;
        const displayTitle = account.productLabel || providerName(provider.provider);
        const searchIndex = [
          displayTitle,
          providerName(provider.provider),
          provider.provider,
          account.displayName,
          provider.accountName,
          provider.accountEmail,
          provider.planLabel,
          provider.accountLabel,
          account.regionLabel,
          account.sourceLabel,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase();

        return {
          itemKey: `${group.key}:${itemIdx}`,
          provider,
          account,
          accountHash: sha256Hex(account.key),
          windows,
          quotas,
          spend,
          balanceDetails,
          hasHistory,
          isHealthy,
          isAbnormal,
          isWarn,
          maxPressure,
          updatedMs,
          displayTitle,
          searchIndex,
        };
      });

      return {
        ...group,
        items,
        maxPressure: Math.max(-1, ...items.map((item) => item.maxPressure)),
        maxUpdatedMs: Math.max(0, ...items.map((item) => item.updatedMs)),
      };
    });
  }, [groups, stats, deviceId, limitAccountPresentation, showRemaining]);

  const allItems = useMemo(
    () => enrichedGroups.flatMap((group) => group.items),
    [enrichedGroups],
  );

  const summary = useMemo(() => {
    const collected = allItems.filter((item) => item.hasHistory);
    const uncollected = allItems.filter((item) => !item.hasHistory);
    const warn = collected.filter((item) => item.isWarn);
    const healthy = collected.filter((item) => item.isHealthy);
    const abnormal = allItems.filter((item) => item.isAbnormal);
    const abnormalSeg = abnormal.length;
    const warnSeg = allItems.filter((item) => !item.isAbnormal && item.isWarn).length;
    const healthySeg = allItems.filter(
      (item) => !item.isAbnormal && !item.isWarn && item.hasHistory && item.isHealthy,
    ).length;
    const uncollectedSeg = Math.max(0, allItems.length - abnormalSeg - warnSeg - healthySeg);
    const autoHideableCount = allItems.filter((item) => {
      const isManualHidden = hiddenSet.has(item.accountHash);
      const needsAccountLogin = Boolean(
        item.provider.accountKey && item.provider.status === 'unauthorized',
      );
      return !isManualHidden && !item.hasHistory && !needsAccountLogin;
    }).length;
    return {
      total: allItems.length,
      collectedCount: collected.length,
      uncollectedCount: uncollected.length,
      autoHideableCount,
      warnCount: warn.length,
      healthyCount: healthy.length,
      abnormalCount: abnormal.length,
      healthySeg,
      warnSeg,
      abnormalSeg,
      uncollectedSeg,
    };
  }, [allItems, hiddenSet]);

  useEffect(() => {
    if (
      (statusFilter === 'warn' && summary.warnCount === 0) ||
      (statusFilter === 'abnormal' && summary.abnormalCount === 0) ||
      (statusFilter === 'healthy' && summary.healthyCount === 0) ||
      (statusFilter === 'collected' && summary.collectedCount === 0)
    ) {
      setStatusFilter('all');
    }
  }, [
    statusFilter,
    summary.warnCount,
    summary.abnormalCount,
    summary.healthyCount,
    summary.collectedCount,
  ]);

  const nextResetSpotlight = useMemo(() => {
    const nowMs = effectiveNow;
    let bestMs = Infinity;
    let best: { title: string; windowLabel: string; countdown: string } | null = null;
    for (const item of allItems) {
      if (!item.hasHistory && !item.isHealthy) continue;
      for (const { win, q } of item.quotas) {
        if (!win.resetsAt) continue;
        const parsedMs = Date.parse(win.resetsAt);
        if (!Number.isFinite(parsedMs) || parsedMs <= nowMs || parsedMs >= bestMs) continue;
        bestMs = parsedMs;
        best = {
          title: item.displayTitle,
          windowLabel: q.label,
          countdown: formatRelativeCountdown(
            win.resetsAt,
            nowMs,
            win.boundaryKind === 'expiry' ? '已到期' : '即将重置',
          ),
        };
      }
    }
    return best;
  }, [allItems, effectiveNow]);

  const keyword = search.trim().toLocaleLowerCase();

  const {
    visibleGroups,
    visibleCount,
    autoHiddenItems,
    manualHiddenItems,
    hiddenSearchMatches,
  } = useMemo(() => {
    const autoHidden: typeof allItems = [];
    const manualHidden: typeof allItems = [];
    let hiddenMatches = 0;

    const matchStatus = (item: (typeof allItems)[number]) => {
      if (statusFilter === 'collected') return item.hasHistory;
      if (statusFilter === 'healthy') return item.hasHistory && item.isHealthy;
      if (statusFilter === 'warn') return item.isWarn;
      if (statusFilter === 'abnormal') return item.isAbnormal;
      return true;
    };

    const filteredGroups = enrichedGroups
      .map((group) => {
        const keptItems = group.items.filter((item) => {
          const isManualHidden = hiddenSet.has(item.accountHash);
          const { provider } = item;
          const needsAccountLogin = Boolean(
            provider.accountKey && provider.status === 'unauthorized',
          );
          const isAutoHidden = hideUncollected && !item.hasHistory && !needsAccountLogin;
          if (isManualHidden) {
            manualHidden.push(item);
            if (keyword && item.searchIndex.includes(keyword)) hiddenMatches += 1;
            return false;
          }
          if (isAutoHidden) {
            autoHidden.push(item);
            if (keyword && item.searchIndex.includes(keyword)) hiddenMatches += 1;
            return false;
          }
          if (keyword && !item.searchIndex.includes(keyword)) return false;
          return matchStatus(item);
        });

        if (!keptItems.length) return null;
        const maxPressure = Math.max(-1, ...keptItems.map((item) => item.maxPressure));
        const maxUpdatedMs = Math.max(0, ...keptItems.map((item) => item.updatedMs));
        return {
          ...group,
          items: keptItems,
          linked:
            keptItems.some((item) => item.provider.source === 'oauth') &&
            keptItems.some((item) => item.provider.source === 'api'),
          maxPressure,
          maxUpdatedMs,
        };
      })
      .filter((group): group is NonNullable<typeof group> => group !== null);

    if (sortBy === 'pressure') {
      filteredGroups.sort(
        (a, b) =>
          Number(b.items.some((i) => i.isWarn)) - Number(a.items.some((i) => i.isWarn)) ||
          b.maxPressure - a.maxPressure ||
          Number(b.items.some((i) => i.hasHistory)) - Number(a.items.some((i) => i.hasHistory)),
      );
    } else if (sortBy === 'updated') {
      filteredGroups.sort((a, b) => b.maxUpdatedMs - a.maxUpdatedMs);
    }

    const totalVisible = filteredGroups.reduce((acc, g) => acc + g.items.length, 0);

    return {
      visibleGroups: filteredGroups,
      visibleCount: totalVisible,
      autoHiddenItems: autoHidden,
      manualHiddenItems: manualHidden,
      hiddenSearchMatches: hiddenMatches,
    };
  }, [enrichedGroups, hiddenSet, hideUncollected, keyword, statusFilter, sortBy]);

  if (quotaTab === 'subscriptions') {
    const rows = subscriptions?.subscriptions;
    const totalCount = rows?.length || 0;
    const subCount = rows?.filter((r) => r.kind === 'subscription').length || 0;
    const topupCount = rows?.filter((r) => r.kind === 'topup').length || 0;
    const subKeyword = subSearch.trim().toLocaleLowerCase();
    const keyedRows = (rows || []).map((row, origIdx) => ({
      row,
      stableKey:
        row.id || `${row.provider}-${row.planName || ''}-${row.startDate || ''}-${origIdx}`,
    }));
    const filteredRows = keyedRows.filter(({ row }) => {
      if (subKindFilter !== 'all' && row.kind !== subKindFilter) return false;
      if (!subKeyword) return true;
      const hay = [
        row.planName,
        providerName(row.provider),
        row.provider,
        row.binding?.accountEmail,
        row.binding?.profileName,
        row.note,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      return hay.includes(subKeyword);
    });
    const nowMs = effectiveNow;

    return (
      <div className="space-y-3.5">
        {subscriptionError && (
          <InlineAlert tone="amber" role="alert">
            {subscriptionError}
            {subscriptions ? '；以下为上次读取的订阅' : ''}
          </InlineAlert>
        )}

        {!rows ? (
          <EmptyState
            icon={<CreditCard className="w-6 h-6" />}
            title="尚未读到共享订阅"
            description={
              subscriptionError ? '点击右上角刷新重试。' : '正在从 Hub 读取共享订阅…'
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="w-6 h-6" />}
            title="共享订阅为空"
            description="在桌面端管理订阅后，手机会自动读取更新。"
          />
        ) : (
          <>
            <section className="glass-hero rounded-3xl p-4 sm:p-5 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-[var(--tm-accent-text)]">
                    Hub 共享订阅账本
                  </p>
                  <p className="text-xl font-bold text-[var(--tm-text-primary)] tabular-nums mt-0.5">
                    <span className="font-mono-tabular">{totalCount}</span> 项记录
                  </p>
                  <p className="text-[11px] text-[var(--tm-text-muted)] mt-0.5">
                    不随设备或统计周期筛选 · 保持原币种
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 text-[11px] tabular-nums shrink-0">
                  <span className="px-2.5 py-0.5 rounded-full bg-[var(--tm-success-soft-bg)] border border-[var(--tm-success-soft-border)] text-[var(--tm-success-text)] font-medium">
                    周期订阅 <span className="font-mono-tabular">{subCount}</span>
                  </span>
                  {topupCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)] font-medium">
                      预存充值 <span className="font-mono-tabular">{topupCount}</span>
                    </span>
                  )}
                </div>
              </div>

              {(subscriptionSummary.monthlyCurrencies.length > 0 ||
                subscriptionSummary.topupCurrencies.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {subscriptionSummary.monthlyCurrencies.map((entry) => (
                    <div
                      key={`monthly-${entry.currency}`}
                      className="glass-inset rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-[var(--tm-text-secondary)]">
                          月度订阅 ({entry.currency})
                        </div>
                        <div className="text-[11px] text-[var(--tm-text-muted)] tabular-nums">
                          {entry.count} 项按月计费
                        </div>
                      </div>
                      <div className="text-sm font-bold text-[var(--tm-success-text)] font-mono-tabular shrink-0">
                        {MonitorModel.money(entry.sum, entry.currency)}/月
                      </div>
                    </div>
                  ))}
                  {subscriptionSummary.topupCurrencies.map((entry) => (
                    <div
                      key={`topup-${entry.currency}`}
                      className="glass-inset rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-[var(--tm-text-secondary)]">
                          累计预存 ({entry.currency})
                        </div>
                        <div className="text-[11px] text-[var(--tm-text-muted)] tabular-nums">
                          {entry.count} 项预存账户
                        </div>
                      </div>
                      <div className="text-sm font-bold text-[var(--tm-accent-text)] font-mono-tabular shrink-0">
                        {MonitorModel.money(entry.sum, entry.currency)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(subscriptionSummary.nearestRenewal || subscriptionSummary.otherRecurringCount > 0) && (
                <div className="flex items-center justify-between gap-2 text-[11px] pt-2 border-t border-[var(--tm-border-subtle)] flex-wrap">
                  {subscriptionSummary.nearestRenewal ? (
                    <span className="inline-flex items-center gap-1.5 text-[var(--tm-text-secondary)] min-w-0">
                      <Calendar className="w-3.5 h-3.5 text-[var(--tm-accent)] shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        最近续费 ·{' '}
                        <strong className="text-[var(--tm-text-primary)]">
                          {subscriptionSummary.nearestRenewal.title}
                        </strong>
                      </span>
                    </span>
                  ) : (
                    <span className="text-[var(--tm-text-muted)]">
                      含 {subscriptionSummary.otherRecurringCount} 项非按月周期订阅
                    </span>
                  )}
                  {subscriptionSummary.nearestRenewal?.countdown && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)] font-medium tabular-nums shrink-0">
                      {subscriptionSummary.nearestRenewal.countdown}
                    </span>
                  )}
                </div>
              )}
            </section>

            {((subCount > 0 && topupCount > 0) || totalCount > 4 || subSearch !== '') && (
              <div className="space-y-2.5">
                {(totalCount > 4 || subSearch !== '') && (
                  <SearchField
                    value={subSearch}
                    onChange={setSubSearch}
                    placeholder="搜索方案、服务商、邮箱或备注…"
                    ariaLabel="搜索共享订阅"
                    clearAriaLabel="清除订阅搜索"
                  />
                )}
                {subCount > 0 && topupCount > 0 && (
                  <div
                    role="group"
                    aria-label="按订阅类型筛选"
                    className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
                  >
                    {(
                      [
                        ['all', `全部 ${totalCount}`],
                        ['subscription', `周期订阅 ${subCount}`],
                        ['topup', `预存充值 ${topupCount}`],
                      ] as const
                    ).map(([kindId, label]) => {
                      const active = subKindFilter === kindId;
                      return (
                        <button
                          key={kindId}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSubKindFilter(kindId)}
                          className={`shrink-0 min-h-[40px] px-3.5 rounded-full text-xs font-semibold border transition-all active:scale-[0.98] whitespace-nowrap tabular-nums ${
                            active
                              ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]'
                              : 'glass-inset text-[var(--tm-text-secondary)] hover:border-[var(--tm-border-strong)]'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {filteredRows.length === 0 ? (
              <EmptyState
                compact
                icon={<CreditCard className="w-5 h-5" />}
                title="没有匹配的订阅记录"
                description="尝试清空搜索关键词或切回全部订阅类型。"
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setSubKindFilter('all');
                      setSubSearch('');
                    }}
                    className="min-h-[44px] px-4 rounded-xl bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-xs font-semibold text-[var(--tm-accent-text)] inline-flex items-center gap-1.5 active:scale-[0.98] transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>重置筛选</span>
                  </button>
                }
              />
            ) : (
              filteredRows.map(({ row, stableKey: key }) => {
                const intervalLabel =
                  ({ month: '月', year: '年', week: '周', day: '天' } as Record<string, string>)[
                    row.interval || ''
                  ] ||
                  row.interval ||
                  '';
                const amount = MonitorModel.subscriptionAmount(row);
                const isExpanded = Boolean(openTopUps[key]);
                const renewalTarget = row.nextRenewalOverride || row.endDate;
                const renewalCountdown = formatRelativeCountdown(
                  renewalTarget,
                  nowMs,
                  row.autoRenew ? '即将续费' : '已到期',
                );
                const renewalTargetMs = renewalTarget ? Date.parse(renewalTarget) : NaN;
                const renewalDiffMs = Number.isFinite(renewalTargetMs)
                  ? renewalTargetMs - nowMs
                  : Infinity;
                const renewalBadgeTone =
                  renewalDiffMs <= 0
                    ? 'bg-[var(--tm-danger-soft-bg)] border-[var(--tm-danger-soft-border)] text-[var(--tm-danger-text)]'
                    : renewalDiffMs <= 7 * 86400_000
                      ? 'bg-[var(--tm-warning-soft-bg)] border-[var(--tm-warning-soft-border)] text-[var(--tm-warning-text)]'
                      : 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]';
                const pTone = clientTone(row.provider);

                return (
                  <section key={key} className="glass-panel rounded-3xl p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <span
                          aria-hidden="true"
                          className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${pTone.dot}`}
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-[var(--tm-text-primary)] break-words">
                            {row.planName || providerName(row.provider)}
                          </h3>
                          <p className="text-xs text-[var(--tm-text-muted)] mt-0.5 truncate">
                            {providerName(row.provider)} ·{' '}
                            {row.binding?.accountEmail || row.binding?.profileName || '未绑定账户'}
                          </p>
                        </div>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[var(--tm-success-soft-bg)] border border-[var(--tm-success-soft-border)] text-[11px] font-medium text-[var(--tm-success-text)] shrink-0 whitespace-nowrap">
                        {row.kind === 'subscription' ? '周期订阅' : '预存充值'}
                      </span>
                    </div>

                    <div className="my-3.5 flex items-baseline justify-between gap-2 flex-wrap">
                      <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                        <div className="text-2xl font-bold text-[var(--tm-success-text)] font-mono-tabular">
                          {MonitorModel.money(amount, row.currency)}
                        </div>
                        <span className="text-xs text-[var(--tm-text-muted)] tabular-nums">
                          {row.kind === 'subscription'
                            ? `每 ${MonitorModel.count(row.intervalCount) || 1} ${intervalLabel} · ${
                                row.autoRenew ? '自动续费' : '不自动续费'
                              }`
                            : '累计充值金额'}
                        </span>
                      </div>
                      {renewalCountdown && (
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-medium tabular-nums shrink-0 ${renewalBadgeTone}`}
                        >
                          <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span>{renewalCountdown}</span>
                        </span>
                      )}
                    </div>

                    <dl className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl glass-inset text-xs">
                      <div className="min-w-0">
                        <dt className="text-[11px] text-[var(--tm-text-muted)]">开始日期</dt>
                        <dd className="font-mono-tabular text-[var(--tm-text-primary)] mt-0.5">
                          {row.startDate || '—'}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[11px] text-[var(--tm-text-muted)]">结束日期</dt>
                        <dd className="font-mono-tabular text-[var(--tm-text-primary)] mt-0.5">
                          {row.endDate || '—'}
                        </dd>
                      </div>
                      {row.nextRenewalOverride && (
                        <div className="col-span-2 min-w-0 pt-1.5 border-t border-[var(--tm-border-subtle)]">
                          <dt className="text-[11px] text-[var(--tm-text-muted)]">下次续费</dt>
                          <dd className="font-mono-tabular text-[var(--tm-accent-text)] mt-0.5">
                            {row.nextRenewalOverride}
                          </dd>
                        </div>
                      )}
                    </dl>

                    {row.note && (
                      <p className="text-xs text-[var(--tm-text-secondary)] mt-3 pt-2.5 border-t border-[var(--tm-border-subtle)] leading-relaxed break-words">
                        {row.note}
                      </p>
                    )}

                    {row.topUps && row.topUps.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-[var(--tm-border-subtle)]">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenTopUps((prev) => ({ ...prev, [key]: !prev[key] }))
                          }
                          aria-expanded={isExpanded}
                          className="w-full min-h-[44px] flex items-center justify-between text-xs font-medium text-[var(--tm-accent-text)] hover:opacity-90 transition-opacity"
                        >
                          <span className="tabular-nums">充值记录（{row.topUps.length} 笔）</span>
                          <ChevronDown
                            aria-hidden="true"
                            className={`w-4 h-4 transition-transform duration-150 ${
                              isExpanded ? 'rotate-180 text-[var(--tm-accent)]' : ''
                            }`}
                          />
                        </button>

                        {isExpanded && (
                          <div className="mt-2 space-y-1.5">
                            {row.topUps.map((topup, tIdx) => (
                              <div
                                key={`${topup.date}-${tIdx}`}
                                className="flex items-center justify-between text-xs py-2.5 px-3 rounded-xl glass-inset font-mono-tabular"
                              >
                                <span className="text-[var(--tm-text-secondary)]">{topup.date}</span>
                                <span className="text-[var(--tm-success-text)] font-semibold">
                                  {MonitorModel.money(
                                    MonitorModel.numeric(topup.amountMinor) === null
                                      ? null
                                      : topup.amountMinor / 100,
                                    row.currency,
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                );
              })
            )}

            <p className="text-[11px] text-[var(--tm-text-muted)] text-center leading-relaxed pt-2 pb-2 tabular-nums">
              共享列表更新{' '}
              <span className="font-mono-tabular">{formatShortTime(subscriptions.updatedAt)}</span>
              <br />
              订阅金额保持原币种
            </p>
          </>
        )}
      </div>
    );
  }

  // Default Tab: Account Quotas & Limits
  if (!providers.length) {
    return (
      <EmptyState
        icon={<Gauge className="w-6 h-6" />}
        title="暂无额度数据"
        description="请在采集设备配置额度账户。手机仅展示 Hub 已收到的读数。"
      />
    );
  }

  const toggleManualHide = (accountHash: string, title?: string) => {
    const isAlreadyHidden = hiddenHashes.includes(accountHash);
    const nextHashes = isAlreadyHidden
      ? hiddenHashes.filter((item) => item !== accountHash)
      : [...hiddenHashes, accountHash];
    onChangePrefs({ ...prefs, hiddenAccountHashes: nextHashes });
    if (!isAlreadyHidden && title) {
      setLastHidden({ hash: accountHash, title });
    } else if (lastHidden?.hash === accountHash) {
      setLastHidden(null);
    }
  };

  const showControlsBar =
    allItems.length > 3 ||
    summary.warnCount > 0 ||
    summary.abnormalCount > 0 ||
    search !== '' ||
    statusFilter !== 'all' ||
    sortBy !== 'default';

  const statusFilterOptions: Array<[StatusFilterId, string]> = [
    ['all', `全部 ${summary.total}`],
    ['collected', `有采集 ${summary.collectedCount}`],
    ...(summary.healthyCount > 0
      ? ([['healthy', `正常 ${summary.healthyCount}`]] as Array<[StatusFilterId, string]>)
      : []),
    ...(summary.warnCount > 0
      ? ([['warn', `预警 ${summary.warnCount}`]] as Array<[StatusFilterId, string]>)
      : []),
    ...(summary.abnormalCount > 0
      ? ([['abnormal', `异常 ${summary.abnormalCount}`]] as Array<[StatusFilterId, string]>)
      : []),
  ];

  const hasLimitsFilter = search !== '' || statusFilter !== 'all' || sortBy !== 'default';

  return (
    <div className="space-y-3.5">
      {historyError && (
        <InlineAlert tone="amber" role="alert">
          {historyError}
        </InlineAlert>
      )}

      {lastHidden && (
        <InlineAlert
          tone="sky"
          role="status"
          ariaLive="polite"
          action={
            <button
              type="button"
              onClick={() => toggleManualHide(lastHidden.hash)}
              className="min-h-[40px] px-3 rounded-xl bg-[var(--tm-accent-soft-bg)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.98] border border-[var(--tm-accent-soft-border)] text-xs font-semibold text-[var(--tm-accent-text)] inline-flex items-center gap-1 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>撤销</span>
            </button>
          }
        >
          已隐藏「{lastHidden.title}」，可随时在底部恢复。
        </InlineAlert>
      )}

      {/* 1. 额度遥测摘要头 */}
      <section data-limits-summary="true" className="glass-hero rounded-3xl p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--tm-accent-text)]">
              <Gauge className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>实时额度监控</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2 flex-wrap tabular-nums">
              <span className="text-2xl font-extrabold text-[var(--tm-text-primary)] font-mono-tabular">
                {summary.collectedCount}
              </span>
              <span className="text-xs text-[var(--tm-text-secondary)]">
                / <span className="font-mono-tabular">{summary.total}</span> 个账户有采集数据
              </span>
            </div>
          </div>

          <button
            type="button"
            data-limits-mode-toggle="true"
            aria-pressed={showRemaining}
            onClick={() => setShowRemaining((prev) => !prev)}
            className="min-h-[44px] px-3.5 py-1.5 rounded-full bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.98] border border-[var(--tm-border-default)] text-xs font-semibold text-[var(--tm-accent-text)] transition-all shrink-0 inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--tm-accent)] shrink-0" aria-hidden="true" />
            <span>{showRemaining ? '剩余优先' : '已用优先'}</span>
          </button>
        </div>

        {/* Proportional health distribution bar (outside [data-limit-account]) */}
        {summary.total > 0 && (
          <div
            aria-label={`健康分布：正常 ${summary.healthySeg}，预警 ${summary.warnSeg}，异常 ${summary.abnormalSeg}，无历史 ${summary.uncollectedSeg}`}
            className="h-1.5 w-full rounded-full bg-[var(--tm-track-bg)] overflow-hidden flex gap-0.5"
          >
            {summary.healthySeg > 0 && (
              <div
                style={{ width: `${(summary.healthySeg / summary.total) * 100}%` }}
                className="h-full bg-[var(--tm-success)] rounded-full"
              />
            )}
            {summary.warnSeg > 0 && (
              <div
                style={{ width: `${(summary.warnSeg / summary.total) * 100}%` }}
                className="h-full bg-[var(--tm-danger)] rounded-full"
              />
            )}
            {summary.abnormalSeg > 0 && (
              <div
                style={{ width: `${(summary.abnormalSeg / summary.total) * 100}%` }}
                className="h-full bg-[var(--tm-warning)] rounded-full"
              />
            )}
            {summary.uncollectedSeg > 0 && (
              <div
                style={{ width: `${(summary.uncollectedSeg / summary.total) * 100}%` }}
                className="h-full bg-[var(--tm-text-subtle)] opacity-60 rounded-full"
              />
            )}
          </div>
        )}

        {/* Equalized 4-column interactive KPI telemetry strip */}
        <div className="grid grid-cols-4 gap-1 p-1.5 rounded-2xl glass-inset tabular-nums">
          <button
            type="button"
            disabled={summary.collectedCount === 0}
            aria-pressed={statusFilter === 'collected'}
            onClick={() =>
              setStatusFilter((prev) => (prev === 'collected' ? 'all' : 'collected'))
            }
            className={`min-h-[44px] rounded-xl py-1.5 px-1 text-center transition-all active:scale-95 disabled:opacity-50 flex flex-col items-center justify-center ${
              statusFilter === 'collected'
                ? 'bg-[var(--tm-accent-soft-bg)] ring-1 ring-[var(--tm-accent-soft-border)]'
                : 'hover:bg-[var(--tm-bg-row-hover)]'
            }`}
          >
            <div className="text-sm font-bold font-mono-tabular text-[var(--tm-accent-text)] leading-tight">
              {summary.collectedCount}
            </div>
            <div className="text-[11px] text-[var(--tm-text-secondary)] font-medium mt-0.5">
              有采集
            </div>
          </button>

          <button
            type="button"
            disabled={summary.healthyCount === 0}
            aria-pressed={statusFilter === 'healthy'}
            onClick={() =>
              setStatusFilter((prev) => (prev === 'healthy' ? 'all' : 'healthy'))
            }
            className={`min-h-[44px] rounded-xl py-1.5 px-1 text-center transition-all active:scale-95 disabled:opacity-50 flex flex-col items-center justify-center ${
              statusFilter === 'healthy'
                ? 'bg-[var(--tm-success-soft-bg)] ring-1 ring-[var(--tm-success-soft-border)]'
                : 'hover:bg-[var(--tm-bg-row-hover)]'
            }`}
          >
            <div
              className={`text-sm font-bold font-mono-tabular leading-tight ${
                summary.healthyCount > 0
                  ? 'text-[var(--tm-success-text)]'
                  : 'text-[var(--tm-text-subtle)]'
              }`}
            >
              {summary.healthyCount}
            </div>
            <div
              className={`text-[11px] font-medium mt-0.5 ${
                summary.healthyCount > 0
                  ? 'text-[var(--tm-success-text)]'
                  : 'text-[var(--tm-text-subtle)]'
              }`}
            >
              正常
            </div>
          </button>

          <button
            type="button"
            disabled={summary.warnCount === 0}
            aria-pressed={statusFilter === 'warn'}
            onClick={() => setStatusFilter((prev) => (prev === 'warn' ? 'all' : 'warn'))}
            className={`min-h-[44px] rounded-xl py-1.5 px-1 text-center transition-all active:scale-95 disabled:opacity-50 flex flex-col items-center justify-center ${
              statusFilter === 'warn'
                ? 'bg-[var(--tm-danger-soft-bg)] ring-1 ring-[var(--tm-danger-soft-border)]'
                : 'hover:bg-[var(--tm-bg-row-hover)]'
            }`}
          >
            <div
              className={`text-sm font-bold font-mono-tabular leading-tight ${
                summary.warnCount > 0
                  ? 'text-[var(--tm-danger-text)]'
                  : 'text-[var(--tm-text-subtle)]'
              }`}
            >
              {summary.warnCount}
            </div>
            <div
              className={`text-[11px] font-medium mt-0.5 ${
                summary.warnCount > 0
                  ? 'text-[var(--tm-danger-text)]'
                  : 'text-[var(--tm-text-subtle)]'
              }`}
            >
              预警
            </div>
          </button>

          <button
            type="button"
            disabled={summary.abnormalCount === 0}
            aria-pressed={statusFilter === 'abnormal'}
            onClick={() =>
              setStatusFilter((prev) => (prev === 'abnormal' ? 'all' : 'abnormal'))
            }
            className={`min-h-[44px] rounded-xl py-1.5 px-1 text-center transition-all active:scale-95 disabled:opacity-50 flex flex-col items-center justify-center ${
              statusFilter === 'abnormal'
                ? 'bg-[var(--tm-warning-soft-bg)] ring-1 ring-[var(--tm-warning-soft-border)]'
                : 'hover:bg-[var(--tm-bg-row-hover)]'
            }`}
          >
            <div
              className={`text-sm font-bold font-mono-tabular leading-tight ${
                summary.abnormalCount > 0
                  ? 'text-[var(--tm-warning-text)]'
                  : 'text-[var(--tm-text-subtle)]'
              }`}
            >
              {summary.abnormalCount}
            </div>
            <div
              className={`text-[11px] font-medium mt-0.5 ${
                summary.abnormalCount > 0
                  ? 'text-[var(--tm-warning-text)]'
                  : 'text-[var(--tm-text-subtle)]'
              }`}
            >
              异常
            </div>
          </button>
        </div>

        {/* Next upcoming quota reset spotlight */}
        {nextResetSpotlight && (
          <div className="flex items-center justify-between gap-2 text-[11px] pt-2 border-t border-[var(--tm-border-subtle)] flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[var(--tm-text-secondary)] min-w-0">
              <Clock className="w-3.5 h-3.5 text-[var(--tm-accent)] shrink-0" aria-hidden="true" />
              <span className="truncate">
                最近重置 ·{' '}
                <strong className="text-[var(--tm-text-primary)]">{nextResetSpotlight.title}</strong>{' '}
                · {nextResetSpotlight.windowLabel}
              </span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)] font-medium tabular-nums shrink-0">
              {nextResetSpotlight.countdown}
            </span>
          </div>
        )}

        {summary.autoHideableCount > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              data-limits-hide-uncollected="true"
              aria-pressed={hideUncollected}
              onClick={() => setHideUncollected((prev) => !prev)}
              className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-all active:scale-[0.98] tabular-nums ${
                hideUncollected
                  ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]'
                  : 'bg-[var(--tm-bg-control)] border-[var(--tm-border-default)] text-[var(--tm-text-secondary)] hover:border-[var(--tm-border-strong)]'
              }`}
            >
              {hideUncollected ? (
                <EyeOff className="w-3.5 h-3.5 text-[var(--tm-accent-text)] shrink-0" aria-hidden="true" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-[var(--tm-text-muted)] shrink-0" aria-hidden="true" />
              )}
              <span>
                {hideUncollected
                  ? `已隐藏无历史 (${autoHiddenItems.length})`
                  : `隐藏无历史 (${summary.autoHideableCount})`}
              </span>
            </button>
          </div>
        )}
      </section>

      {/* 2. 搜索、状态筛选与排序栏 */}
      {showControlsBar && (
        <div className="glass-panel rounded-2xl p-3 space-y-2.5">
          {(allItems.length > 4 || search !== '') && (
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="搜索工具、账户、邮箱或来源设备…"
              ariaLabel="搜索额度工具、账户或来源设备"
              clearAriaLabel="清除额度搜索"
              inputProps={{ 'data-limits-search': 'true' }}
            />
          )}

          <div
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
            role="group"
            aria-label="额度状态筛选"
          >
            {statusFilterOptions.map(([fId, fLabel]) => {
              const active = statusFilter === fId;
              const activeTone =
                fId === 'warn'
                  ? 'bg-[var(--tm-danger-soft-bg)] border-[var(--tm-danger-soft-border)] text-[var(--tm-danger-text)]'
                  : fId === 'abnormal'
                    ? 'bg-[var(--tm-warning-soft-bg)] border-[var(--tm-warning-soft-border)] text-[var(--tm-warning-text)]'
                    : fId === 'healthy'
                      ? 'bg-[var(--tm-success-soft-bg)] border-[var(--tm-success-soft-border)] text-[var(--tm-success-text)]'
                      : 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]';
              return (
                <button
                  key={fId}
                  type="button"
                  data-limits-filter={fId}
                  aria-pressed={active}
                  onClick={() => setStatusFilter(fId)}
                  className={`shrink-0 min-h-[40px] px-3.5 rounded-full text-xs font-semibold border transition-all active:scale-[0.98] whitespace-nowrap tabular-nums ${
                    active
                      ? activeTone
                      : 'glass-inset text-[var(--tm-text-secondary)] hover:border-[var(--tm-border-strong)]'
                  }`}
                >
                  {fLabel}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[var(--tm-border-subtle)] flex-wrap">
            <div className="flex items-center gap-2 text-[11px] text-[var(--tm-text-muted)] tabular-nums">
              <span>
                显示{' '}
                <strong className="text-[var(--tm-text-primary)] font-semibold">
                  {visibleCount}
                </strong>{' '}
                项
              </span>
              {hasLimitsFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                    setSortBy('default');
                  }}
                  className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-full bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-border-default)] text-[11px] font-medium text-[var(--tm-accent-text)] active:scale-95 transition-all"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>重置</span>
                </button>
              )}
            </div>

            <SegmentedControl<LimitSortId>
              size="sm"
              tone="accent"
              fullWidth={false}
              ariaLabel="额度排序"
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: 'default', label: '默认', dataAttrs: { 'data-limits-sort': 'default' } },
                { value: 'pressure', label: '按压力', dataAttrs: { 'data-limits-sort': 'pressure' } },
                { value: 'updated', label: '按更新', dataAttrs: { 'data-limits-sort': 'updated' } },
              ]}
            />
          </div>
        </div>
      )}

      {/* 3. 主列表 */}
      {visibleGroups.length === 0 ? (
        <EmptyState
          icon={<Gauge className="w-6 h-6" />}
          title={
            keyword
              ? '没有匹配的可见工具'
              : autoHiddenItems.length > 0 || manualHiddenItems.length > 0
                ? '当前没有可展示的已采集工具'
                : '没有符合筛选条件的工具'
          }
          description={
            hiddenSearchMatches > 0
              ? `已隐藏的工具中有 ${hiddenSearchMatches} 项匹配当前搜索。`
              : autoHiddenItems.length > 0
                ? `有 ${autoHiddenItems.length} 个未采集/未配置工具已被自动隐藏。`
                : '可以清除筛选条件或恢复全部显示。'
          }
          action={
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {(keyword || statusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                  className="min-h-[44px] px-4 rounded-xl glass-inset text-xs font-semibold text-[var(--tm-accent-text)] hover:border-[var(--tm-accent-soft-border)] active:scale-[0.98] transition-all"
                >
                  清除筛选
                </button>
              )}
              {autoHiddenItems.length > 0 && (
                <button
                  type="button"
                  data-limits-show-hidden="true"
                  onClick={() => setHideUncollected(false)}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-xs font-semibold text-[var(--tm-accent-text)] active:scale-[0.98] transition-all tabular-nums"
                >
                  显示无采集历史 ({autoHiddenItems.length})
                </button>
              )}
              {manualHiddenItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onChangePrefs({ ...prefs, hiddenAccountHashes: [] });
                    setLastHidden(null);
                  }}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] text-xs font-semibold text-[var(--tm-text-primary)] active:scale-[0.98] transition-all tabular-nums"
                >
                  恢复手动隐藏 ({manualHiddenItems.length})
                </button>
              )}
            </div>
          }
        />
      ) : (
        visibleGroups.map((group) => (
          <div
            key={group.key}
            className={
              group.linked
                ? 'rounded-[28px] border border-[var(--tm-accent-soft-border)] bg-[var(--tm-accent-soft-bg)] p-2.5 space-y-2.5'
                : 'space-y-3.5'
            }
          >
            {group.linked && (
              <div
                data-limit-linked-group={group.key}
                className="px-3 py-2 rounded-2xl bg-[var(--tm-bg-surface)] border border-[var(--tm-accent-soft-border)] text-xs text-[var(--tm-text-secondary)] flex items-center justify-between gap-2 flex-wrap"
              >
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--tm-accent-text)]">
                  <Link2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{group.label}</span>
                </span>
                <span className="text-[11px] text-[var(--tm-text-muted)]">
                  已验证的 MiniMax 同一账户 · 各产品独立计量
                </span>
              </div>
            )}

            {group.items.map(
              ({
                itemKey,
                provider,
                account,
                accountHash,
                quotas,
                spend,
                balanceDetails,
                hasHistory,
                isHealthy,
                isWarn,
                displayTitle,
              }) => {
                const code = provider.provider === 'minimax' && provider.source === 'oauth';
                const statusText = limitStatusLabel(provider);
                const tone = clientTone(provider.provider);
                const planOrAccountLabel =
                  provider.planLabel ||
                  (provider.provider === 'minimax' ||
                  (provider.provider === 'mimo' && account.productLabel)
                    ? ''
                    : provider.accountLabel);
                const preferEmailPrimary =
                  provider.provider === 'devin' &&
                  !account.displayName &&
                  Boolean(provider.accountEmail);
                const accountTitle = preferEmailPrimary
                  ? provider.accountEmail
                  : account.displayName || provider.accountName || provider.accountEmail;
                const secondaryAccountName = preferEmailPrimary
                  ? provider.accountName && provider.accountName !== provider.accountEmail
                    ? provider.accountName
                    : ''
                  : account.displayName &&
                      provider.accountName &&
                      provider.accountName !== account.displayName
                    ? provider.accountName
                    : '';
                const subMeta = [accountTitle, secondaryAccountName, planOrAccountLabel].filter(
                  Boolean,
                );
                const isHistoryOpen = openHistory === itemKey;

                return (
                  <section
                    key={itemKey}
                    data-limit-account={account.key}
                    className={`glass-panel rounded-3xl p-4 sm:p-5 transition-colors ${
                      isWarn
                        ? 'border-[var(--tm-danger-soft-border)]'
                        : !hasHistory
                          ? 'opacity-90'
                          : ''
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span
                            aria-hidden="true"
                            className="w-7 h-7 rounded-xl bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] flex items-center justify-center shrink-0"
                          >
                            <span className={`w-2.5 h-2.5 rounded-full ${tone.dot}`} />
                          </span>
                          <h3 className="text-[15px] font-bold text-[var(--tm-text-primary)] leading-snug break-words min-w-0">
                            {displayTitle}
                          </h3>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isWarn && isHealthy && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-[var(--tm-danger-soft-bg)] border-[var(--tm-danger-soft-border)] text-[var(--tm-danger-text)] whitespace-nowrap">
                              <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                              <span>预警</span>
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${
                              isHealthy
                                ? 'bg-[var(--tm-success-soft-bg)] border-[var(--tm-success-soft-border)] text-[var(--tm-success-text)]'
                                : 'bg-[var(--tm-warning-soft-bg)] border-[var(--tm-warning-soft-border)] text-[var(--tm-warning-text)]'
                            }`}
                          >
                            <i
                              aria-hidden="true"
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                isHealthy ? 'bg-[var(--tm-success)]' : 'bg-[var(--tm-warning)]'
                              }`}
                            />
                            <span>{statusText}</span>
                          </span>
                        </div>
                      </div>

                      {(account.regionLabel || !hasHistory) && (
                        <div className="flex items-center gap-1.5 flex-wrap pl-9">
                          {account.regionLabel && (
                            <span className="px-2 py-0.5 rounded-full bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] text-[11px] font-medium text-[var(--tm-text-secondary)]">
                              {account.regionLabel}
                            </span>
                          )}
                          {!hasHistory && (
                            <span className="px-2 py-0.5 rounded-full bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] text-[11px] text-[var(--tm-text-muted)]">
                              无采集历史
                            </span>
                          )}
                        </div>
                      )}

                      {subMeta.length > 0 && (
                        <p className="text-xs text-[var(--tm-text-secondary)] break-words pl-9">
                          {subMeta.join(' · ')}
                        </p>
                      )}

                      {!preferEmailPrimary &&
                        (account.displayName || provider.accountName) &&
                        provider.accountEmail && (
                          <p className="text-[11px] font-mono-tabular text-[var(--tm-text-muted)] truncate pl-9">
                            {provider.accountEmail}
                          </p>
                        )}

                      {account.sourceLabel && (
                        <p className="text-[11px] text-[var(--tm-text-muted)] break-words pl-9 inline-flex items-center gap-1">
                          <Server
                            className="w-3 h-3 text-[var(--tm-text-subtle)] shrink-0"
                            aria-hidden="true"
                          />
                          <span>来源设备：{account.sourceLabel}</span>
                        </p>
                      )}
                    </div>

                    {quotas.length > 0 ? (
                      <div className="mt-3.5 space-y-2.5 pt-3 border-t border-[var(--tm-border-subtle)]">
                        {quotas.map(({ win, q }, wIdx) => {
                          const winWarn =
                            q.percent !== null &&
                            (q.remaining ? q.percent < 15 : q.percent > 85);
                          const winElevated =
                            !winWarn &&
                            q.percent !== null &&
                            (q.remaining ? q.percent < 30 : q.percent >= 70);
                          const countdown = win.resetsAt
                            ? formatRelativeCountdown(
                                win.resetsAt,
                                effectiveNow,
                                win.boundaryKind === 'expiry' ? '已到期' : '即将重置',
                              )
                            : '';
                          const needsRemainingPrefix = Boolean(
                            q.remaining && !String(q.value).includes('剩余'),
                          );

                          // Non-meter balance / spend / unlimited windows: typographic figure tile, NO meter bar!
                          if (q.percent === null) {
                            return (
                              <div
                                key={`${win.kind || 'win'}-${wIdx}`}
                                className="rounded-2xl glass-inset p-3.5 space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-[var(--tm-text-secondary)] min-w-0 break-words">
                                    {q.label}
                                  </span>
                                  {countdown && (
                                    <span className="px-2 py-0.5 rounded-full bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-[11px] text-[var(--tm-accent-text)] font-medium tabular-nums shrink-0">
                                      {countdown}
                                    </span>
                                  )}
                                </div>
                                <div
                                  className={`text-xl font-bold font-mono-tabular leading-tight break-words ${
                                    q.value === '无限额'
                                      ? 'text-[var(--tm-accent-text)]'
                                      : q.remaining
                                        ? 'text-[var(--tm-success-text)]'
                                        : 'text-[var(--tm-text-primary)]'
                                  }`}
                                >
                                  {needsRemainingPrefix ? (
                                    <>
                                      <span className="text-xs font-medium font-sans text-[var(--tm-text-muted)]">
                                        剩余
                                      </span>{' '}
                                      <span>{q.value}</span>
                                    </>
                                  ) : (
                                    q.value
                                  )}
                                </div>

                                {q.detail && (
                                  <p className="text-[11px] text-[var(--tm-text-secondary)] font-mono-tabular">
                                    {q.detail}
                                  </p>
                                )}

                                {win.resetsAt && (
                                  <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--tm-text-muted)] tabular-nums flex-wrap pt-0.5">
                                    <span className="inline-flex items-center gap-1">
                                      <Clock
                                        className="w-3 h-3 text-[var(--tm-text-subtle)] shrink-0"
                                        aria-hidden="true"
                                      />
                                      <span>
                                        {win.boundaryKind === 'expiry' ? '到期时间' : '重置时间'}{' '}
                                        <span className="font-mono-tabular">
                                          {formatShortTime(win.resetsAt)}
                                        </span>
                                      </span>
                                    </span>
                                  </div>
                                )}

                                {(q.description ?? win.resetDescription) && (
                                  <p className="text-[11px] text-[var(--tm-text-muted)] break-words leading-relaxed">
                                    {q.description ?? win.resetDescription}
                                  </p>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div
                              key={`${win.kind || 'win'}-${wIdx}`}
                              className={`rounded-2xl border p-3.5 space-y-2 ${
                                winWarn
                                  ? 'bg-[var(--tm-danger-soft-bg)] border-[var(--tm-danger-soft-border)]'
                                  : winElevated
                                    ? 'bg-[var(--tm-warning-soft-bg)] border-[var(--tm-warning-soft-border)]'
                                    : 'bg-[var(--tm-bg-row)] border-[var(--tm-border-subtle)]'
                              }`}
                            >
                              <div className="flex items-baseline justify-between gap-2 text-xs">
                                <span className="text-[var(--tm-text-primary)] font-medium min-w-0 break-words">
                                  {q.label}
                                </span>
                                <span
                                  className={`font-semibold font-mono-tabular shrink-0 ${
                                    winWarn
                                      ? 'text-[var(--tm-danger-text)]'
                                      : winElevated
                                        ? 'text-[var(--tm-warning-text)]'
                                        : 'text-[var(--tm-accent-text)]'
                                  }`}
                                >
                                  {needsRemainingPrefix ? `剩余 ${q.value}` : q.value}
                                </span>
                              </div>

                              <ProgressMeter
                                percent={q.percent}
                                tone={winWarn ? 'danger' : winElevated ? 'amber' : 'sky'}
                                heightClass="h-2"
                              />

                              {q.detail && (
                                <p className="text-[11px] text-[var(--tm-text-secondary)] font-mono-tabular">
                                  {q.detail}
                                </p>
                              )}

                              {win.resetsAt && (
                                <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--tm-text-muted)] tabular-nums flex-wrap">
                                  <span className="inline-flex items-center gap-1">
                                    <Clock
                                      className="w-3 h-3 text-[var(--tm-text-subtle)] shrink-0"
                                      aria-hidden="true"
                                    />
                                    <span>
                                      {win.boundaryKind === 'expiry' ? '到期时间' : '重置时间'}{' '}
                                      <span className="font-mono-tabular">
                                        {formatShortTime(win.resetsAt)}
                                      </span>
                                    </span>
                                  </span>
                                  {countdown && (
                                    <span className="text-[var(--tm-accent-text)] font-medium">
                                      {countdown}
                                    </span>
                                  )}
                                </div>
                              )}

                              {(q.description ?? win.resetDescription) && (
                                <p className="text-[11px] text-[var(--tm-text-muted)] break-words leading-relaxed">
                                  {q.description ?? win.resetDescription}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--tm-text-muted)] mt-3 pt-3 border-t border-[var(--tm-border-subtle)]">
                        暂无额度窗口读数
                      </p>
                    )}

                    {balanceDetails.length > 0 && (
                      <DetailsDisclosure
                        data-balance-details=""
                        summary="余额组成"
                        className="mt-3 pt-1 border-t border-[var(--tm-border-subtle)]"
                        summaryClassName="text-[var(--tm-accent-text)]"
                        bodyClassName="mt-1"
                      >
                        <dl className="space-y-2 text-xs p-3 rounded-2xl glass-inset">
                          {balanceDetails.map((row) => (
                            <div key={row.key} className="flex justify-between gap-2">
                              <dt className="text-[var(--tm-text-muted)]">{row.label}</dt>
                              <dd className="font-mono-tabular text-[var(--tm-text-primary)]">
                                {row.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </DetailsDisclosure>
                    )}

                    {spend.length > 0 && (
                      <div
                        data-limit-spend=""
                        className="mt-3 pt-3 border-t border-[var(--tm-border-subtle)]"
                      >
                        <p className="text-xs font-semibold text-[var(--tm-text-primary)] mb-2">
                          API 现金消费
                        </p>
                        <dl className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl glass-inset text-xs">
                          {spend.map((row) => (
                            <div key={row.key} className="min-w-0">
                              <dt className="text-[var(--tm-text-muted)] text-[11px]">
                                {row.label}
                              </dt>
                              <dd className="font-mono-tabular text-[var(--tm-text-primary)] font-semibold mt-0.5 break-words">
                                {row.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )}

                    {provider.status !== 'ok' && (
                      <InlineAlert tone="amber" className="mt-3">
                        {hasHistory
                          ? '显示的已有读数可能来自上次成功采集。'
                          : '尚未采集到有效读数。'}
                        {code
                          ? '请在来源设备检查 MiniMax Code 登录状态。'
                          : provider.provider === 'minimax'
                            ? '请在来源设备检查此 API 账户的凭据与计费类型。'
                            : '请在来源设备处理账户状态。'}
                      </InlineAlert>
                    )}

                    <div className="mt-3 pt-2.5 border-t border-[var(--tm-border-subtle)] flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[var(--tm-text-muted)] tabular-nums min-w-0 truncate">
                        读数更新{' '}
                        <span className="font-mono-tabular">
                          {formatShortTime(provider.updatedAt)}
                        </span>
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          data-limit-hide={account.key}
                          onClick={() => toggleManualHide(accountHash, displayTitle)}
                          aria-label={`隐藏 ${displayTitle}`}
                          title="隐藏此工具"
                          className="min-w-[44px] min-h-[44px] rounded-xl glass-inset hover:border-[var(--tm-border-strong)] active:scale-[0.97] flex items-center justify-center text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)] transition-all"
                        >
                          <EyeOff className="w-4 h-4" aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          data-quota-history-toggle={account.key}
                          aria-expanded={isHistoryOpen}
                          onClick={() => setOpenHistory(isHistoryOpen ? '' : itemKey)}
                          className={`min-h-[44px] px-3 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-all active:scale-[0.98] ${
                            isHistoryOpen
                              ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]'
                              : 'glass-inset hover:border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]'
                          }`}
                        >
                          <History className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>额度历史</span>
                          <ChevronDown
                            aria-hidden="true"
                            className={`w-3.5 h-3.5 transition-transform duration-150 ${
                              isHistoryOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {isHistoryOpen && (
                      <QuotaHistoryPreview
                        key={`${deviceId}:${itemKey}`}
                        provider={provider}
                        history={history}
                        fetchedAt={fetchedAt}
                        foreground={foreground}
                      />
                    )}
                  </section>
                );
              },
            )}
          </div>
        ))
      )}

      {/* 4. 已隐藏工具收纳条 */}
      {(autoHiddenItems.length > 0 || manualHiddenItems.length > 0) && (
        <section
          data-limits-hidden-banner="true"
          className="glass-panel rounded-3xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-[var(--tm-text-secondary)] min-w-0 tabular-nums">
              <EyeOff className="w-4 h-4 text-[var(--tm-text-muted)] shrink-0" aria-hidden="true" />
              <span className="truncate">
                {autoHiddenItems.length > 0 && `已隐藏 ${autoHiddenItems.length} 个无采集历史`}
                {autoHiddenItems.length > 0 && manualHiddenItems.length > 0 && ' · '}
                {manualHiddenItems.length > 0 && `${manualHiddenItems.length} 个手动隐藏`}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {autoHiddenItems.length > 0 && (
                <button
                  type="button"
                  data-limits-show-hidden="true"
                  onClick={() => setHideUncollected(false)}
                  className="min-h-[44px] px-3.5 rounded-xl bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-xs font-semibold text-[var(--tm-accent-text)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.98] transition-all"
                >
                  显示无历史
                </button>
              )}
              {manualHiddenItems.length > 0 && (
                <button
                  type="button"
                  data-limits-manage-hidden="true"
                  onClick={() => setShowHiddenDrawer((prev) => !prev)}
                  aria-expanded={showHiddenDrawer}
                  className="min-h-[44px] px-3.5 rounded-xl glass-inset text-xs font-medium text-[var(--tm-text-primary)] hover:border-[var(--tm-border-strong)] active:scale-[0.98] transition-all"
                >
                  {showHiddenDrawer ? '收起管理' : '管理隐藏'}
                </button>
              )}
            </div>
          </div>

          {showHiddenDrawer && manualHiddenItems.length > 0 && (
            <div className="pt-2.5 border-t border-[var(--tm-border-subtle)] space-y-2">
              {manualHiddenItems.map((item) => (
                <div
                  key={item.itemKey}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl glass-inset text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-[var(--tm-text-primary)] truncate block">
                      {item.displayTitle}
                    </span>
                    {(item.provider.accountName ||
                      item.provider.accountEmail ||
                      item.account.sourceLabel) && (
                      <span className="text-[11px] text-[var(--tm-text-muted)] truncate block mt-0.5">
                        {[
                          item.provider.accountName || item.provider.accountEmail,
                          item.account.sourceLabel,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleManualHide(item.accountHash)}
                    className="min-h-[44px] px-3.5 rounded-xl bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-xs font-semibold text-[var(--tm-accent-text)] active:scale-[0.98] transition-all shrink-0"
                  >
                    恢复
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  onChangePrefs({ ...prefs, hiddenAccountHashes: [] });
                  setShowHiddenDrawer(false);
                  setLastHidden(null);
                }}
                className="w-full min-h-[44px] rounded-2xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.99] border border-[var(--tm-border-default)] text-xs font-semibold text-[var(--tm-text-primary)] transition-all"
              >
                全部恢复显示
              </button>
            </div>
          )}
        </section>
      )}

      <p className="text-[11px] text-[var(--tm-text-muted)] text-center leading-relaxed pt-2 pb-2">
        账户与来源设备按 Hub 读数展示 · 刷新只读取已有额度
      </p>
    </div>
  );
};
