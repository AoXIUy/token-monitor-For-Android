import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  Gauge,
  History,
  RotateCcw,
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
  prefs: LimitsPrefs;
  limitAccountPresentation?: LimitAccountPresentationMap;
  onChangePrefs: (next: LimitsPrefs) => void;
}

type StatusFilterId = 'all' | 'collected' | 'warn' | 'abnormal';
type LimitSortId = 'default' | 'pressure' | 'updated';

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

  const hiddenSet = useMemo(() => new Set(hiddenHashes), [hiddenHashes]);

  useEffect(() => {
    if (lastHidden && !hiddenSet.has(lastHidden.hash)) {
      setLastHidden(null);
    }
  }, [lastHidden, hiddenSet]);

  const groups = useMemo(
    () => MonitorModel.limitGroups(providers, stats, deviceId, limitAccountPresentation),
    [providers, stats, deviceId, limitAccountPresentation],
  );

  const enrichedGroups = useMemo(() => {
    return groups.map((group) => {
      const items = group.providers.map((provider) => {
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
    return {
      total: allItems.length,
      collectedCount: collected.length,
      uncollectedCount: uncollected.length,
      warnCount: warn.length,
      healthyCount: healthy.length,
      abnormalCount: abnormal.length,
    };
  }, [allItems]);

  const keyword = search.trim().toLocaleLowerCase();

  const {
    visibleGroups,
    autoHiddenItems,
    manualHiddenItems,
    hiddenSearchMatches,
  } = useMemo(() => {
    const autoHidden: typeof allItems = [];
    const manualHidden: typeof allItems = [];
    let hiddenMatches = 0;

    const matchStatus = (item: (typeof allItems)[number]) => {
      if (statusFilter === 'collected') return item.hasHistory;
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

    return {
      visibleGroups: filteredGroups,
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
            <section className="glass-hero rounded-3xl p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-sky-300">Hub 共享订阅账本</p>
                <p className="text-xl font-bold text-white tabular-nums mt-0.5">
                  <span className="font-mono-tabular">{totalCount}</span> 项记录
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  不随设备或统计周期筛选 · 保持原币种
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 text-[11px] tabular-nums shrink-0">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-400/25 text-emerald-200">
                  周期订阅 <span className="font-mono-tabular">{subCount}</span>
                </span>
                {topupCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-sky-500/12 border border-sky-400/25 text-sky-200">
                    预存充值 <span className="font-mono-tabular">{topupCount}</span>
                  </span>
                )}
              </div>
            </section>

            {rows.map((row, index) => {
              const key = row.id || `${row.provider}-${index}`;
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
                Date.now(),
                row.autoRenew ? '即将续费' : '已到期',
              );

              return (
                <section key={key} className="glass-panel rounded-3xl p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-slate-100 break-words">
                        {row.planName || providerName(row.provider)}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {providerName(row.provider)} ·{' '}
                        {row.binding?.accountEmail || row.binding?.profileName || '未绑定账户'}
                      </p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-400/25 text-[11px] font-medium text-emerald-200 shrink-0 whitespace-nowrap">
                      {row.kind === 'subscription' ? '周期订阅' : '预存充值'}
                    </span>
                  </div>

                  <div className="my-3.5 flex items-baseline justify-between gap-2 flex-wrap">
                    <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                      <div className="text-2xl font-bold text-emerald-300 font-mono-tabular">
                        {MonitorModel.money(amount, row.currency)}
                      </div>
                      <span className="text-xs text-slate-400 tabular-nums">
                        {row.kind === 'subscription'
                          ? `每 ${MonitorModel.count(row.intervalCount) || 1} ${intervalLabel} · ${
                              row.autoRenew ? '自动续费' : '不自动续费'
                            }`
                          : '累计充值金额'}
                      </span>
                    </div>
                    {renewalCountdown && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-500/12 border border-sky-400/25 text-[11px] text-sky-200 tabular-nums shrink-0">
                        <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span>{renewalCountdown}</span>
                      </span>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl glass-inset text-xs">
                    <div className="min-w-0">
                      <dt className="text-[11px] text-slate-400">开始日期</dt>
                      <dd className="font-mono-tabular text-slate-200 mt-0.5">
                        {row.startDate || '—'}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] text-slate-400">结束日期</dt>
                      <dd className="font-mono-tabular text-slate-200 mt-0.5">
                        {row.endDate || '—'}
                      </dd>
                    </div>
                    {row.nextRenewalOverride && (
                      <div className="col-span-2 min-w-0 pt-1.5 border-t border-white/[0.06]">
                        <dt className="text-[11px] text-slate-400">下次续费</dt>
                        <dd className="font-mono-tabular text-sky-300 mt-0.5">
                          {row.nextRenewalOverride}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {row.note && (
                    <p className="text-xs text-slate-300 mt-3 pt-2.5 border-t border-white/[0.06] leading-relaxed break-words">
                      {row.note}
                    </p>
                  )}

                  {row.topUps && row.topUps.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenTopUps((prev) => ({ ...prev, [key]: !prev[key] }))
                        }
                        aria-expanded={isExpanded}
                        className="w-full min-h-[44px] flex items-center justify-between text-xs font-medium text-sky-300 hover:text-sky-200 transition-colors"
                      >
                        <span className="tabular-nums">充值记录（{row.topUps.length} 笔）</span>
                        <ChevronDown
                          aria-hidden="true"
                          className={`w-4 h-4 transition-transform duration-150 ${
                            isExpanded ? 'rotate-180 text-sky-400' : ''
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
                              <span className="text-slate-300">{topup.date}</span>
                              <span className="text-emerald-300 font-semibold">
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
            })}

            <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-2 pb-2 tabular-nums">
              共享列表更新 <span className="font-mono-tabular">{formatShortTime(subscriptions.updatedAt)}</span>
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
    ['all', '全部'],
    ['collected', '有采集'],
    ...(summary.warnCount > 0 ? ([['warn', `预警 ${summary.warnCount}`]] as Array<[StatusFilterId, string]>) : []),
    ...(summary.abnormalCount > 0
      ? ([['abnormal', `异常 ${summary.abnormalCount}`]] as Array<[StatusFilterId, string]>)
      : []),
  ];

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
              className="min-h-[36px] px-3 rounded-xl bg-sky-400/20 hover:bg-sky-400/30 active:scale-[0.98] border border-sky-400/35 text-xs font-semibold text-sky-100 inline-flex items-center gap-1 transition-all"
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
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-sky-300">
              <Gauge className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>实时额度监控</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2 flex-wrap tabular-nums">
              <span className="text-2xl font-extrabold text-white font-mono-tabular">
                {summary.collectedCount}
              </span>
              <span className="text-xs text-slate-300">
                / <span className="font-mono-tabular">{summary.total}</span> 个账户有采集数据
              </span>
            </div>
          </div>

          <button
            type="button"
            data-limits-mode-toggle="true"
            aria-pressed={showRemaining}
            onClick={() => setShowRemaining((prev) => !prev)}
            className="min-h-[40px] px-3.5 py-1.5 rounded-full bg-black/30 hover:bg-black/45 active:scale-[0.98] border border-white/14 text-xs font-semibold text-sky-100 transition-all shrink-0 inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
            <span>{showRemaining ? '剩余优先' : '已用优先'}</span>
          </button>
        </div>

        {/* Static telemetry counters — visually distinct from interactive filter chips */}
        <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap text-xs tabular-nums pt-1 border-t border-white/10">
          <span className="inline-flex items-center gap-1.5 text-emerald-300 font-medium">
            <i aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>正常 {summary.healthyCount}</span>
          </span>
          {summary.warnCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-rose-300 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>预警 {summary.warnCount}</span>
            </span>
          )}
          {summary.abnormalCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-amber-300 font-medium">
              <i aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>异常/未配置 {summary.abnormalCount}</span>
            </span>
          )}
        </div>

        {summary.uncollectedCount > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              data-limits-hide-uncollected="true"
              aria-pressed={hideUncollected}
              onClick={() => setHideUncollected((prev) => !prev)}
              className={`min-h-[40px] px-3.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-all active:scale-[0.98] tabular-nums ${
                hideUncollected
                  ? 'bg-sky-500/18 border-sky-400/35 text-sky-100'
                  : 'bg-white/[0.05] border-white/12 text-slate-200 hover:border-white/25'
              }`}
            >
              {hideUncollected ? (
                <EyeOff className="w-3.5 h-3.5 text-sky-300 shrink-0" aria-hidden="true" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-slate-300 shrink-0" aria-hidden="true" />
              )}
              <span>
                {hideUncollected
                  ? `已隐藏无历史 (${summary.uncollectedCount})`
                  : `隐藏无历史 (${summary.uncollectedCount})`}
              </span>
            </button>
          </div>
        )}
      </section>

      {/* 2. 搜索、状态筛选与排序栏 */}
      {showControlsBar && (
        <div className="space-y-2.5">
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

          <div className="space-y-2">
            <div
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
              role="group"
              aria-label="额度状态筛选"
            >
              {statusFilterOptions.map(([fId, fLabel]) => {
                const active = statusFilter === fId;
                const activeTone =
                  fId === 'warn'
                    ? 'bg-rose-500/20 border-rose-400/45 text-rose-100'
                    : fId === 'abnormal'
                    ? 'bg-amber-500/20 border-amber-400/45 text-amber-100'
                    : 'bg-sky-500/20 border-sky-400/40 text-sky-100';
                return (
                  <button
                    key={fId}
                    type="button"
                    data-limits-filter={fId}
                    aria-pressed={active}
                    onClick={() => setStatusFilter(fId)}
                    className={`shrink-0 min-h-[38px] px-3.5 rounded-full text-xs font-semibold border transition-all active:scale-[0.98] whitespace-nowrap tabular-nums ${
                      active
                        ? activeTone
                        : 'glass-inset text-slate-300 hover:border-white/20'
                    }`}
                  >
                    {fLabel}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-end">
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
                  className="min-h-[44px] px-4 rounded-xl glass-inset text-xs font-semibold text-sky-200 hover:border-sky-400/35 active:scale-[0.98] transition-all"
                >
                  清除筛选
                </button>
              )}
              {autoHiddenItems.length > 0 && (
                <button
                  type="button"
                  data-limits-show-hidden="true"
                  onClick={() => setHideUncollected(false)}
                  className="min-h-[44px] px-4 rounded-xl bg-sky-500/18 border border-sky-400/35 text-xs font-semibold text-sky-100 active:scale-[0.98] transition-all tabular-nums"
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
                  className="min-h-[44px] px-4 rounded-xl bg-white/[0.06] border border-white/12 text-xs font-semibold text-slate-100 active:scale-[0.98] transition-all tabular-nums"
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
                ? 'rounded-[28px] border border-sky-400/22 bg-sky-500/[0.03] p-2.5 space-y-2.5'
                : 'space-y-3.5'
            }
          >
            {group.linked && (
              <div
                data-limit-linked-group={group.key}
                className="px-3 py-2 rounded-2xl bg-sky-500/10 border border-sky-400/20 text-xs text-slate-200 flex items-center justify-between gap-2 flex-wrap"
              >
                <span className="font-semibold text-sky-200">{group.label}</span>
                <span className="text-[11px] text-slate-300">
                  已验证的 MiniMax 同一账户 · 各产品独立计量
                </span>
              </div>
            )}

            {group.items.map(
              ({
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
                const subMeta = [
                  accountTitle,
                  secondaryAccountName,
                  planOrAccountLabel,
                ].filter(Boolean);

                return (
                  <section
                    key={account.key}
                    data-limit-account={account.key}
                    className={`glass-panel rounded-3xl p-4 sm:p-5 transition-colors ${
                      isWarn
                        ? 'border-rose-400/30'
                        : !hasHistory
                        ? 'opacity-90'
                        : ''
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2 min-w-0 flex-1 pt-0.5">
                          <span
                            aria-hidden="true"
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${tone.dot}`}
                          />
                          <h3 className="text-sm font-bold text-slate-50 leading-snug break-words min-w-0">
                            {displayTitle}
                          </h3>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border shrink-0 whitespace-nowrap ${
                            isHealthy
                              ? 'bg-emerald-500/12 border-emerald-400/25 text-emerald-200'
                              : 'bg-amber-500/12 border-amber-400/25 text-amber-200'
                          }`}
                        >
                          <i
                            aria-hidden="true"
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isHealthy ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                          />
                          <span>{statusText}</span>
                        </span>
                      </div>

                      {(account.regionLabel || !hasHistory) && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {account.regionLabel && (
                            <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-medium text-slate-300">
                              {account.regionLabel}
                            </span>
                          )}
                          {!hasHistory && (
                            <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[11px] text-slate-300">
                              无采集历史
                            </span>
                          )}
                        </div>
                      )}

                      {subMeta.length > 0 && (
                        <p className="text-xs text-slate-300 break-words">{subMeta.join(' · ')}</p>
                      )}

                      {!preferEmailPrimary &&
                        (account.displayName || provider.accountName) &&
                        provider.accountEmail && (
                          <p className="text-[11px] font-mono-tabular text-slate-400 truncate">
                            {provider.accountEmail}
                          </p>
                        )}

                      {account.sourceLabel && (
                        <p className="text-[11px] text-slate-400 break-words">
                          来源设备：{account.sourceLabel}
                        </p>
                      )}
                    </div>

                    {quotas.length > 0 ? (
                      <div className="mt-3.5 space-y-2.5 pt-3 border-t border-white/8">
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
                                Date.now(),
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
                                  <span className="text-xs font-medium text-slate-300 min-w-0 break-words">
                                    {q.label}
                                  </span>
                                </div>
                                <div
                                  className={`text-lg font-bold font-mono-tabular leading-tight break-words ${
                                    q.value === '无限额'
                                      ? 'text-sky-300'
                                      : q.remaining
                                      ? 'text-emerald-300'
                                      : 'text-slate-100'
                                  }`}
                                >
                                  {needsRemainingPrefix ? (
                                    <>
                                      <span className="text-xs font-medium font-sans text-slate-400">
                                        剩余
                                      </span>{' '}
                                      <span>{q.value}</span>
                                    </>
                                  ) : (
                                    q.value
                                  )}
                                </div>

                                {q.detail && (
                                  <p className="text-[11px] text-slate-300 font-mono-tabular">
                                    {q.detail}
                                  </p>
                                )}

                                {win.resetsAt && (
                                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 tabular-nums flex-wrap pt-0.5">
                                    <span>
                                      {win.boundaryKind === 'expiry' ? '到期时间' : '重置时间'}{' '}
                                      <span className="font-mono-tabular">
                                        {formatShortTime(win.resetsAt)}
                                      </span>
                                    </span>
                                    {countdown && (
                                      <span className="text-sky-300 font-medium">{countdown}</span>
                                    )}
                                  </div>
                                )}

                                {(q.description ?? win.resetDescription) && (
                                  <p className="text-[11px] text-slate-400 break-words leading-relaxed">
                                    {q.description ?? win.resetDescription}
                                  </p>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div
                              key={`${win.kind || 'win'}-${wIdx}`}
                              className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-3.5 space-y-2"
                            >
                              <div className="flex items-baseline justify-between gap-2 text-xs">
                                <span className="text-slate-200 font-medium min-w-0 break-words">
                                  {q.label}
                                </span>
                                <span
                                  className={`font-semibold font-mono-tabular shrink-0 ${
                                    winWarn
                                      ? 'text-rose-300'
                                      : winElevated
                                      ? 'text-amber-300'
                                      : 'text-sky-300'
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
                                <p className="text-[11px] text-slate-300 font-mono-tabular">
                                  {q.detail}
                                </p>
                              )}

                              {win.resetsAt && (
                                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 tabular-nums flex-wrap">
                                  <span>
                                    {win.boundaryKind === 'expiry' ? '到期时间' : '重置时间'}{' '}
                                    <span className="font-mono-tabular">
                                      {formatShortTime(win.resetsAt)}
                                    </span>
                                  </span>
                                  {countdown && (
                                    <span className="text-sky-300 font-medium">{countdown}</span>
                                  )}
                                </div>
                              )}

                              {(q.description ?? win.resetDescription) && (
                                <p className="text-[11px] text-slate-400 break-words leading-relaxed">
                                  {q.description ?? win.resetDescription}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-white/8">
                        暂无额度窗口读数
                      </p>
                    )}

                    {balanceDetails.length > 0 && (
                      <DetailsDisclosure
                        data-balance-details=""
                        summary="余额组成"
                        className="mt-3 pt-1 border-t border-white/8"
                        summaryClassName="text-sky-300 hover:text-sky-200"
                        bodyClassName="mt-1"
                      >
                        <dl className="space-y-2 text-xs p-3 rounded-2xl glass-inset">
                          {balanceDetails.map((row) => (
                            <div key={row.key} className="flex justify-between gap-2">
                              <dt className="text-slate-400">{row.label}</dt>
                              <dd className="font-mono-tabular text-slate-100">{row.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </DetailsDisclosure>
                    )}

                    {spend.length > 0 && (
                      <div data-limit-spend="" className="mt-3 pt-3 border-t border-white/8">
                        <p className="text-xs font-semibold text-slate-200 mb-2">API 现金消费</p>
                        <dl className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl glass-inset text-xs">
                          {spend.map((row) => (
                            <div key={row.key} className="min-w-0">
                              <dt className="text-slate-400 text-[11px]">{row.label}</dt>
                              <dd className="font-mono-tabular text-slate-100 font-semibold mt-0.5 break-words">
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

                    <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400 tabular-nums min-w-0 truncate">
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
                          className="min-w-[44px] min-h-[44px] rounded-xl glass-inset hover:border-white/20 active:scale-[0.97] flex items-center justify-center text-slate-400 hover:text-slate-200 transition-all"
                        >
                          <EyeOff className="w-4 h-4" aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          data-quota-history-toggle={account.key}
                          aria-expanded={openHistory === account.key}
                          onClick={() =>
                            setOpenHistory(openHistory === account.key ? '' : account.key)
                          }
                          className={`min-h-[44px] px-3 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-all active:scale-[0.98] ${
                            openHistory === account.key
                              ? 'bg-sky-500/18 border-sky-400/35 text-sky-100'
                              : 'glass-inset hover:border-sky-400/35 text-sky-300'
                          }`}
                        >
                          <History className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>额度历史</span>
                          <ChevronDown
                            aria-hidden="true"
                            className={`w-3.5 h-3.5 transition-transform duration-150 ${
                              openHistory === account.key ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {openHistory === account.key && (
                      <QuotaHistoryPreview
                        key={`${deviceId}:${account.key}`}
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
            <div className="flex items-center gap-2 text-xs text-slate-300 min-w-0 tabular-nums">
              <EyeOff className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
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
                  className="min-h-[40px] px-3.5 rounded-xl bg-sky-500/18 border border-sky-400/35 text-xs font-semibold text-sky-100 hover:bg-sky-500/25 active:scale-[0.98] transition-all"
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
                  className="min-h-[40px] px-3.5 rounded-xl glass-inset text-xs font-medium text-slate-200 hover:border-white/20 active:scale-[0.98] transition-all"
                >
                  {showHiddenDrawer ? '收起管理' : '管理隐藏'}
                </button>
              )}
            </div>
          </div>

          {showHiddenDrawer && manualHiddenItems.length > 0 && (
            <div className="pt-2.5 border-t border-white/8 space-y-2">
              {manualHiddenItems.map((item) => (
                <div
                  key={item.account.key}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl glass-inset text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-slate-100 truncate block">
                      {item.displayTitle}
                    </span>
                    {(item.provider.accountName ||
                      item.provider.accountEmail ||
                      item.account.sourceLabel) && (
                      <span className="text-[11px] text-slate-400 truncate block mt-0.5">
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
                    className="min-h-[40px] px-3.5 rounded-xl bg-sky-500/18 border border-sky-400/35 text-xs font-semibold text-sky-100 active:scale-[0.98] transition-all shrink-0"
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
                className="w-full min-h-[44px] rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] active:scale-[0.99] border border-white/10 text-xs font-semibold text-slate-200 transition-all"
              >
                全部恢复显示
              </button>
            </div>
          )}
        </section>
      )}

      <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-2 pb-2">
        账户与来源设备按 Hub 读数展示 · 刷新只读取已有额度
      </p>
    </div>
  );
};
