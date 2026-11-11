import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Gauge,
  Layers,
  MessageSquare,
  Search,
  Server,
  TrendingUp,
  X,
} from 'lucide-react';
import { DeviceIcon } from './DeviceIcon';
import { HistoryChart } from './HistoryChart';
import { MonitorModel } from '../model/monitorModel';
import {
  BreakdownKind,
  DeviceData,
  LimitProvider,
  MonitorStats,
  PageId,
  PeriodData,
  PeriodId,
} from '../types/monitor';
import { clientTone, PERIOD_LABELS, clientName, providerName } from '../utils/formatters';

interface OverviewViewProps {
  stats: MonitorStats;
  selected: {
    period: PeriodData | null;
    providers: LimitProvider[];
    device: DeviceData | null;
    expired: boolean;
  };
  period: PeriodId;
  deviceId: string;
  breakdownKind: BreakdownKind;
  onBreakdownChange: (kind: BreakdownKind) => void;
  statusHealthy?: boolean;
  foreground?: boolean;
  fetchedAt?: number;
  now?: number;
  onSelectDevice?: (deviceId: string) => void;
  onNavigate?: (page: PageId) => void;
  onOpenSessionDetail?: (key: string) => void;
  onSelectToolSessions?: (tool: string) => void;
}

type BreakdownSortBy = 'tokens' | 'cost';

