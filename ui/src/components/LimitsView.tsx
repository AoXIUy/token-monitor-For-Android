import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  Gauge,
  History,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { MonitorModel } from '../model/monitorModel';
import {
  LimitProvider,
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
  providerName,
} from '../utils/formatters';

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
}

type StatusFilterId = 'all' | 'collected' | 'warn' | 'abnormal';
type LimitSortId = 'default' | 'pressure' | 'updated';

const STORAGE_HIDE_UNCOLLECTED = 'tm.limits.hideUncollected';
const STORAGE_HIDDEN_ACCOUNTS = 'tm.limits.hiddenAccounts';
const STORAGE_SHOW_REMAINING = 'tm.limits.showRemaining';

function readBoolPref(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage?.getItem(key);
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
  } catch {
    // Ignore storage unavailability in restricted WebViews
  }
  return fallback;
}

function writeBoolPref(key: string, value: boolean): void {
  try {
    window.localStorage?.setItem(key, value ? '1' : '0');
  } catch {
    // Ignore storage errors
  }
}

function readHiddenAccounts(): string[] {
  try {
    const raw = window.localStorage?.getItem(STORAGE_HIDDEN_ACCOUNTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];
  } catch {
    return [];
  }
}

function writeHiddenAccounts(keys: string[]): void {
  try {
    window.localStorage?.setItem(STORAGE_HIDDEN_ACCOUNTS, JSON.stringify(keys));
  } catch {
    // Ignore storage errors
  }
}

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
}) => {
  const [openTopUps, setOpenTopUps] = useState<Record<string, boolean>>({});
  const [openHistory, setOpenHistory] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterId>('all');
  const [sortBy, setSortBy] = useState<LimitSortId>('default');
  const [hideUncollected, setHideUncollected] = useState<boolean>(() =>
    readBoolPref(STORAGE_HIDE_UNCOLLECTED, true)
  );
  const [hiddenAccounts, setHiddenAccounts] = useState<string[]>(() => readHiddenAccounts());
  const [showRemaining, setShowRemaining] = useState<boolean>(() =>
    readBoolPref(STORAGE_SHOW_REMAINING, false)
  );
  const [showHiddenDrawer, setShowHiddenDrawer] = useState(false);

  useEffect(() => {
    writeBoolPref(STORAGE_HIDE_UNCOLLECTED, hideUncollected);
  }, [hideUncollected]);

  useEffect(() => {
    writeHiddenAccounts(hiddenAccounts);
  }, [hiddenAccounts]);

  useEffect(() => {
    writeBoolPref(STORAGE_SHOW_REMAINING, showRemaining);
  }, [showRemaining]);

  useEffect(() => {
    setStatusFilter('all');
    setOpenHistory('');
  }, [deviceId]);

  const hiddenSet = useMemo(() => new Set(hiddenAccounts), [hiddenAccounts]);

  const groups = useMemo(
    () => MonitorModel.limitGroups(providers, stats, deviceId),
    [providers, stats, deviceId]
  );

  const enrichedGroups = useMemo(() => {
    return groups.map((group) => {
      const items = group.providers.map((provider) => {
        const account = MonitorModel.limitAccount(provider, stats, deviceId);
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
          provider.stale || (provider.status && provider.status !== 'ok')
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
              q.percent !== null && (q.remaining ? q.percent < 15 : q.percent > 85)
          );
        const updatedMs = Date.parse(provider.updatedAt || '') || 0;
        const displayTitle = account.productLabel || providerName(provider.provider);
        const searchIndex = [
          displayTitle,
          providerName(provider.provider),
          provider.provider,
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
  }, [groups, stats, deviceId, showRemaining]);

  const allItems = useMemo(
    () => enrichedGroups.flatMap((group) => group.items),
    [enrichedGroups]
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
          const isManualHidden = hiddenSet.has(item.account.key);
          const isAutoHidden = hideUncollected && !item.hasHistory;
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
          Number(b.items.some((i) => i.hasHistory)) - Number(a.items.some((i) => i.hasHistory))
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
          <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-400/25 rounded-2xl p-3.5 flex items-start gap-2.5 leading-relaxed">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span>
              {subscriptionError}
              {subscriptions ? '；以下为上次读取的订阅' : ''}
            </span>
          </div>
        )}

        {!rows ? (
          <div className="glass-panel rounded-3xl p-8 text-center my-4">
            <CreditCard className="w-8 h-8 text-sky-400/70 mx-auto mb-3" />
            <p className="text-base font-semibold text-slate-100 mb-1.5">尚未读到共享订阅</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              {subscriptionError ? '点击右上角刷新重试。' : '正在从 Hub 读取共享订阅…'}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="glass-panel rounded-3xl p-8 text-center my-4">
            <CreditCard className="w-8 h-8 text-sky-400/70 mx-auto mb-3" />
            <p className="text-base font-semibold text-slate-100 mb-1.5">共享订阅为空</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              在桌面端管理订阅后，手机会自动读取更新。
            </p>
          </div>
        ) : (
          <>
            <section className="glass-hero rounded-3xl p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium text-sky-300">Hub 共享订阅账本</p>
                <p className="text-lg font-bold text-white font-mono-tabular mt-0.5">
                  {totalCount} 项记录
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  不随设备或统计周期筛选 · 保持原币种
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 text-[11px] font-mono-tabular">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-400/25 text-emerald-300">
                  周期订阅 {subCount}
                </span>
                {topupCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-sky-500/12 border border-sky-400/25 text-sky-300">
                    预存充值 {topupCount}
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
              const renewalCountdown = formatRelativeCountdown(renewalTarget);

              return (
                <section key={key} className="glass-panel rounded-3xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-100 truncate">
                        {row.planName || providerName(row.provider)}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {providerName(row.provider)} ·{' '}
                        {row.binding?.accountEmail || row.binding?.profileName || '未绑定账户'}
                      </p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-400/25 text-[11px] font-medium text-emerald-300 shrink-0">
                      {row.kind === 'subscription' ? '周期订阅' : '预存充值'}
                    </span>
                  </div>

                  <div className="my-3.5 flex items-baseline justify-between gap-2 flex-wrap">
                    <div className="flex items-baseline gap-2">
                      <div className="text-2xl font-bold text-emerald-300 font-mono-tabular">
                        {MonitorModel.money(amount, row.currency)}
                      </div>
                      <span className="text-xs text-slate-400">
                        {row.kind === 'subscription'
                          ? `每 ${MonitorModel.count(row.intervalCount) || 1} ${intervalLabel} · ${
                              row.autoRenew ? '自动续费' : '不自动续费'
                            }`
                          : '累计充值金额'}
                      </span>
                    </div>
                    {renewalCountdown && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/12 border border-sky-400/25 text-[10px] text-sky-300 font-mono-tabular">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{renewalCountdown}</span>
                      </span>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl glass-inset text-xs">
                    <div>
                      <dt className="text-[11px] text-slate-400">开始日期</dt>
                      <dd className="font-mono-tabular text-slate-200 mt-0.5">
                        {row.startDate || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-slate-400">结束日期</dt>
                      <dd className="font-mono-tabular text-slate-200 mt-0.5">
                        {row.endDate || '—'}
                      </dd>
                    </div>
                    {row.nextRenewalOverride && (
                      <div className="col-span-2 pt-1.5 border-t border-white/[0.06]">
                        <dt className="text-[11px] text-slate-400">下次续费</dt>
                        <dd className="font-mono-tabular text-sky-300 mt-0.5">
                          {row.nextRenewalOverride}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {row.note && (
                    <p className="text-xs text-slate-300/85 mt-3 pt-2.5 border-t border-white/6 leading-relaxed">
                      {row.note}
                    </p>
                  )}

                  {row.topUps && row.topUps.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-white/6">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenTopUps((prev) => ({ ...prev, [key]: !prev[key] }))
                        }
                        aria-expanded={isExpanded}
                        className="w-full min-h-[40px] flex items-center justify-between text-xs text-sky-300 hover:text-sky-200 transition-colors"
                      >
                        <span>充值记录（{row.topUps.length} 笔）</span>
                        <ChevronDown
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
                              className="flex items-center justify-between text-xs py-2 px-3 rounded-xl glass-inset font-mono-tabular"
                            >
                              <span className="text-slate-300">{topup.date}</span>
                              <span className="text-emerald-300 font-semibold">
                                {MonitorModel.money(
                                  MonitorModel.numeric(topup.amountMinor) === null
                                    ? null
                                    : topup.amountMinor / 100,
                                  row.currency
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

            <p className="text-[11px] text-slate-400/80 text-center leading-relaxed pt-3 pb-2">
              共享列表更新 {formatShortTime(subscriptions.updatedAt)}
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
      <div className="glass-panel rounded-3xl p-8 text-center my-4">
        <Gauge className="w-8 h-8 text-sky-400/70 mx-auto mb-3" />
        <p className="text-base font-semibold text-slate-100 mb-1.5">暂无额度数据</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          请在采集设备配置额度账户。手机仅展示 Hub 已收到的读数。
        </p>
      </div>
    );
  }

  const toggleManualHide = (accountKey: string) => {
    setHiddenAccounts((prev) =>
      prev.includes(accountKey)
        ? prev.filter((item) => item !== accountKey)
        : [...prev, accountKey]
    );
  };

  return (
    <div className="space-y-3.5">
      {historyError && (
        <p role="alert" className="text-xs text-amber-300 p-3 glass-panel rounded-2xl">
          {historyError}
        </p>
      )}

      {/* 1. 额度遥测摘要头 */}
      <section data-limits-summary="true" className="glass-hero rounded-3xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-sky-300">
              <Gauge className="w-3.5 h-3.5 shrink-0" />
              <span>实时额度监控</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-extrabold text-white font-mono-tabular">
                {summary.collectedCount}
              </span>
              <span className="text-xs text-slate-300">
                / {summary.total} 个账户有采集数据
              </span>
            </div>
          </div>

          <button
            type="button"
            data-limits-mode-toggle="true"
            aria-pressed={showRemaining}
            onClick={() => setShowRemaining((prev) => !prev)}
            className="min-h-[36px] px-3 py-1 rounded-full bg-black/30 hover:bg-black/45 border border-white/12 text-[11px] font-semibold text-sky-200 transition-colors shrink-0 inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3 text-sky-400" />
            <span>{showRemaining ? '剩余优先' : '已用优先'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono-tabular">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-400/25 text-emerald-300">
            <i aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>正常 {summary.healthyCount}</span>
          </span>

          {summary.warnCount > 0 && (
            <button
              type="button"
              onClick={() =>
                setStatusFilter((prev) => (prev === 'warn' ? 'all' : 'warn'))
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border transition-colors ${
                statusFilter === 'warn'
                  ? 'bg-rose-500/25 border-rose-400/50 text-rose-200'
                  : 'bg-rose-500/12 border-rose-400/25 text-rose-300 hover:bg-rose-500/20'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>预警 {summary.warnCount}</span>
            </button>
          )}

          {summary.abnormalCount > 0 && (
            <button
              type="button"
              onClick={() =>
                setStatusFilter((prev) => (prev === 'abnormal' ? 'all' : 'abnormal'))
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border transition-colors ${
                statusFilter === 'abnormal'
                  ? 'bg-amber-500/25 border-amber-400/50 text-amber-200'
                  : 'bg-amber-500/12 border-amber-400/25 text-amber-300 hover:bg-amber-500/20'
              }`}
            >
              <i aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>异常/未配置 {summary.abnormalCount}</span>
            </button>
          )}

          {summary.uncollectedCount > 0 && (
            <button
              type="button"
              data-limits-hide-uncollected="true"
              aria-pressed={hideUncollected}
              onClick={() => setHideUncollected((prev) => !prev)}
              className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border transition-colors ${
                hideUncollected
                  ? 'bg-sky-500/18 border-sky-400/35 text-sky-200'
                  : 'bg-white/[0.04] border-white/12 text-slate-300 hover:text-white'
              }`}
            >
              {hideUncollected ? (
                <EyeOff className="w-3 h-3 text-sky-300" />
              ) : (
                <Eye className="w-3 h-3 text-slate-400" />
              )}
              <span>
                {hideUncollected
                  ? `已隐藏无历史 (${summary.uncollectedCount})`
                  : `隐藏无历史 (${summary.uncollectedCount})`}
              </span>
            </button>
          )}
        </div>
      </section>

      {/* 2. 搜索、状态筛选与排序栏 */}
      {(allItems.length > 3 || search !== '' || statusFilter !== 'all' || sortBy !== 'default') && (
        <div className="space-y-2">
          {(allItems.length > 4 || search !== '') && (
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="search"
                data-limits-search="true"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索工具、账户、邮箱或来源设备…"
                autoComplete="off"
                className="w-full min-h-[40px] pl-9 pr-9 py-1.5 rounded-2xl glass-inset text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60 transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="清除额度搜索"
                  className="w-8 h-8 flex items-center justify-center absolute right-1 text-slate-400 hover:text-slate-200 rounded-lg"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="额度状态筛选">
              {(
                [
                  ['all', '全部'],
                  ['collected', '有采集'],
                  ...(summary.warnCount > 0 ? [['warn', '预警'] as const] : []),
                  ...(summary.abnormalCount > 0 ? [['abnormal', '异常'] as const] : []),
                ] as Array<[StatusFilterId, string]>
              ).map(([fId, fLabel]) => {
                const active = statusFilter === fId;
                return (
                  <button
                    key={fId}
                    type="button"
                    data-limits-filter={fId}
                    aria-pressed={active}
                    onClick={() => setStatusFilter(fId)}
                    className={`shrink-0 min-h-[32px] px-2.5 rounded-full text-[11px] font-medium border transition-colors ${
                      active
                        ? 'bg-sky-500/20 border-sky-400/40 text-sky-200'
                        : 'glass-pill-bar text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {fLabel}
                  </button>
                );
              })}
            </div>

            <div className="inline-flex items-center gap-1 rounded-full glass-inset p-0.5 shrink-0" role="group" aria-label="额度排序">
              <ArrowUpDown className="w-3 h-3 text-slate-400 ml-1.5" aria-hidden="true" />
              {(
                [
                  ['default', '默认'],
                  ['pressure', '按压力'],
                  ['updated', '按更新'],
                ] as Array<[LimitSortId, string]>
              ).map(([sId, sLabel]) => {
                const active = sortBy === sId;
                return (
                  <button
                    key={sId}
                    type="button"
                    data-limits-sort={sId}
                    aria-pressed={active}
                    onClick={() => setSortBy(sId)}
                    className={`min-h-[28px] px-2 rounded-full text-[10px] font-semibold transition-colors ${
                      active
                        ? 'bg-sky-400/20 text-sky-200 border border-sky-400/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sLabel}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. 主列表 */}
      {visibleGroups.length === 0 ? (
        <div className="glass-panel rounded-3xl p-7 text-center space-y-3">
          <Gauge className="w-8 h-8 text-sky-400/70 mx-auto" />
          <div>
            <p className="text-sm font-semibold text-slate-100">
              {keyword
                ? '没有匹配的可见工具'
                : autoHiddenItems.length > 0 || manualHiddenItems.length > 0
                ? '当前没有可展示的已采集工具'
                : '没有符合筛选条件的工具'}
            </p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {hiddenSearchMatches > 0
                ? `已隐藏的工具中有 ${hiddenSearchMatches} 项匹配当前搜索。`
                : autoHiddenItems.length > 0
                ? `有 ${autoHiddenItems.length} 个未采集/未配置工具已被自动隐藏。`
                : '可以清除筛选条件或恢复全部显示。'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
            {(keyword || statusFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
                className="min-h-[38px] px-3.5 rounded-xl glass-inset text-xs font-medium text-sky-300 hover:text-sky-200"
              >
                清除筛选
              </button>
            )}
            {autoHiddenItems.length > 0 && (
              <button
                type="button"
                data-limits-show-hidden="true"
                onClick={() => setHideUncollected(false)}
                className="min-h-[38px] px-3.5 rounded-xl bg-sky-500/15 border border-sky-400/35 text-xs font-semibold text-sky-200"
              >
                显示无采集历史 ({autoHiddenItems.length})
              </button>
            )}
            {manualHiddenItems.length > 0 && (
              <button
                type="button"
                onClick={() => setHiddenAccounts([])}
                className="min-h-[38px] px-3.5 rounded-xl bg-white/[0.06] border border-white/12 text-xs font-medium text-slate-200"
              >
                恢复手动隐藏 ({manualHiddenItems.length})
              </button>
            )}
          </div>
        </div>
      ) : (
        visibleGroups.map((group) => (
          <div key={group.key} className="space-y-3.5">
            {group.linked && (
              <div
                data-limit-linked-group={group.key}
                className="px-3 py-2 rounded-2xl bg-sky-500/[0.06] border border-sky-400/15 text-xs text-slate-300 flex items-center justify-between gap-2 flex-wrap"
              >
                <span className="font-semibold text-sky-200">{group.label}</span>
                <span className="text-[11px] text-slate-400">
                  已验证的 MiniMax 同一账户 · 各产品独立计量
                </span>
              </div>
            )}

            {group.items.map(
              ({
                provider,
                account,
                quotas,
                spend,
                balanceDetails,
                hasHistory,
                isHealthy,
                isWarn,
                displayTitle,
              }) => {
                const code = provider.provider === 'minimax' && provider.source === 'oauth';
                const statusText = provider.stale
                  ? '读数已过期'
                  : code && provider.status === 'notConfigured'
                  ? '需登录 Code'
                  : provider.provider === 'minimax' &&
                    provider.source === 'api' &&
                    provider.status === 'unauthorized'
                  ? 'API 凭据失效'
                  : ({
                      ok: '正常',
                      unavailable: '读取失败',
                      unauthorized: '需重新登录',
                      unconfigured: '未配置',
                      notConfigured: '未配置',
                      disabled: '已停用',
                      rateLimited: '已限流',
                      sourceRateLimited: '查询受限',
                      error: '读取失败',
                    } as Record<string, string>)[provider.status || ''] ||
                    provider.status ||
                    '状态未知';

                const tone = clientTone(provider.provider);
                const planOrAccountLabel =
                  provider.planLabel ||
                  (provider.provider === 'minimax' ||
                  (provider.provider === 'mimo' && account.productLabel)
                    ? ''
                    : provider.accountLabel);
                const subMeta = [
                  provider.accountName || provider.accountEmail,
                  planOrAccountLabel,
                ].filter(Boolean);

                return (
                  <section
                    key={account.key}
                    data-limit-account={account.key}
                    className={`glass-panel rounded-3xl p-4 sm:p-5 transition-colors ${
                      isWarn
                        ? 'border-rose-400/25'
                        : !hasHistory
                        ? 'opacity-85'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${tone.dot}`} />
                          <h3 className="text-sm font-bold text-slate-100 truncate">
                            {displayTitle}
                          </h3>
                          {account.regionLabel && (
                            <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[10px] font-medium text-slate-300">
                              {account.regionLabel}
                            </span>
                          )}
                          {!hasHistory && (
                            <span className="px-2 py-0.5 rounded-full bg-slate-500/15 border border-slate-400/25 text-[10px] text-slate-300">
                              无采集历史
                            </span>
                          )}
                        </div>

                        {subMeta.length > 0 && (
                          <p className="text-xs text-slate-300/90 mt-1 truncate">
                            {subMeta.join(' · ')}
                          </p>
                        )}

                        {provider.accountName && provider.accountEmail && (
                          <p className="text-[11px] font-mono-tabular text-slate-400 mt-0.5 truncate">
                            {provider.accountEmail}
                          </p>
                        )}

                        {account.sourceLabel && (
                          <p className="text-[11px] text-slate-400 mt-1 break-words">
                            来源设备：{account.sourceLabel}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                            isHealthy
                              ? 'bg-emerald-500/10 border-emerald-400/25 text-emerald-300'
                              : 'bg-amber-500/10 border-amber-400/25 text-amber-300'
                          }`}
                        >
                          <i
                            aria-hidden="true"
                            className={`w-1.5 h-1.5 rounded-full ${
                              isHealthy ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                          />
                          <span>{statusText}</span>
                        </span>

                        <button
                          type="button"
                          data-limit-hide={account.key}
                          onClick={() => toggleManualHide(account.key)}
                          aria-label={`隐藏 ${displayTitle}`}
                          title="隐藏此工具"
                          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
                          const barGradient = winWarn
                            ? 'bg-gradient-to-r from-amber-400 to-rose-400'
                            : winElevated
                            ? 'bg-gradient-to-r from-amber-400 to-amber-300'
                            : 'bg-gradient-to-r from-sky-400 to-emerald-400';
                          const countdown = win.resetsAt
                            ? formatRelativeCountdown(win.resetsAt)
                            : '';

                          return (
                            <div
                              key={`${win.kind || 'win'}-${wIdx}`}
                              className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-3 space-y-1.5"
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
                                  {q.remaining && !String(q.value).includes('剩余')
                                    ? `剩余 ${q.value}`
                                    : q.value}
                                </span>
                              </div>

                              {q.percent !== null && (
                                <div
                                  className="h-2 w-full rounded-full bg-white/[0.07] overflow-hidden"
                                  aria-hidden="true"
                                >
                                  <div
                                    style={{
                                      width: `${Math.max(1.5, Math.min(100, q.percent))}%`,
                                    }}
                                    className={`h-full rounded-full transition-all duration-300 ${barGradient}`}
                                  />
                                </div>
                              )}

                              {q.detail && (
                                <p className="text-[11px] text-slate-300/85 font-mono-tabular">
                                  {q.detail}
                                </p>
                              )}

                              {win.resetsAt && (
                                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 font-mono-tabular flex-wrap">
                                  <span>
                                    {win.boundaryKind === 'expiry' ? '到期时间' : '重置时间'}{' '}
                                    {formatShortTime(win.resetsAt)}
                                  </span>
                                  {countdown && (
                                    <span className="text-[10px] text-sky-300/90">
                                      {countdown}
                                    </span>
                                  )}
                                </div>
                              )}

                              {(q.description ?? win.resetDescription) && (
                                <p className="text-[11px] text-slate-400 break-words">
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
                      <details
                        data-balance-details
                        className="mt-3 pt-3 border-t border-white/8"
                      >
                        <summary className="min-h-[40px] flex items-center text-xs font-medium text-sky-300 cursor-pointer">
                          余额组成
                        </summary>
                        <dl className="mt-1.5 space-y-2 text-xs p-3 rounded-2xl glass-inset">
                          {balanceDetails.map((row) => (
                            <div key={row.key} className="flex justify-between gap-2">
                              <dt className="text-slate-400">{row.label}</dt>
                              <dd className="font-mono-tabular text-slate-200">{row.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}

                    {spend.length > 0 && (
                      <div
                        data-limit-spend
                        className="mt-3 pt-3 border-t border-white/8"
                      >
                        <p className="text-xs font-medium text-slate-300 mb-2">API 现金消费</p>
                        <dl className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl glass-inset text-xs">
                          {spend.map((row) => (
                            <div key={row.key}>
                              <dt className="text-slate-400 text-[11px]">{row.label}</dt>
                              <dd className="font-mono-tabular text-slate-100 font-semibold mt-0.5">
                                {row.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )}

                    {provider.status !== 'ok' && (
                      <p className="mt-3 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-400/20 rounded-xl p-3 leading-relaxed">
                        {hasHistory
                          ? '显示的已有读数可能来自上次成功采集。'
                          : '尚未采集到有效读数。'}
                        {code
                          ? '请在来源设备检查 MiniMax Code 登录状态。'
                          : provider.provider === 'minimax'
                          ? '请在来源设备检查此 API 账户的凭据与计费类型。'
                          : '请在来源设备处理账户状态。'}
                      </p>
                    )}

                    <div className="mt-3 pt-2.5 border-t border-white/6 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400 font-mono-tabular">
                        读数更新 {formatShortTime(provider.updatedAt)}
                      </span>

                      <button
                        type="button"
                        data-quota-history-toggle={account.key}
                        aria-expanded={openHistory === account.key}
                        onClick={() =>
                          setOpenHistory(
                            openHistory === account.key ? '' : account.key
                          )
                        }
                        className="min-h-[38px] px-3 rounded-xl glass-inset hover:border-sky-400/35 flex items-center gap-1.5 text-xs font-medium text-sky-300 transition-colors"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>额度历史</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-150 ${
                            openHistory === account.key ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
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
              }
            )}
          </div>
        ))
      )}

      {/* 4. 已隐藏工具收纳条 */}
      {(autoHiddenItems.length > 0 || manualHiddenItems.length > 0) && (
        <section
          data-limits-hidden-banner="true"
          className="glass-panel rounded-3xl p-4 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-slate-300 min-w-0">
              <EyeOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">
                {autoHiddenItems.length > 0 && `已隐藏 ${autoHiddenItems.length} 个无采集历史`}
                {autoHiddenItems.length > 0 && manualHiddenItems.length > 0 && ' · '}
                {manualHiddenItems.length > 0 && `${manualHiddenItems.length} 个手动隐藏`}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {autoHiddenItems.length > 0 && (
                <button
                  type="button"
                  data-limits-show-hidden="true"
                  onClick={() => setHideUncollected(false)}
                  className="min-h-[32px] px-2.5 rounded-xl bg-sky-500/15 border border-sky-400/30 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/25 transition-colors"
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
                  className="min-h-[32px] px-2.5 rounded-xl glass-inset text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
                >
                  {showHiddenDrawer ? '收起管理' : '管理隐藏'}
                </button>
              )}
            </div>
          </div>

          {showHiddenDrawer && manualHiddenItems.length > 0 && (
            <div className="pt-2 border-t border-white/8 space-y-1.5">
              {manualHiddenItems.map((item) => (
                <div
                  key={item.account.key}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl glass-inset text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-slate-200 truncate block">
                      {item.displayTitle}
                    </span>
                    {(item.provider.accountName || item.provider.accountEmail || item.account.sourceLabel) && (
                      <span className="text-[10px] text-slate-400 truncate block">
                        {[item.provider.accountName || item.provider.accountEmail, item.account.sourceLabel]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleManualHide(item.account.key)}
                    className="min-h-[30px] px-2.5 rounded-lg bg-sky-500/15 border border-sky-400/30 text-[11px] font-medium text-sky-200 shrink-0"
                  >
                    恢复
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setHiddenAccounts([]);
                  setShowHiddenDrawer(false);
                }}
                className="w-full min-h-[34px] rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[11px] text-slate-300 transition-colors"
              >
                全部恢复显示
              </button>
            </div>
          )}
        </section>
      )}

      <p className="text-[11px] text-slate-400/80 text-center leading-relaxed pt-3 pb-2">
        账户与来源设备按 Hub 读数展示 · 刷新只读取已有额度
      </p>
    </div>
  );
};