export const OverviewView: React.FC<OverviewViewProps> = ({
  stats,
  selected,
  period,
  deviceId,
  breakdownKind,
  onBreakdownChange,
  statusHealthy = true,
  foreground = true,
  fetchedAt = 0,
  now = Date.now(),
  onSelectDevice,
  onNavigate,
  onOpenSessionDetail,
  onSelectToolSessions,
}) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [showDailyList, setShowDailyList] = useState(false);
  const [breakdownSort, setBreakdownSort] = useState<BreakdownSortBy>('tokens');
  const [breakdownSearch, setBreakdownSearch] = useState('');
  const [showAllBreakdown, setShowAllBreakdown] = useState(false);
  const [showAllLimits, setShowAllLimits] = useState(false);

  useEffect(() => {
    setShowAllBreakdown(false);
  }, [period, deviceId, breakdownKind]);

  useEffect(() => {
    setShowAllLimits(false);
  }, [deviceId]);

  const p = selected.period;

  const sessionPulse = useMemo(() => {
    if (!p || period === 'allTime') return null;
    const allRows = MonitorModel.sessions(p);
    if (!allRows.length) return null;
    const statusOptions = {
      now,
      stats,
      deviceId,
      period,
      connected: statusHealthy,
      foreground,
      fetchedAt,
    };
    const statuses = allRows.map((row) => MonitorModel.sessionStatus(row, statusOptions));
    const { counts } = MonitorModel.filterSessionStatuses(statuses, 'all');
    const paired = allRows.map((row, idx) => ({ row, status: statuses[idx], idx }));
    const priority = (state: string) =>
      state === 'running' ? 0 : state === 'waiting' ? 1 : state === 'ended' ? 2 : 3;
    const topItems = paired
      .slice()
      .sort((a, b) => priority(a.status.state) - priority(b.status.state) || a.idx - b.idx)
      .slice(0, 3);
    const toolHasSessions = new Set(
      allRows.flatMap((row) => (row.groupRows || [row]).map((m) => m.client).filter(Boolean))
    );
    return {
      totalCount: allRows.length,
      runningCount: counts.running,
      waitingCount: counts.waiting,
      endedCount: counts.ended,
      topItems,
      toolHasSessions,
    };
  }, [p, period, now, stats, deviceId, statusHealthy, foreground, fetchedAt]);

  const limitsPulse = useMemo(() => {
    const providers = selected.providers || [];
    if (!providers.length) return null;
    const hasValidReading = (val?: string | null) =>
      Boolean(val) && val !== '暂无读数' && !String(val).startsWith('—');

    const items = providers.map((provider, index) => {
      const account = MonitorModel.limitAccount(provider, stats, deviceId);
      const windows = MonitorModel.limitWindows(provider);
      const quotas = windows.map((win) => ({ win, q: MonitorModel.quota(provider, win) }));
      const validQuotas = quotas.filter(
        (item) => item.q.percent !== null || hasValidReading(item.q.value)
      );
      const metered = validQuotas
        .filter((item) => item.q.percent !== null)
        .slice()
        .sort((a, b) => {
          const usedA = a.q.remaining ? 100 - (a.q.percent ?? 100) : (a.q.percent ?? 0);
          const usedB = b.q.remaining ? 100 - (b.q.percent ?? 100) : (b.q.percent ?? 0);
          return usedB - usedA;
        });
      const spend = MonitorModel.limitSpend(provider).filter((row) => hasValidReading(row.value));
      const balanceDetails = MonitorModel.limitBalanceDetails(provider).filter((row) =>
        hasValidReading(row.value)
      );

      const primary =
        metered[0] ||
        validQuotas[0] ||
        (spend[0]
          ? {
              win: null,
              q: {
                label: `${spend[0].label}消费`,
                value: spend[0].value,
                percent: null,
                remaining: false,
              },
            }
          : null) ||
        (balanceDetails[0]
          ? {
              win: null,
              q: {
                label: balanceDetails[0].label,
                value: balanceDetails[0].value,
                percent: null,
                remaining: true,
              },
            }
          : null);

      const secondaryQuotas = validQuotas
        .filter((item) => item !== primary)
        .slice(0, 2)
        .map((item) => item.q);

      const dataTier =
        metered.length > 0
          ? 3
          : validQuotas.length > 0
          ? 2
          : spend.length > 0 || balanceDetails.length > 0
          ? 1
          : 0;
      const hasCollectedData = dataTier > 0;
      const isFresh = (!provider.status || provider.status === 'ok') && !provider.stale;

      const usedScore =
        primary && primary.q.percent !== null
          ? primary.q.remaining
            ? 100 - primary.q.percent
            : primary.q.percent
          : -1;
      const isAbnormal = Boolean(provider.stale || (provider.status && provider.status !== 'ok'));
      const isWarn =
        hasCollectedData &&
        primary !== null &&
        primary.q.percent !== null &&
        (primary.q.remaining ? primary.q.percent < 15 : primary.q.percent > 85);

      return {
        key: `${account.key}:${index}`,
        provider,
        account,
        primary,
        secondaryQuotas,
        dataTier,
        hasCollectedData,
        isFresh,
        usedScore,
        isAbnormal,
        isWarn,
        index,
      };
    });

    const sortedItems = items.slice().sort((a, b) => {
      if (a.hasCollectedData !== b.hasCollectedData) {
        return Number(b.hasCollectedData) - Number(a.hasCollectedData);
      }
      if (a.isFresh !== b.isFresh) {
        return Number(b.isFresh) - Number(a.isFresh);
      }
      if (a.dataTier !== b.dataTier) {
        return b.dataTier - a.dataTier;
      }
      if (a.isWarn !== b.isWarn) {
        return Number(b.isWarn) - Number(a.isWarn);
      }
      if (b.usedScore !== a.usedScore) {
        return b.usedScore - a.usedScore;
      }
      return a.index - b.index;
    });

    const collectedItems = sortedItems.filter((item) => item.hasCollectedData);
    const warnCount = collectedItems.filter((item) => item.isWarn).length;

    return {
      totalCount: items.length,
      collectedCount: collectedItems.length,
      warnCount,
      collectedItems,
      fallbackItems: sortedItems.slice(0, 3),
    };
  }, [selected.providers, stats, deviceId]);

  const devicesPulse = useMemo(() => {
    const list = stats.devices || [];
    if (deviceId || list.length <= 1) return null;
    const rows = list
      .map((dev, index) => {
        const devSelection = MonitorModel.select(stats, dev.deviceId, period, now);
        const tokens = devSelection.period
          ? MonitorModel.count(devSelection.period.totalTokens)
          : null;
        const cost = MonitorModel.numeric(devSelection.period?.costUsd);
        return {
          device: dev,
          tokens,
          cost,
          expired: devSelection.expired,
          index,
        };
      })
      .sort(
        (a, b) =>
          (b.tokens ?? -1) - (a.tokens ?? -1) ||
          Number(a.device.stale) - Number(b.device.stale) ||
          a.index - b.index
      );
    return rows.slice(0, 4);
  }, [stats, deviceId, period, now]);

  const allBreakdownCounts = useMemo(() => {
    if (!p) return { clients: 0, models: 0, projects: 0 };
    return {
      clients: MonitorModel.breakdown(p, 'clients').length,
      models: MonitorModel.breakdown(p, 'models').length,
      projects: MonitorModel.breakdown(p, 'projects').length,
    };
  }, [p]);

  if (!p) {
    return (
      <div className="glass-panel rounded-3xl p-8 text-center my-4">
        <p className="text-base font-semibold text-slate-100 mb-1.5">
          {selected.expired ? '此设备的统计周期已结束' : '暂无统计数据'}
        </p>
        <p className="text-xs text-slate-400 leading-relaxed">
          等待采集设备向 Hub 上报当前周期的数据。
        </p>
      </div>
    );
  }

  const components = MonitorModel.components(p);
  const cache = MonitorModel.cacheEfficiency(p);
  const cacheRows = MonitorModel.cacheSessions(p);
  const activity = MonitorModel.activityDays(stats);
  const devices = stats.devices || [];
  const activeDevicesCount = devices.filter((d) => !d.stale).length;
  const unpriced = MonitorModel.count(p.unpricedTokens);
  const unclassified = MonitorModel.count(p.unclassifiedTokens);
  const trend = MonitorModel.daily(stats);
  const rows = MonitorModel.breakdown(p, breakdownKind);
  const totalTokensCount = MonitorModel.count(p.totalTokens);
  const totalCostNum = MonitorModel.numeric(p.costUsd);
  const inputTokensCount = MonitorModel.count(p.inputTokens);
  const outputTokensCount = MonitorModel.count(p.outputTokens);
  const cacheReadTokensCount = MonitorModel.count(p.cacheReadTokens);
  const cacheWriteTokensCount = MonitorModel.count(p.cacheWriteTokens);
  const heroPartsSum =
    inputTokensCount + outputTokensCount + cacheReadTokensCount + cacheWriteTokensCount;

  const avgCostPerMillion =
    totalCostNum !== null && totalCostNum > 0 && totalTokensCount > 0 && unpriced === 0
      ? (totalCostNum / totalTokensCount) * 1_000_000
      : null;

  const maxTrendTokens = trend.length
    ? Math.max(1, ...trend.map((row) => MonitorModel.count(row.tokens)))
    : 1;
  const trendTotalTokens = trend.reduce((sum, row) => sum + MonitorModel.count(row.tokens), 0);
  const avgTrendTokens = trend.length ? Math.round(trendTotalTokens / trend.length) : 0;
  const activeTrendDay =
    trend.find((row) => row.date === selectedDate) || trend[trend.length - 1] || null;
  const activeDayShare =
    activeTrendDay && trendTotalTokens > 0
      ? ((MonitorModel.count(activeTrendDay.tokens) / trendTotalTokens) * 100).toFixed(1)
      : null;

  const searchKeyword = breakdownSearch.trim().toLocaleLowerCase();
  const filteredBreakdownRows = rows.filter((row) => {
    if (!searchKeyword) return true;
    const displayLabel = breakdownKind === 'clients' ? clientName(row.label) : row.label;
    return (
      displayLabel.toLocaleLowerCase().includes(searchKeyword) ||
      row.id.toLocaleLowerCase().includes(searchKeyword)
    );
  });

  const sortedBreakdownRows =
    breakdownSort === 'cost'
      ? filteredBreakdownRows.slice().sort((a, b) => {
          const costA = a.cost ?? -1;
          const costB = b.cost ?? -1;
          if (costB !== costA) return costB - costA;
          return b.tokens - a.tokens || a.label.localeCompare(b.label);
        })
      : filteredBreakdownRows;

  const visibleRows = showAllBreakdown
    ? sortedBreakdownRows
    : sortedBreakdownRows.slice(0, 30);

  const heroSegments = [
    {
      key: 'input',
      label: '输入',
      count: inputTokensCount,
      barClass: 'bg-sky-400',
      dotClass: 'bg-sky-400',
      textClass: 'text-sky-300',
    },
    {
      key: 'output',
      label: '输出',
      count: outputTokensCount,
      barClass: 'bg-violet-400',
      dotClass: 'bg-violet-400',
      textClass: 'text-violet-300',
    },
    {
      key: 'cacheRead',
      label: '缓存读取',
      count: cacheReadTokensCount,
      barClass: 'bg-emerald-400',
      dotClass: 'bg-emerald-400',
      textClass: 'text-emerald-300',
    },
    {
      key: 'cacheWrite',
      label: '缓存写入',
      count: cacheWriteTokensCount,
      barClass: 'bg-amber-400',
      dotClass: 'bg-amber-400',
      textClass: 'text-amber-300',
    },
  ].filter((seg) => seg.count > 0);

  return (
    <div className="space-y-3.5">
      {/* 1. Hero 核心遥测看板 */}
      <section className="glass-hero rounded-3xl p-5 relative overflow-hidden">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-sky-200 tracking-wide">
              {PERIOD_LABELS[period]} Token 用量
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5">
            {deviceId ? (
              <div className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-0.5 rounded-full bg-black/30 border border-white/12 text-[11px] font-mono-tabular text-sky-200">
                <i
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 rounded-full ${
                    selected.device?.stale ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                />
                <span className="max-w-[140px] truncate">
                  {selected.device?.hostname || selected.device?.deviceId}
                </span>
                {onSelectDevice && (
                  <button
                    type="button"
                    data-clear-device="true"
                    onClick={() => onSelectDevice('')}
                    aria-label="返回全部设备统计"
                    className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-[10px] text-slate-200 transition-colors"
                  >
                    全部
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate?.('devices')}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/25 hover:bg-black/40 border border-white/10 text-[11px] font-mono-tabular text-sky-300/95 transition-colors"
              >
                <i
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 rounded-full ${
                    activeDevicesCount > 0 ? 'bg-emerald-400' : 'bg-slate-400'
                  }`}
                />
                <span>
                  {activeDevicesCount} / {devices.length} 台近期上报
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="my-3.5 flex items-end justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="token-total text-[44px] sm:text-5xl font-extrabold tracking-tight text-white font-mono-tabular leading-none break-all">
              {MonitorModel.compact(p.totalTokens)}
            </div>
            <span className="text-xs font-medium text-slate-300/80 font-mono-tabular">
              tokens
            </span>
          </div>

          <div className="inline-flex items-baseline gap-1.5 px-3 py-1 rounded-2xl bg-black/25 border border-white/10 font-mono-tabular">
            <span className="text-[10px] text-slate-400">{PERIOD_LABELS[period]}费用</span>
            <span className="text-sm font-bold text-emerald-300">
              {MonitorModel.money(p.costUsd)}
            </span>
          </div>
        </div>

        {components && heroPartsSum > 0 && (
          <div className="mb-3.5 space-y-2.5">
            <div
              className="h-2 w-full rounded-full bg-white/[0.08] overflow-hidden flex gap-[1px] p-[1px]"
              aria-hidden="true"
            >
              {heroSegments.map((seg) => (
                <div
                  key={seg.key}
                  style={{ width: `${(seg.count / heroPartsSum) * 100}%` }}
                  className={`h-full first:rounded-l-full last:rounded-r-full ${seg.barClass}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono-tabular">
              {heroSegments.map((seg) => {
                const pct = ((seg.count / heroPartsSum) * 100).toFixed(1);
                return (
                  <div
                    key={seg.key}
                    className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/20 border border-white/[0.06]"
                  >
                    <span className="inline-flex items-center gap-1.5 text-slate-300 min-w-0">
                      <i className={`w-1.5 h-1.5 rounded-full shrink-0 ${seg.dotClass}`} aria-hidden="true" />
                      <span className="truncate">{seg.label}</span>
                    </span>
                    <span className="shrink-0 text-slate-100 font-medium">
                      {MonitorModel.compact(seg.count)}
                      <span className="text-[10px] text-slate-400 ml-1">{pct}%</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="pt-3 mt-1.5 border-t border-white/10 flex items-center justify-between gap-2 flex-wrap text-xs text-slate-300/95 font-mono-tabular">
          <span>精确累计: {Number(totalTokensCount).toLocaleString('en-US')}</span>
          <div className="flex items-center gap-2.5">
            {unclassified > 0 && (
              <span className="text-[11px] text-slate-400">
                未分类 {MonitorModel.compact(unclassified)}
              </span>
            )}
            {components && (
              <span className="text-emerald-300">
                输出 {MonitorModel.compact(components.output)}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 2. 双列核心效率卡（费用 & 输入缓存命中率） */}
      <div className="grid grid-cols-2 gap-3">
        <section className="glass-panel rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">{PERIOD_LABELS[period]}费用 · USD</p>
            <div className="text-2xl font-bold text-slate-50 font-mono-tabular mt-2 mb-1 tracking-tight">
              {MonitorModel.money(p.costUsd)}
            </div>
            {avgCostPerMillion !== null && (
              <p className="text-[10px] font-mono-tabular text-sky-300/90 mb-1">
                均价 {MonitorModel.money(avgCostPerMillion)} / 1M tokens
              </p>
            )}
          </div>
          <p className="text-[11px] text-slate-400/90 leading-snug mt-1">
            {unpriced
              ? `${MonitorModel.compact(unpriced)} tokens 暂无定价；费用为已知小计`
              : '按采集端定价统计'}
          </p>
        </section>

        <section
          data-cache-hit
          className="glass-panel rounded-2xl p-4 flex flex-col justify-between"
        >
          <div>
            <p className="text-xs font-medium text-slate-400">输入缓存命中率</p>
            <div className="text-2xl font-bold text-emerald-400 font-mono-tabular mt-2 mb-1.5 tracking-tight">
              {cache ? (
                <>
                  {cache.percent.toFixed(1)}
                  <span className="text-sm font-semibold ml-0.5 text-emerald-400/80">%</span>
                </>
              ) : (
                '—'
              )}
            </div>
            {cache && (
              <div
                className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden mb-1.5"
                aria-hidden="true"
              >
                <div
                  style={{ width: `${Math.max(1.5, Math.min(100, cache.percent))}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300"
                />
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400/90 leading-snug mt-1 font-mono-tabular">
            {cache
              ? `命中 ${MonitorModel.compact(cache.hit)} · 未命中 ${MonitorModel.compact(cache.miss)}`
              : '暂无可用的输入缓存读数'}
          </p>
        </section>
      </div>

      {cache && cacheRows.length > 0 && (
        <details data-cache-sessions className="glass-panel rounded-2xl px-4">
          <summary className="min-h-[44px] py-3 text-xs font-medium text-sky-300 cursor-pointer flex items-center justify-between">
            <span>会话缓存明细 · {cacheRows.length}</span>
            <span className="text-[11px] text-slate-400 font-mono-tabular">点击展开</span>
          </summary>
          <p className="text-[11px] text-slate-400 mb-3">
            按已观测输入量排序，包含已结束会话；输出与未知用量不计入命中率。
          </p>
          <ul className="max-h-80 overflow-y-auto space-y-3 pb-4" aria-label="会话缓存命中明细">
            {cacheRows.map((row) => (
              <li key={row.key} className="border-t border-white/8 pt-3 text-xs">
                <div className="flex justify-between items-start gap-3">
                  <span className="min-w-0 break-words text-slate-200 font-medium">
                    {row.title}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-emerald-300 font-mono-tabular font-semibold">
                      {row.percent.toFixed(1)}%
                    </span>
                    {onOpenSessionDetail && period !== 'allTime' && (
                      <button
                        type="button"
                        onClick={() => onOpenSessionDetail(row.key)}
                        aria-label={`查看会话 ${row.title} 详情`}
                        className="px-2 py-0.5 rounded-lg bg-white/[0.05] hover:bg-sky-400/15 text-[10px] text-sky-300 transition-colors"
                      >
                        详情
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 font-mono-tabular">
                  {clientName(row.client)} · 命中 {MonitorModel.compact(row.hit)} · 未命中{' '}
                  {MonitorModel.compact(row.miss)}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* 3. 全局关键状态速览 (仿照桌面端 Home 模块化速览) */}
      {(sessionPulse || limitsPulse || devicesPulse) && (
        <div className="space-y-3 pt-1">
          {/* 3A. 实时会话速览 */}
          {sessionPulse && (
            <section
              data-overview-sessions="true"
              className="glass-panel rounded-3xl p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="w-4 h-4 text-sky-400 shrink-0" />
                  <h3 className="text-xs font-semibold text-slate-100 truncate">实时会话速览</h3>
                  <div className="flex items-center gap-1.5 font-mono-tabular text-[10px]">
                    {sessionPulse.runningCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-400/25 text-emerald-300">
                        <i className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                        <span>{sessionPulse.runningCount} 运行中</span>
                      </span>
                    )}
                    {sessionPulse.waitingCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/12 border border-amber-400/25 text-amber-300">
                        <span>{sessionPulse.waitingCount} 等待</span>
                      </span>
                    )}
                    {sessionPulse.runningCount === 0 && sessionPulse.waitingCount === 0 && (
                      <span className="text-slate-400">共 {sessionPulse.totalCount} 个会话</span>
                    )}
                  </div>
                </div>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('sessions')}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-300 hover:text-sky-200 shrink-0"
                  >
                    <span>全部 ({sessionPulse.totalCount})</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {sessionPulse.topItems.map(({ row, status }) => {
                  const tone = clientTone(row.client);
                  const targetKey = row.detailKey || row.key;
                  const stateTone =
                    status.state === 'running'
                      ? 'text-emerald-300'
                      : status.state === 'waiting' || status.source === 'inferred'
                      ? 'text-amber-300'
                      : status.state === 'ended'
                      ? 'text-sky-300'
                      : 'text-slate-400';
                  const stateDot =
                    status.state === 'running'
                      ? 'bg-emerald-400'
                      : status.state === 'waiting' || status.source === 'inferred'
                      ? 'bg-amber-400'
                      : status.state === 'ended'
                      ? 'bg-sky-400'
                      : 'bg-slate-500';
                  return (
                    <button
                      key={row.key}
                      type="button"
                      data-overview-session={targetKey}
                      onClick={() =>
                        onOpenSessionDetail
                          ? onOpenSessionDetail(targetKey)
                          : onNavigate?.('sessions')
                      }
                      className="w-full text-left px-3 py-2.5 rounded-2xl bg-white/[0.025] hover:bg-white/[0.06] border border-white/[0.06] transition-colors flex items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <i className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />
                          <span className="text-xs font-medium text-slate-100 truncate">
                            {row.title || row.projectLabel || row.sessionId || row.key}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400 font-mono-tabular truncate">
                          <span>{clientName(row.client)}</span>
                          <span>·</span>
                          <span className="truncate">{MonitorModel.sessionModelLabel(row)}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 font-mono-tabular">
                        <div className="text-xs font-semibold text-slate-100">
                          {MonitorModel.compact(row.totalTokens)}
                        </div>
                        <div className={`inline-flex items-center gap-1 text-[10px] mt-0.5 ${stateTone}`}>
                          <i className={`w-1.5 h-1.5 rounded-full ${stateDot}`} aria-hidden="true" />
                          <span>{status.label}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* 3B. 核心额度速览与预警 */}
          {limitsPulse && (
            <section
              data-overview-limits="true"
              className="glass-panel rounded-3xl p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Gauge className="w-4 h-4 text-sky-400 shrink-0" />
                  <h3 className="text-xs font-semibold text-slate-100 truncate">核心额度速览</h3>
                  {limitsPulse.collectedCount > 0 ? (
                    limitsPulse.warnCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/12 border border-amber-400/25 text-[10px] font-mono-tabular text-amber-300">
                        已采集 {limitsPulse.collectedCount} · {limitsPulse.warnCount} 项预警
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-400/20 text-[10px] font-mono-tabular text-emerald-300">
                        已采集 {limitsPulse.collectedCount} 个账户
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] font-mono-tabular text-slate-400">
                      共 {limitsPulse.totalCount} 个账户
                    </span>
                  )}
                </div>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('limits')}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-300 hover:text-sky-200 shrink-0"
                  >
                    <span>全部额度</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {limitsPulse.collectedCount === 0 ? (
                <button
                  type="button"
                  onClick={() => onNavigate?.('limits')}
                  className="w-full text-left px-3 py-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] text-xs text-slate-400 flex items-center justify-between gap-2 transition-colors"
                >
                  <span>当前尚无已采集到有效读数的额度账户，点击查看账户配置状态</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              ) : (
                <>
                  <div className="space-y-2">
                    {(showAllLimits
                      ? limitsPulse.collectedItems
                      : limitsPulse.collectedItems.slice(0, 4)
                    ).map(
                      ({
                        key,
                        provider,
                        account,
                        primary,
                        secondaryQuotas,
                        isWarn,
                        isFresh,
                      }) => {
                        const tone = clientTone(provider.provider);
                        const displayTitle = account.productLabel || providerName(provider.provider);
                        const subLabel =
                          provider.accountName ||
                          provider.accountEmail ||
                          provider.planLabel ||
                          account.regionLabel ||
                          '';
                        const q = primary?.q || null;
                        return (
                          <button
                            key={key}
                            type="button"
                            data-overview-limit={account.key}
                            onClick={() => onNavigate?.('limits')}
                            className="w-full text-left px-3 py-2.5 rounded-2xl bg-white/[0.025] hover:bg-white/[0.06] border border-white/[0.06] transition-colors space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <i
                                  className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`}
                                  aria-hidden="true"
                                />
                                <span className="font-medium text-slate-100 truncate">
                                  {displayTitle}
                                </span>
                                {subLabel && (
                                  <span className="text-[10px] text-slate-400 truncate">
                                    · {subLabel}
                                  </span>
                                )}
                                {!isFresh && (
                                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500/10 border border-amber-400/20 text-[9px] text-amber-300 shrink-0">
                                    历史读数
                                  </span>
                                )}
                              </div>
                              <span
                                className={`text-[11px] font-mono-tabular font-semibold shrink-0 ${
                                  isWarn ? 'text-amber-300' : 'text-sky-300'
                                }`}
                              >
                                {q
                                  ? `${q.label}: ${q.remaining ? `剩余 ${q.value}` : q.value}`
                                  : '查看详情'}
                              </span>
                            </div>

                            {q && q.percent !== null && (
                              <div
                                className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden"
                                aria-hidden="true"
                              >
                                <div
                                  style={{ width: `${Math.max(1.5, Math.min(100, q.percent))}%` }}
                                  className={`h-full rounded-full ${
                                    isWarn
                                      ? 'bg-gradient-to-r from-amber-400 to-rose-400'
                                      : 'bg-gradient-to-r from-sky-400 to-emerald-400'
                                  }`}
                                />
                              </div>
                            )}

                            {(q?.detail || secondaryQuotas.length > 0) && (
                              <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 font-mono-tabular pt-0.5">
                                <span className="truncate">{q?.detail || ''}</span>
                                {secondaryQuotas.length > 0 && (
                                  <span className="truncate text-right text-slate-300/85">
                                    {secondaryQuotas
                                      .map(
                                        (sq) =>
                                          `${sq.label}: ${
                                            sq.remaining ? `剩余 ${sq.value}` : sq.value
                                          }`
                                      )
                                      .join(' · ')}
                                  </span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      }
                    )}
                  </div>

                  {limitsPulse.collectedCount > 4 && (
                    <button
                      type="button"
                      data-overview-limits-expand="true"
                      onClick={() => setShowAllLimits((prev) => !prev)}
                      className="w-full py-1.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] text-[11px] font-medium text-sky-300 transition-colors"
                    >
                      {showAllLimits
                        ? '收起至前 4 项已采集账户'
                        : `展开全部已采集账户 (${limitsPulse.collectedCount})`}
                    </button>
                  )}
                </>
              )}
            </section>
          )}

          {/* 3C. 多设备贡献速览 */}
          {devicesPulse && (
            <section
              data-overview-devices="true"
              className="glass-panel rounded-3xl p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Server className="w-4 h-4 text-sky-400 shrink-0" />
                  <h3 className="text-xs font-semibold text-slate-100 truncate">
                    设备用量贡献
                  </h3>
                  <span className="text-[10px] font-mono-tabular text-slate-400">
                    轻触筛选单台设备
                  </span>
                </div>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('devices')}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-300 hover:text-sky-200 shrink-0"
                  >
                    <span>设备页</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {devicesPulse.map(({ device: dev, tokens, cost, expired }) => {
                  const pct =
                    tokens !== null && totalTokensCount > 0
                      ? Math.min(100, (tokens / totalTokensCount) * 100)
                      : 0;
                  return (
                    <button
                      key={dev.deviceId}
                      type="button"
                      data-overview-device={dev.deviceId}
                      onClick={() => onSelectDevice?.(dev.deviceId)}
                      className="text-left p-2.5 rounded-2xl bg-white/[0.025] hover:bg-white/[0.06] border border-white/[0.06] transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <DeviceIcon
                            kind={dev.deviceKind}
                            className="w-3.5 h-3.5 text-sky-300 shrink-0"
                          />
                          <span className="text-xs font-medium text-slate-100 truncate">
                            {dev.hostname || dev.deviceId}
                          </span>
                        </div>
                        <i
                          aria-hidden="true"
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            dev.stale ? 'bg-amber-400' : 'bg-emerald-400'
                          }`}
                        />
                      </div>

                      <div className="flex items-baseline justify-between gap-1 font-mono-tabular">
                        <span className="text-xs font-bold text-slate-100">
                          {tokens === null ? '—' : MonitorModel.compact(tokens)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {tokens === null
                            ? expired ? '周期已结束' : '暂无读数'
                            : cost !== null ? MonitorModel.money(cost) : `${pct.toFixed(0)}%`}
                        </span>
                      </div>

                      <div
                        className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden"
                        aria-hidden="true"
                      >
                        <div
                          style={{ width: `${tokens !== null && tokens > 0 ? Math.max(2, pct) : 0}%` }}
                          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-300"
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* 4. 统一「历史与每日趋势」联动面板 */}
      {!deviceId && (
        <div className="pt-2">
          <div className="flex items-baseline justify-between mb-2.5 px-1">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <span>每日趋势</span>
            </h3>
            <span className="text-[11px] text-slate-400">
              全部设备 · 最近 14 个有记录日
            </span>
          </div>
          {activity && (
            <p data-active-days className="text-[11px] text-slate-400 px-1 mb-3">
              {activity.complete ? '累计活跃' : '所示日期内活跃'} {activity.count} 天
            </p>
          )}

          {trend.length > 0 ? (
            <section className="trend-card glass-panel rounded-3xl p-5">
              <HistoryChart
                trend={trend}
                selectedDate={activeTrendDay?.date}
                onSelectDate={setSelectedDate}
                embedded={true}
              />

              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div
                  className="trend-selection text-xs text-slate-300 font-mono-tabular"
                  aria-live="polite"
                >
                  {activeTrendDay ? (
                    <span>
                      <strong className="text-white">{activeTrendDay.date}</strong>
                      <span className="mx-1.5 text-slate-500">·</span>
                      <span className="text-sky-300 font-semibold">
                        {MonitorModel.compact(activeTrendDay.tokens)}
                      </span>
                      {MonitorModel.numeric(activeTrendDay.cost) !== null && (
                        <>
                          <span className="mx-1.5 text-slate-500">·</span>
                          <span className="text-emerald-300">
                            {MonitorModel.money(activeTrendDay.cost)}
                          </span>
                        </>
                      )}
                      {activeDayShare && (
                        <>
                          <span className="mx-1.5 text-slate-500">·</span>
                          <span className="text-slate-400">{activeDayShare}%</span>
                        </>
                      )}
                    </span>
                  ) : (
                    <span>Token 用量</span>
                  )}
                </div>
                <span className="text-[11px] font-mono-tabular text-slate-400">
                  日均 {MonitorModel.compact(avgTrendTokens)} · 合计{' '}
                  {MonitorModel.compact(trendTotalTokens)}
                </span>
              </div>

              <div
                className="flex items-end gap-1.5 h-32 pt-3 pb-1 border-b border-white/8"
                role="group"
                aria-label="每日 Token 用量，轻触柱体查看单日详情"
              >
                {trend.map((row) => {
                  const pct = Math.max(
                    5,
                    (MonitorModel.count(row.tokens) / maxTrendTokens) * 100
                  );
                  const isSelected = activeTrendDay?.date === row.date;
                  return (
                    <button
                      key={row.date}
                      type="button"
                      onClick={() => setSelectedDate(row.date)}
                      data-trend={row.date}
                      aria-pressed={isSelected}
                      aria-label={`${row.date} · ${MonitorModel.compact(row.tokens)} tokens · ${MonitorModel.money(row.cost)}`}
                      title={`${row.date} · ${MonitorModel.compact(row.tokens)}`}
                      className="trend-col flex-1 h-full flex flex-col justify-end items-center group rounded-t-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 min-h-0"
                    >
                      <div
                        style={{ height: `${pct}%` }}
                        className={`trend-bar w-full rounded-t-md transition-all duration-150 ${
                          isSelected
                            ? 'bg-gradient-to-t from-sky-500/85 to-cyan-300 shadow-[0_0_12px_rgba(56,189,248,0.45)]'
                            : 'bg-gradient-to-t from-sky-500/25 to-sky-400/55 group-hover:from-sky-400/50 group-hover:to-cyan-300/80'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-between text-[11px] font-mono-tabular text-slate-400 pt-2">
                <span>{trend[0].date.slice(5)}</span>
                <span className="text-slate-500 text-[10px]">轻触柱体或曲线节点查看单日详情</span>
                <span>{trend[trend.length - 1].date.slice(5)}</span>
              </div>

              <div className="daily-details mt-3 pt-2.5 border-t border-white/6">
                <button
                  type="button"
                  onClick={() => setShowDailyList((prev) => !prev)}
                  data-daily-toggle="true"
                  aria-expanded={showDailyList}
                  className="w-full min-h-[40px] flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <span>查看每日数值明细 ({trend.length} 天)</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-150 ${
                      showDailyList ? 'rotate-180 text-sky-400' : ''
                    }`}
                  />
                </button>
                {showDailyList && (
                  <div
                    data-daily-values="true"
                    className="mt-2 space-y-1.5 pt-1 max-h-60 overflow-y-auto pr-1"
                  >
                    {trend
                      .slice()
                      .reverse()
                      .map((row) => {
                        const isSelected = activeTrendDay?.date === row.date;
                        return (
                          <button
                            key={row.date}
                            type="button"
                            onClick={() => setSelectedDate(row.date)}
                            className={`w-full flex items-center justify-between text-xs py-2 px-3 rounded-xl border font-mono-tabular transition-colors ${
                              isSelected
                                ? 'bg-sky-500/12 border-sky-400/30 text-white'
                                : 'bg-white/[0.02] border-white/[0.04] text-slate-300 hover:bg-white/[0.05]'
                            }`}
                          >
                            <span>{row.date}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-100 font-semibold">
                                {MonitorModel.compact(row.tokens)}
                              </span>
                              <span className="text-slate-400 w-16 text-right">
                                {MonitorModel.money(row.cost)}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            </section>
          ) : (
            <div className="glass-panel rounded-3xl p-6 text-center">
              <p className="text-sm font-semibold text-slate-200 mb-1">暂无历史趋势</p>
              <p className="text-xs text-slate-400">请在采集设备开启历史记录并等待上传。</p>
            </div>
          )}
        </div>
      )}

      {/* 5. 多维用量分布面板 */}
      <div className="pt-2">
        <div className="flex items-baseline justify-between mb-2.5 px-1">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-sky-400" />
            <span>用量分布</span>
          </h3>
          <div
            className="inline-flex rounded-xl bg-white/[0.04] border border-white/[0.08] p-0.5"
            role="group"
            aria-label="用量分布排序方式"
          >
            {(
              [
                ['tokens', '按 Token'],
                ['cost', '按费用'],
              ] as Array<[BreakdownSortBy, string]>
            ).map(([sortKey, sortLabel]) => {
              const active = breakdownSort === sortKey;
              return (
                <button
                  key={sortKey}
                  type="button"
                  data-breakdown-sort={sortKey}
                  aria-pressed={active}
                  onClick={() => setBreakdownSort(sortKey)}
                  className={`min-h-[28px] px-2.5 rounded-lg text-[10px] font-semibold transition-colors ${
                    active
                      ? 'bg-sky-400/20 text-sky-200 border border-sky-400/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sortLabel}
                </button>
              );
            })}
          </div>
        </div>

        <section className="glass-panel rounded-3xl p-5">
          <div className="glass-inset p-1 rounded-2xl flex gap-1 mb-3.5">
            {(
              [
                ['clients', '工具', allBreakdownCounts.clients],
                ['models', '模型', allBreakdownCounts.models],
                ['projects', '项目', allBreakdownCounts.projects],
              ] as Array<[BreakdownKind, string, number]>
            ).map(([kind, label, count]) => {
              const active = breakdownKind === kind;
              return (
                <button
                  key={kind}
                  data-breakdown={kind}
                  type="button"
                  onClick={() => onBreakdownChange(kind)}
                  aria-pressed={active}
                  className={`flex-1 min-h-[40px] rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 ${
                    active
                      ? 'bg-slate-800/95 text-white shadow-sm border border-white/10'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{label}</span>
                  {count > 0 && (
                    <span className="text-[10px] font-mono-tabular opacity-75">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {(rows.length > 5 || breakdownSearch !== '') && (
            <div className="relative flex items-center mb-3.5">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="search"
                data-breakdown-search="true"
                value={breakdownSearch}
                onChange={(e) => {
                  setBreakdownSearch(e.target.value);
                  setShowAllBreakdown(false);
                }}
                placeholder={`筛选${
                  breakdownKind === 'clients'
                    ? '工具'
                    : breakdownKind === 'models'
                    ? '模型'
                    : '项目'
                }名称…`}
                autoComplete="off"
                className="w-full min-h-[38px] pl-9 pr-9 py-1.5 rounded-xl glass-inset text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60 transition-colors"
              />
              {breakdownSearch && (
                <button
                  type="button"
                  onClick={() => setBreakdownSearch('')}
                  aria-label="清除分布筛选"
                  className="w-8 h-8 flex items-center justify-center absolute right-1 text-slate-400 hover:text-slate-200 rounded-lg"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {visibleRows.length > 0 ? (
            <div className="space-y-3.5">
              {visibleRows.map((row, idx) => {
                const tokenPct =
                  totalTokensCount > 0 ? Math.min(100, (row.tokens / totalTokensCount) * 100) : 0;
                const costPct =
                  totalCostNum !== null && totalCostNum > 0 && row.cost !== null
                    ? Math.min(100, (row.cost / totalCostNum) * 100)
                    : null;
                const pct =
                  breakdownSort === 'cost' && costPct !== null ? costPct : tokenPct;
                const displayLabel =
                  breakdownKind === 'clients' ? clientName(row.label) : row.label;
                const tone =
                  breakdownKind === 'clients' ? clientTone(row.id) : clientTone(undefined);
                const canDrillSessions =
                  breakdownKind === 'clients' &&
                  period !== 'allTime' &&
                  Boolean(onSelectToolSessions) &&
                  Boolean(sessionPulse?.toolHasSessions.has(row.id));

                return (
                  <div key={row.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono-tabular text-slate-500 w-4 shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        {breakdownKind === 'clients' && (
                          <i
                            className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`}
                            aria-hidden="true"
                          />
                        )}
                        <span className="font-medium text-slate-100 truncate">
                          {displayLabel}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                          {pct >= 0.1 ? `${pct.toFixed(1)}%` : '<0.1%'}
                        </span>
                        {canDrillSessions && (
                          <button
                            type="button"
                            data-breakdown-tool-sessions={row.id}
                            onClick={() => onSelectToolSessions?.(row.id)}
                            aria-label={`查看 ${displayLabel} 的会话`}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/[0.05] hover:bg-sky-400/15 text-[10px] text-sky-300 transition-colors shrink-0"
                          >
                            <span>会话</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2 shrink-0 font-mono-tabular">
                        <span
                          className={
                            breakdownSort === 'tokens'
                              ? 'font-semibold text-slate-100'
                              : 'text-[11px] text-slate-400'
                          }
                        >
                          {MonitorModel.compact(row.tokens)}
                        </span>
                        <span
                          className={
                            breakdownSort === 'cost'
                              ? 'font-semibold text-emerald-300'
                              : 'text-[11px] text-slate-400'
                          }
                        >
                          {MonitorModel.money(row.cost)}
                        </span>
                      </div>
                    </div>

                    <div
                      className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden"
                      aria-hidden="true"
                    >
                      <div
                        style={{ width: `${Math.max(1.5, pct)}%` }}
                        className={`h-full rounded-full bg-gradient-to-r ${tone.bar} transition-all duration-300`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400 py-6">
              {searchKeyword ? '无匹配的分布项' : '此周期暂无明细'}
            </p>
          )}

          {sortedBreakdownRows.length > 30 && (
            <div className="mt-4 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-400/20 rounded-xl p-3 flex items-center justify-between gap-3 leading-relaxed">
              <span>
                {showAllBreakdown
                  ? `已展示全部 ${sortedBreakdownRows.length} 项明细；总量保持完整。`
                  : `仅列出${breakdownSort === 'cost' ? '费用' : '用量'}最高的 ${visibleRows.length} 项，共 ${sortedBreakdownRows.length} 项；总量保持完整。`}
              </span>
              <button
                type="button"
                data-breakdown-expand="true"
                onClick={() => setShowAllBreakdown((prev) => !prev)}
                className="px-2.5 py-1 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 border border-amber-300/30 text-[11px] font-semibold text-amber-200 whitespace-nowrap shrink-0 transition-colors"
              >
                {showAllBreakdown ? '收起至前 30 项' : `展开全部 (${sortedBreakdownRows.length} 项)`}
              </button>
            </div>
          )}

          {breakdownKind === 'projects' &&
            (stats.projectsIncomplete || stats.periodProjectsOmitted?.[period]) && (
              <p className="mt-3 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-400/20 rounded-xl p-3 leading-relaxed">
                部分设备未提供完整项目明细，项目合计可能小于总用量。
              </p>
            )}
        </section>
      </div>

      <p className="text-[11px] text-slate-400/80 text-center leading-relaxed pt-3 pb-2">
        数据来自 Hub · 保留离线设备历史
        <br />
        今日与本月使用各采集设备的本地统计周期
      </p>
    </div>
  );
};
