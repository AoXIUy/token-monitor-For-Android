import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Gauge,
  Layers,
  MessageSquare,
  Server,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { DeviceIcon } from './DeviceIcon';
import { HistoryChart } from './HistoryChart';
import {
  DetailsDisclosure,
  EmptyState,
  InlineAlert,
  ProgressMeter,
  SearchField,
  SectionHeader,
  SegmentedControl,
} from './ui/Primitives';
import { DeviceBreakdownRow, MonitorModel } from '../model/monitorModel';
import {
  BreakdownKind,
  DeviceData,
  LimitAccountPresentationMap,
  LimitProvider,
  LimitsPrefs,
  MonitorStats,
  PageId,
  PeriodData,
  PeriodId,
  ReportGranularity,
} from '../types/monitor';
import {
  clientTone,
  formatExact,
  formatRelativeCountdown,
  PERIOD_LABELS,
  clientName,
  providerName,
} from '../utils/formatters';
import { sha256Hex } from '../utils/limitsPrefs';

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
  fixedRangeStatus?: 'native' | 'ready' | 'partial' | 'loading' | 'unavailable';
  fixedRangeRange?: { start: string; end: string } | null;
  detailsAvailable?: boolean;
  statusHealthy?: boolean;
  foreground?: boolean;
  fetchedAt?: number;
  now?: number;
  onSelectDevice?: (deviceId: string) => void;
  onNavigate?: (page: PageId) => void;
  onOpenSessionDetail?: (key: string) => void;
  onSelectToolSessions?: (tool: string) => void;
  onOpenReports?: (granularity: ReportGranularity) => void;
  onOpenReportWindow?: (granularity?: ReportGranularity) => void;
  separateQoderClients?: boolean;
  exactTrendTokens?: boolean;
  limitAccountPresentation?: LimitAccountPresentationMap;
  limitsPrefs?: LimitsPrefs;
}

type BreakdownSortBy = 'tokens' | 'cost';

const BREAKDOWN_SEARCH_LABELS: Record<BreakdownKind, string> = {
  clients: '筛选工具名称',
  devices: '搜索设备名称、ID 或系统',
  models: '筛选模型名称',
  projects: '筛选项目名称',
};

function formatSharePct(pct: number): string {
  if (pct <= 0) return '0.0%';
  return pct >= 0.1 ? `${pct.toFixed(1)}%` : '<0.1%';
}

interface DeviceBreakdownRowCardProps {
  row: DeviceBreakdownRow;
  rank: number;
  breakdownSort: BreakdownSortBy;
  activeTokensTotal: number;
  activeCostTotal: number | null;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectDevice?: (deviceId: string) => void;
}

const DeviceBreakdownRowCard: React.FC<DeviceBreakdownRowCardProps> = ({
  row,
  rank,
  breakdownSort,
  activeTokensTotal,
  activeCostTotal,
  isExpanded,
  onToggle,
  onSelectDevice,
}) => {
  const tokenPct =
    row.available && row.tokens !== null && activeTokensTotal > 0
      ? Math.min(100, (row.tokens / activeTokensTotal) * 100)
      : 0;
  const costPct =
    row.available && activeCostTotal !== null && activeCostTotal > 0 && row.cost !== null
      ? Math.min(100, (row.cost / activeCostTotal) * 100)
      : null;
  const pct = breakdownSort === 'cost' && costPct !== null ? costPct : tokenPct;
  const osLabel = row.osName
    ? row.osVersion
      ? `${row.osName} ${row.osVersion}`
      : row.osName
    : row.platform || '';
  const subtitleParts = [
    row.hostname && row.hostname !== row.deviceId ? row.deviceId : null,
    osLabel || null,
    row.available && row.stale ? '状态过期' : null,
  ].filter(Boolean) as string[];

  // Note: Do NOT add `truncate` (text-overflow: ellipsis) on spans inside this card;
  // StartupTest asserts full unwrapped/wrapped visibility without ellipsis clipping.
  return (
    <div
      data-breakdown-device={row.deviceId}
      className="rounded-2xl bg-[var(--tm-bg-row)] border border-[var(--tm-border-subtle)] p-3.5 space-y-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          data-breakdown-device-toggle={row.deviceId}
          aria-expanded={row.available ? isExpanded : undefined}
          disabled={!row.available}
          onClick={onToggle}
          className={`flex-1 min-w-0 min-h-[44px] text-left flex items-start gap-1.5 py-1 ${
            row.available ? 'cursor-pointer' : 'cursor-default opacity-85'
          }`}
        >
          <span className="text-[11px] font-mono-tabular text-[var(--tm-text-muted)] w-5 shrink-0 pt-0.5">
            {String(rank).padStart(2, '0')}
          </span>
          {row.available && (
            <ChevronRight
              aria-hidden="true"
              className={`w-3.5 h-3.5 shrink-0 mt-0.5 transition-transform duration-150 ${
                isExpanded
                  ? 'rotate-90 text-[var(--tm-accent)]'
                  : 'text-[var(--tm-text-muted)]'
              }`}
            />
          )}
          <DeviceIcon kind={row.deviceKind} className="w-3.5 h-3.5 text-[var(--tm-accent)] shrink-0 mt-0.5" />
          <i
            aria-hidden="true"
            className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
              !row.available
                ? 'bg-[var(--tm-text-muted)]'
                : row.stale
                ? 'bg-[var(--tm-warning)]'
                : 'bg-[var(--tm-success)]'
            }`}
          />
          <span className="text-[13px] leading-snug font-semibold text-[var(--tm-text-primary)] [overflow-wrap:anywhere] min-w-0">
            {row.label}
          </span>
        </button>

        {onSelectDevice && (
          <button
            type="button"
            data-breakdown-device-filter={row.deviceId}
            onClick={() => onSelectDevice(row.deviceId)}
            aria-label={`筛选设备 ${row.label}`}
            className="inline-flex items-center justify-center gap-1 min-h-[44px] px-3 py-1 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-border-default)] text-[11px] font-semibold text-[var(--tm-accent-text)] active:scale-[0.97] transition-all shrink-0"
          >
            <span>筛选</span>
            <ArrowRight className="w-3 h-3 shrink-0" aria-hidden="true" />
          </button>
        )}
      </div>

      <div
        onClick={row.available ? onToggle : undefined}
        className={`space-y-2 ${row.available ? 'cursor-pointer' : ''}`}
      >
        {subtitleParts.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-snug text-[var(--tm-text-muted)] tabular-nums">
            {row.hostname && row.hostname !== row.deviceId && (
              <span className="font-mono-tabular text-[var(--tm-text-secondary)] [overflow-wrap:anywhere]">
                {row.deviceId}
              </span>
            )}
            {osLabel && <span className="[overflow-wrap:anywhere]">{osLabel}</span>}
            {row.available && row.stale && (
              <span className="px-2 py-0.5 rounded-md bg-[var(--tm-warning-soft-bg)] border border-[var(--tm-warning-soft-border)] text-[11px] text-[var(--tm-warning-text)]">
                状态过期
              </span>
            )}
          </div>
        )}

        <div className="flex items-baseline justify-between gap-2 tabular-nums">
          {row.available ? (
            <>
              <span className="text-[11px] text-[var(--tm-text-muted)]">占比 {formatSharePct(pct)}</span>
              <div className="flex items-baseline gap-2.5 text-xs font-mono-tabular">
                <span
                  className={
                    breakdownSort === 'tokens'
                      ? 'font-semibold text-[var(--tm-text-primary)]'
                      : 'text-[11px] text-[var(--tm-text-muted)]'
                  }
                >
                  {MonitorModel.compact(row.tokens)}
                </span>
                <span
                  className={
                    breakdownSort === 'cost'
                      ? 'font-semibold text-[var(--tm-success-text)]'
                      : 'text-[11px] text-[var(--tm-text-muted)]'
                  }
                >
                  {MonitorModel.money(row.cost)}
                </span>
              </div>
            </>
          ) : (
            <>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--tm-bg-control)] text-[var(--tm-text-secondary)]">
                {row.expired ? '周期已结束' : '暂无读数'}
              </span>
              <span className="text-xs font-mono-tabular font-semibold text-[var(--tm-text-muted)]">—</span>
            </>
          )}
        </div>

        <ProgressMeter percent={row.available && (row.tokens ?? 0) > 0 ? pct : 0} tone="sky" />
      </div>

      {isExpanded && row.available && (
        <div
          data-breakdown-device-tools={row.deviceId}
          className="pt-2.5 mt-1 border-t border-[var(--tm-border-subtle)] space-y-2"
        >
          <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--tm-text-muted)]">
            <span>工具构成</span>
            {row.agentVersion && (
              <span className="font-mono-tabular">Agent v{row.agentVersion}</span>
            )}
          </div>
          {row.clients.length > 0 ? (
            <div className="space-y-2">
              {row.clients.map((tool) => {
                const isUnattributed = tool.id === '__unattributed__';
                const toolPct =
                  row.tokens && row.tokens > 0
                    ? Math.min(100, (tool.tokens / row.tokens) * 100)
                    : 0;
                const tTone = isUnattributed
                  ? { dot: 'bg-[var(--tm-text-muted)]', bar: 'from-slate-400 to-slate-500' }
                  : clientTone(tool.id);
                const toolTitle = isUnattributed ? '未归因' : clientName(tool.label);
                return (
                  <div key={tool.id} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-[11px] flex-wrap">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <i
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${tTone.dot}`}
                          aria-hidden="true"
                        />
                        <span className="text-[var(--tm-text-primary)] [overflow-wrap:anywhere]">{toolTitle}</span>
                        <span className="text-[11px] font-mono-tabular text-[var(--tm-text-muted)] shrink-0">
                          {formatSharePct(toolPct)}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 shrink-0 font-mono-tabular text-[11px]">
                        <span className="text-[var(--tm-text-primary)]">{MonitorModel.compact(tool.tokens)}</span>
                        <span className="text-[var(--tm-text-muted)]">{MonitorModel.money(tool.cost)}</span>
                      </div>
                    </div>
                    <ProgressMeter
                      percent={tool.tokens > 0 ? toolPct : 0}
                      tone="custom"
                      barClassName={`bg-gradient-to-r ${tTone.bar}`}
                      heightClass="h-1"
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-[var(--tm-text-muted)] py-1">
              {(row.tokens ?? 0) === 0 ? '当前周期暂无工具用量记录' : '该设备暂未上报各工具明细'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export const OverviewView: React.FC<OverviewViewProps> = ({
  stats,
  selected,
  period,
  deviceId,
  breakdownKind,
  onBreakdownChange,
  fixedRangeStatus = 'native',
  fixedRangeRange = null,
  detailsAvailable = true,
  statusHealthy = true,
  foreground = true,
  fetchedAt = 0,
  now = Date.now(),
  onSelectDevice,
  onNavigate,
  onOpenSessionDetail,
  onSelectToolSessions,
  onOpenReports,
  onOpenReportWindow,
  separateQoderClients = false,
  exactTrendTokens = false,
  limitAccountPresentation,
  limitsPrefs,
}) => {
  const formatTrendTokens = (tokens: unknown) =>
    exactTrendTokens ? formatExact(tokens) : MonitorModel.compact(tokens);
  const breakdownSectionRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [chartMode, setChartMode] = useState<'daily' | 'cumulative'>('daily');
  const [chartStyle, setChartStyle] = useState<'line' | 'bar'>('line');
  const [showDailyList, setShowDailyList] = useState(false);
  const [breakdownSort, setBreakdownSort] = useState<BreakdownSortBy>('tokens');
  const [breakdownSearch, setBreakdownSearch] = useState('');
  const [showAllBreakdown, setShowAllBreakdown] = useState(false);
  const [expandedBreakdownDevices, setExpandedBreakdownDevices] = useState<Set<string>>(() => new Set());
  const [showAllLimits, setShowAllLimits] = useState(false);
  const [overviewSessionsMode, setOverviewSessionsMode] = useState<'detailed' | 'compact'>('detailed');

  useEffect(() => {
    setShowAllBreakdown(false);
    setExpandedBreakdownDevices(new Set());
  }, [period, deviceId, breakdownKind]);

  // Clear cross-domain search query whenever breakdown dimension changes (tools / devices / models / projects).
  useEffect(() => {
    setBreakdownSearch('');
  }, [breakdownKind]);

  useEffect(() => {
    setShowAllLimits(false);
  }, [deviceId]);

  const p = selected.period;

  const sessionPulse = useMemo(() => {
    if (!p || period === 'allTime' || detailsAvailable === false) return null;
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
  }, [p, period, detailsAvailable, now, stats, deviceId, statusHealthy, foreground, fetchedAt]);

  const limitsPulse = useMemo(() => {
    const providers = selected.providers || [];
    if (!providers.length) return null;
    const hasValidReading = (val?: string | null) =>
      Boolean(val) && val !== '暂无读数' && !String(val).startsWith('—');
    const hiddenHashes = new Set(limitsPrefs?.hiddenAccountHashes || []);
    const showRemaining = Boolean(limitsPrefs?.showRemaining);

    const orderedProviders = MonitorModel.limitGroups(providers, stats, deviceId, limitAccountPresentation)
      .flatMap((group) => group.providers);
    const items = orderedProviders
      .map((provider, index) => {
        const account = MonitorModel.limitAccount(provider, stats, deviceId, limitAccountPresentation);
        if (hiddenHashes.size > 0 && hiddenHashes.has(sha256Hex(account.key))) {
          return null;
        }
        const windows = MonitorModel.limitWindows(provider);
        const quotas = windows.map((win) => ({
          win,
          q: MonitorModel.quota(provider, win, { showUsed: !showRemaining }),
        }));
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
          validQuotas,
          secondaryQuotas,
          dataTier,
          hasCollectedData,
          isFresh,
          usedScore,
          isAbnormal,
          isWarn,
          index,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (!items.length) return null;

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
  }, [selected.providers, stats, deviceId, limitAccountPresentation, limitsPrefs]);

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

  const effectiveBreakdownKind: BreakdownKind =
    deviceId && breakdownKind === 'devices' ? 'clients' : breakdownKind;

  const deviceRows = useMemo(
    () => (deviceId ? [] : MonitorModel.deviceBreakdown(stats, period, now, { separateQoderClients })),
    [stats, period, deviceId, now, separateQoderClients]
  );

  const allBreakdownCounts = useMemo(() => {
    return {
      clients: p ? MonitorModel.breakdown(p, 'clients', { separateQoderClients }).length : 0,
      devices: deviceRows.length,
      models: p ? MonitorModel.breakdown(p, 'models').length : 0,
      projects: p ? MonitorModel.breakdown(p, 'projects').length : 0,
    };
  }, [p, deviceRows, separateQoderClients]);

  if (!p) {
    if (fixedRangeStatus === 'loading') {
      return (
        <EmptyState
          title="正在同步此范围统计…"
          description="正在向 Hub 读取固定区间扫描与设备历史记录。"
        />
      );
    }
    if (fixedRangeStatus === 'partial' || fixedRangeStatus === 'unavailable') {
      return (
        <EmptyState
          title={selected.expired ? '此设备的统计周期已结束' : '当前范围暂无可用统计'}
          description="等待采集设备上传固定区间扫描，或在采集端开启历史记录同步。"
        />
      );
    }
    return (
      <EmptyState
        title={selected.expired ? '此设备的统计周期已结束' : '暂无统计数据'}
        description="等待采集设备向 Hub 上报当前周期的数据。"
      />
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
  const rows =
    effectiveBreakdownKind === 'devices'
      ? []
      : MonitorModel.breakdown(
          p,
          effectiveBreakdownKind,
          effectiveBreakdownKind === 'clients' ? { separateQoderClients } : undefined
        );
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

  // Dedupe trend dates for clean daily list keys
  const uniqueTrend = Array.from(
    trend.reduce((acc, row) => {
      if (row?.date) acc.set(row.date, row);
      return acc;
    }, new Map<string, (typeof trend)[number]>()).values(),
  );
  const trendTotalTokens = uniqueTrend.reduce((sum, row) => sum + MonitorModel.count(row.tokens), 0);
  const activeTrendDay =
    uniqueTrend.find((row) => row.date === selectedDate) || uniqueTrend[uniqueTrend.length - 1] || null;
  const activeDayShare =
    activeTrendDay && trendTotalTokens > 0
      ? ((MonitorModel.count(activeTrendDay.tokens) / trendTotalTokens) * 100).toFixed(1)
      : null;

  const searchKeyword = breakdownSearch.trim().toLocaleLowerCase();
  const filteredBreakdownRows = rows.filter((row) => {
    if (!searchKeyword) return true;
    const displayLabel = effectiveBreakdownKind === 'clients' ? clientName(row.label) : row.label;
    return (
      displayLabel.toLocaleLowerCase().includes(searchKeyword) ||
      row.id.toLocaleLowerCase().includes(searchKeyword) ||
      Boolean(row.ids?.some((id) => id.toLocaleLowerCase().includes(searchKeyword)))
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

  const activeDeviceTokensTotal = deviceRows.reduce(
    (sum, row) => sum + (row.available && row.tokens !== null ? row.tokens : 0),
    0
  );
  const activeDeviceCosts = deviceRows.filter((row) => row.available && row.cost !== null);
  const activeDeviceCostTotal =
    activeDeviceCosts.length > 0
      ? activeDeviceCosts.reduce((sum, row) => sum + (row.cost as number), 0)
      : null;
  const unavailableDevicesCount = deviceRows.filter((row) => !row.available).length;

  const filteredDeviceRows = deviceRows.filter((row) => {
    if (!searchKeyword) return true;
    return [row.label, row.deviceId, row.hostname, row.osName, row.platform].some((val) =>
      String(val || '').toLocaleLowerCase().includes(searchKeyword)
    );
  });

  const sortedDeviceRows =
    breakdownSort === 'cost'
      ? filteredDeviceRows.slice().sort((a, b) => {
          if (a.available !== b.available) return a.available ? -1 : 1;
          if (a.available && b.available) {
            const costA = a.cost ?? -1;
            const costB = b.cost ?? -1;
            if (costB !== costA) return costB - costA;
            return (
              (b.tokens ?? 0) - (a.tokens ?? 0) ||
              a.label.localeCompare(b.label) ||
              a.deviceId.localeCompare(b.deviceId)
            );
          }
          return (
            Number(a.expired) - Number(b.expired) ||
            a.label.localeCompare(b.label) ||
            a.deviceId.localeCompare(b.deviceId)
          );
        })
      : filteredDeviceRows;

  const visibleRows = showAllBreakdown
    ? sortedBreakdownRows
    : sortedBreakdownRows.slice(0, 30);
  const visibleDeviceRows = showAllBreakdown
    ? sortedDeviceRows
    : sortedDeviceRows.slice(0, 30);
  const totalRawBreakdownCount =
    effectiveBreakdownKind === 'devices' ? deviceRows.length : rows.length;
  const sortedBreakdownCount =
    effectiveBreakdownKind === 'devices' ? sortedDeviceRows.length : sortedBreakdownRows.length;
  const visibleBreakdownCount =
    effectiveBreakdownKind === 'devices' ? visibleDeviceRows.length : visibleRows.length;

  const heroSegments = [
    {
      key: 'input',
      label: '输入',
      count: inputTokensCount,
      colorVar: 'var(--tm-chart-input)',
      textClass: 'text-[var(--tm-info-text)]',
    },
    {
      key: 'output',
      label: '输出',
      count: outputTokensCount,
      colorVar: 'var(--tm-chart-output)',
      textClass: 'text-[var(--tm-violet-text)]',
    },
    {
      key: 'cacheRead',
      label: '缓存读取',
      count: cacheReadTokensCount,
      colorVar: 'var(--tm-chart-cache-read)',
      textClass: 'text-[var(--tm-success-text)]',
    },
    {
      key: 'cacheWrite',
      label: '缓存写入',
      count: cacheWriteTokensCount,
      colorVar: 'var(--tm-chart-cache-write)',
      textClass: 'text-[var(--tm-warning-text)]',
    },
  ].filter((seg) => seg.count > 0);

  return (
    <div className="space-y-3.5">
      {/* 1. Hero 核心遥测看板 */}
      <section className="glass-hero rounded-3xl p-4 sm:p-5 relative overflow-hidden">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-xs font-semibold text-[var(--tm-accent-text)] tracking-wide">
              {PERIOD_LABELS[period]} Token 用量
            </span>
            {fixedRangeRange && (
              <span
                data-fixed-range-badge
                className="px-2 py-0.5 rounded-full bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] text-[11px] font-mono-tabular text-[var(--tm-text-secondary)]"
              >
                {fixedRangeRange.start === fixedRangeRange.end
                  ? fixedRangeRange.start
                  : `${fixedRangeRange.start} ~ ${fixedRangeRange.end}`}
              </span>
            )}
          </div>

          <div className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
            {deviceId ? (
              <div className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-0.5 rounded-full bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] text-[11px] text-[var(--tm-accent-text)] min-w-0 max-w-full">
                <i
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    selected.device?.stale ? 'bg-[var(--tm-warning)]' : 'bg-[var(--tm-success)]'
                  }`}
                />
                <span className="max-w-[130px] truncate font-medium">
                  {selected.device?.hostname || selected.device?.deviceId}
                </span>
                {onSelectDevice && (
                  <button
                    type="button"
                    data-clear-device="true"
                    onClick={() => onSelectDevice('')}
                    aria-label="返回全部设备统计"
                    className="min-h-[44px] px-3 rounded-full bg-[var(--tm-bg-control-hover)] hover:bg-[var(--tm-accent-soft-bg)] active:scale-95 text-[11px] font-semibold text-[var(--tm-text-primary)] transition-all shrink-0"
                  >
                    全部
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate?.('devices')}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1 rounded-full bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-border-default)] text-[11px] font-medium tabular-nums text-[var(--tm-accent-text)] active:scale-[0.97] transition-all"
              >
                <i
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    activeDevicesCount > 0 ? 'bg-[var(--tm-success)]' : 'bg-[var(--tm-text-muted)]'
                  }`}
                />
                <span>
                  {activeDevicesCount} / {devices.length} 台近期上报
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="my-3.5 flex items-baseline gap-2 flex-wrap">
          <div className="token-total text-[42px] sm:text-[48px] font-extrabold tracking-[-0.03em] text-[var(--tm-text-primary)] font-mono-tabular leading-none break-all">
            {MonitorModel.compact(p.totalTokens)}
          </div>
          <span className="text-xs font-medium text-[var(--tm-text-secondary)] font-mono-tabular">
            tokens
          </span>
        </div>

        {components && heroPartsSum > 0 && (
          <div className="mb-3.5 space-y-2.5">
            <div
              className="h-2 w-full rounded-full bg-[var(--tm-track-bg)] overflow-hidden flex gap-[1px] p-[1px]"
              aria-hidden="true"
            >
              {heroSegments.map((seg) => (
                <div
                  key={seg.key}
                  style={{
                    width: `${(seg.count / heroPartsSum) * 100}%`,
                    backgroundColor: seg.colorVar,
                  }}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {heroSegments.map((seg) => {
                const pct = ((seg.count / heroPartsSum) * 100).toFixed(1);
                return (
                  <div
                    key={seg.key}
                    className="px-3 py-2 rounded-xl glass-inset space-y-0.5 min-w-0"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--tm-text-secondary)]">
                      <i
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: seg.colorVar }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{seg.label}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-1.5 font-mono-tabular">
                      <span className="text-xs font-semibold text-[var(--tm-text-primary)]">
                        {MonitorModel.compact(seg.count)}
                      </span>
                      <span className={`text-[11px] font-medium ${seg.textClass}`}>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="pt-3 mt-1 border-t border-[var(--tm-border-subtle)] flex items-center justify-between gap-2 flex-wrap text-xs text-[var(--tm-text-secondary)] tabular-nums">
          <span>
            精确累计:{' '}
            <span className="font-mono-tabular text-[var(--tm-text-primary)] font-medium">
              {formatExact(totalTokensCount)}
            </span>
          </span>
          <div className="flex items-center gap-2.5">
            {unclassified > 0 && (
              <span className="text-[11px] text-[var(--tm-text-muted)]">
                未分类 <span className="font-mono-tabular">{MonitorModel.compact(unclassified)}</span>
              </span>
            )}
            {components && heroPartsSum === 0 && (
              <span className="text-[var(--tm-violet-text)] text-[11px]">
                输出 <span className="font-mono-tabular">{MonitorModel.compact(components.output)}</span>
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 2. 双列核心效率卡（费用 & 输入缓存命中率） */}
      <div className="grid grid-cols-2 gap-3">
        <section className="glass-panel rounded-2xl p-4 flex flex-col justify-between min-w-0">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--tm-text-muted)]">
              {PERIOD_LABELS[period]}费用 · USD
            </p>
            <div className="text-xl sm:text-2xl font-bold text-[var(--tm-text-primary)] font-mono-tabular mt-2 mb-1 tracking-tight truncate">
              {MonitorModel.money(p.costUsd)}
            </div>
            {avgCostPerMillion !== null && (
              <p className="text-[11px] tabular-nums text-[var(--tm-accent-text)] mb-1 truncate">
                均价 <span className="font-mono-tabular">{MonitorModel.money(avgCostPerMillion)}</span> / 1M
              </p>
            )}
          </div>
          <p className="text-[11px] text-[var(--tm-text-muted)] leading-snug mt-1.5">
            {unpriced
              ? `${MonitorModel.compact(unpriced)} tokens 暂无定价；费用为已知小计`
              : '按采集端定价统计'}
          </p>
        </section>

        <section
          data-cache-hit
          className="glass-panel rounded-2xl p-4 flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--tm-text-muted)]">输入缓存命中率</p>
            <div className="text-xl sm:text-2xl font-bold text-[var(--tm-success-text)] font-mono-tabular mt-2 mb-1.5 tracking-tight">
              {cache ? (
                <>
                  {cache.percent.toFixed(1)}
                  <span className="text-sm font-semibold ml-0.5 opacity-80">%</span>
                </>
              ) : (
                '—'
              )}
            </div>
            {cache && <ProgressMeter percent={cache.percent} tone="emerald" className="mb-1.5" />}
          </div>
          <p className="text-[11px] text-[var(--tm-text-muted)] leading-snug mt-1 tabular-nums">
            {cache
              ? `命中 ${MonitorModel.compact(cache.hit)} · 未命中 ${MonitorModel.compact(cache.miss)}`
              : '暂无可用的输入缓存读数'}
          </p>
        </section>
      </div>

      {cache && cacheRows.length > 0 && (
        <DetailsDisclosure
          data-cache-sessions=""
          className="glass-panel rounded-2xl px-4"
          summary={
            <span className="text-[var(--tm-accent-text)] font-semibold tabular-nums">
              会话缓存明细 · {cacheRows.length}
            </span>
          }
          summaryMeta={<span>展开查看</span>}
        >
          <p className="text-[11px] text-[var(--tm-text-muted)] mb-3 leading-relaxed">
            按已观测输入量排序，包含已结束会话；输出与未知用量不计入命中率。
          </p>
          <ul className="max-h-80 overflow-y-auto space-y-3 pb-4" aria-label="会话缓存命中明细">
            {cacheRows.map((row) => (
              <li key={row.key} className="border-t border-[var(--tm-border-subtle)] pt-3 text-xs">
                <div className="flex justify-between items-start gap-2.5">
                  <span className="min-w-0 flex-1 break-words text-[var(--tm-text-primary)] font-medium leading-snug">
                    {row.title}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[var(--tm-success-text)] font-mono-tabular font-semibold">
                      {row.percent.toFixed(1)}%
                    </span>
                    {onOpenSessionDetail && period !== 'allTime' && (
                      <button
                        type="button"
                        onClick={() => onOpenSessionDetail(row.key)}
                        aria-label={`查看会话 ${row.title} 详情`}
                        className="min-h-[44px] px-3 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-border-default)] text-[11px] font-semibold text-[var(--tm-accent-text)] active:scale-[0.97] transition-all"
                      >
                        详情
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-[var(--tm-text-muted)] mt-1 tabular-nums">
                  {clientName(row.client)} · 命中{' '}
                  <span className="font-mono-tabular">{MonitorModel.compact(row.hit)}</span> · 未命中{' '}
                  <span className="font-mono-tabular">{MonitorModel.compact(row.miss)}</span>
                </p>
              </li>
            ))}
          </ul>
        </DetailsDisclosure>
      )}

      {/* 3. 全局关键状态速览 */}
      {(sessionPulse || limitsPulse || devicesPulse) && (
        <div className="space-y-3.5">
          {/* 3A. 实时会话速览 */}
          {sessionPulse && (
            <section
              data-overview-sessions="true"
              className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3"
            >
              <SectionHeader
                icon={<MessageSquare className="w-4 h-4" />}
                title="实时会话速览"
                badge={
                  <div className="flex items-center gap-1.5 flex-wrap tabular-nums text-[11px]">
                    {sessionPulse.runningCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--tm-success-soft-bg)] border border-[var(--tm-success-soft-border)] text-[var(--tm-success-text)] font-medium">
                        <i className="w-1.5 h-1.5 rounded-full bg-[var(--tm-success)]" aria-hidden="true" />
                        <span>{sessionPulse.runningCount} 运行中</span>
                      </span>
                    )}
                    {sessionPulse.waitingCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--tm-warning-soft-bg)] border border-[var(--tm-warning-soft-border)] text-[var(--tm-warning-text)] font-medium">
                        <span>{sessionPulse.waitingCount} 等待</span>
                      </span>
                    )}
                    {sessionPulse.runningCount === 0 && sessionPulse.waitingCount === 0 && (
                      <span className="text-[var(--tm-text-muted)]">共 {sessionPulse.totalCount} 个会话</span>
                    )}
                  </div>
                }
                action={
                  <div className="flex items-center gap-1.5">
                    <div
                      role="group"
                      aria-label="会话速览展示密度"
                      className="inline-flex items-center rounded-xl bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] p-0.5 text-[11px]"
                    >
                      {(['detailed', 'compact'] as const).map((mId) => {
                        const active = overviewSessionsMode === mId;
                        return (
                          <button
                            key={mId}
                            type="button"
                            data-overview-sessions-mode={mId}
                            aria-pressed={active}
                            onClick={() => setOverviewSessionsMode(mId)}
                            className={`min-h-[34px] px-2 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                              active
                                ? 'bg-[var(--tm-selection-bg)] text-[var(--tm-selection-text)]'
                                : 'text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)]'
                            }`}
                          >
                            {mId === 'detailed' ? '详细' : '紧凑'}
                          </button>
                        );
                      })}
                    </div>
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate('sessions')}
                        className="inline-flex items-center gap-0.5 min-h-[44px] px-3 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-border-default)] text-[11px] font-semibold text-[var(--tm-accent-text)] active:scale-[0.97] transition-all tabular-nums whitespace-nowrap"
                      >
                        <span>全部 ({sessionPulse.totalCount})</span>
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                }
              />

              <div className="space-y-2">
                {sessionPulse.topItems.map(({ row, status }) => {
                  const tone = clientTone(row.client);
                  const targetKey = row.detailKey || row.key;
                  const usageDisplay = MonitorModel.sessionUsageDisplay(row);
                  const presentation = MonitorModel.sessionListPresentation(row);
                  const sources = !deviceId
                    ? MonitorModel.sessionDevices(row, stats, period, deviceId)
                    : [];
                  const ageTs = row.lastUsedAt || row.startedAt;
                  const ageShort = MonitorModel.sessionAgeShort(ageTs, now);
                  const ageText = MonitorModel.sessionAgeText(ageTs, now);
                  const isLiveActive = status.state === 'running' || status.state === 'waiting';
                  const showAge =
                    Boolean(ageShort) &&
                    !(overviewSessionsMode === 'compact' && isLiveActive && ageShort === '<1m');
                  const inferred = status.source === 'inferred';
                  const stateTone =
                    status.state === 'running'
                      ? 'text-[var(--tm-success-text)]'
                      : status.state === 'waiting'
                      ? 'text-[var(--tm-warning-text)]'
                      : status.state === 'ended'
                      ? 'text-[var(--tm-info-text)]'
                      : 'text-[var(--tm-text-muted)]';
                  const stateDot =
                    status.state === 'running'
                      ? inferred
                        ? 'border border-[var(--tm-success)] bg-[var(--tm-success-soft-bg)]'
                        : 'bg-[var(--tm-success)]'
                      : status.state === 'waiting'
                      ? 'bg-[var(--tm-warning)]'
                      : status.state === 'ended'
                      ? 'bg-[var(--tm-info)]'
                      : 'bg-[var(--tm-text-muted)]';
                  if (overviewSessionsMode === 'compact') {
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
                        className="w-full min-h-[44px] text-left px-3 py-2 rounded-2xl bg-[var(--tm-bg-row)] hover:bg-[var(--tm-bg-row-hover)] border border-[var(--tm-border-subtle)] active:scale-[0.99] transition-all flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <i className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />
                          <span className="text-xs font-medium text-[var(--tm-text-primary)] truncate min-w-0">
                            {presentation.heading}
                          </span>
                          {sources.length > 0 && (
                            <span className="text-[11px] text-[var(--tm-text-muted)] shrink-0 max-w-[96px] truncate">
                              · {sources[0].hostname}
                              {sources.length > 1 ? ` +${sources.length - 1}` : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 font-mono-tabular text-[11px]">
                          {showAge && (
                            <span
                              role="img"
                              aria-label={ageText}
                              className="text-[var(--tm-text-muted)]"
                            >
                              {ageShort}
                            </span>
                          )}
                          <span className="text-xs font-semibold text-[var(--tm-text-primary)]">
                            {usageDisplay.tokensText}
                          </span>
                          <i className={`w-1.5 h-1.5 rounded-full shrink-0 ${stateDot}`} aria-hidden="true" />
                        </div>
                      </button>
                    );
                  }
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
                      className="w-full min-h-[52px] text-left px-3 py-2.5 rounded-2xl bg-[var(--tm-bg-row)] hover:bg-[var(--tm-bg-row-hover)] border border-[var(--tm-border-subtle)] active:scale-[0.99] transition-all flex items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <i className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />
                          <span className="text-xs font-medium text-[var(--tm-text-primary)] truncate">
                            {presentation.heading}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[var(--tm-text-muted)] truncate">
                          <span className="shrink-0">{clientName(row.client)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular truncate">
                            {MonitorModel.sessionModelLabel(row)}
                          </span>
                          {sources.length > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 shrink-0 max-w-[110px] truncate">
                                <DeviceIcon kind={sources[0].deviceKind} className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                  {sources[0].hostname}
                                  {sources.length > 1 ? ` +${sources.length - 1}` : ''}
                                </span>
                              </span>
                            </>
                          )}
                          {showAge && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span
                                role="img"
                                aria-label={ageText}
                                className="font-mono-tabular shrink-0"
                              >
                                {ageShort}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-semibold font-mono-tabular text-[var(--tm-text-primary)]">
                          {usageDisplay.tokensText}
                        </div>
                        <div className={`inline-flex items-center gap-1 text-[11px] mt-0.5 ${stateTone}`}>
                          <i className={`w-1.5 h-1.5 rounded-full shrink-0 ${stateDot}`} aria-hidden="true" />
                          <span>{status.label}</span>
                          {inferred && <span className="opacity-85">(推断)</span>}
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
              className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3"
            >
              <SectionHeader
                icon={<Gauge className="w-4 h-4" />}
                title="核心额度速览"
                badge={
                  limitsPulse.collectedCount > 0 ? (
                    limitsPulse.warnCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--tm-warning-soft-bg)] border border-[var(--tm-warning-soft-border)] text-[11px] tabular-nums text-[var(--tm-warning-text)] font-medium">
                        已采集 {limitsPulse.collectedCount} · {limitsPulse.warnCount} 项预警
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--tm-success-soft-bg)] border border-[var(--tm-success-soft-border)] text-[11px] tabular-nums text-[var(--tm-success-text)] font-medium">
                        已采集 {limitsPulse.collectedCount} 个账户
                      </span>
                    )
                  ) : (
                    <span className="text-[11px] tabular-nums text-[var(--tm-text-muted)]">
                      共 {limitsPulse.totalCount} 个账户
                    </span>
                  )
                }
                action={
                  onNavigate ? (
                    <button
                      type="button"
                      onClick={() => onNavigate('limits')}
                      className="inline-flex items-center gap-0.5 min-h-[44px] px-3 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-border-default)] text-[11px] font-semibold text-[var(--tm-accent-text)] active:scale-[0.97] transition-all whitespace-nowrap"
                    >
                      <span>全部额度</span>
                      <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  ) : undefined
                }
              />

              {limitsPulse.collectedCount === 0 ? (
                <button
                  type="button"
                  onClick={() => onNavigate?.('limits')}
                  className="w-full min-h-[48px] text-left px-3.5 py-3 rounded-2xl bg-[var(--tm-bg-row)] hover:bg-[var(--tm-bg-row-hover)] border border-[var(--tm-border-subtle)] text-xs text-[var(--tm-text-secondary)] flex items-center justify-between gap-2 active:scale-[0.99] transition-all"
                >
                  <span className="leading-relaxed">
                    当前尚无已采集到有效读数的额度账户，点击查看账户配置状态
                  </span>
                  <ChevronRight className="w-4 h-4 text-[var(--tm-text-muted)] shrink-0" aria-hidden="true" />
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
                        validQuotas,
                        isWarn,
                        isFresh,
                      }) => {
                        const tone = clientTone(provider.provider);
                        const displayTitle = account.productLabel || providerName(provider.provider);
                        const subLabel =
                          account.displayName ||
                          (provider.provider === 'devin'
                            ? provider.accountEmail || provider.accountName
                            : provider.accountName || provider.accountEmail) ||
                          provider.planLabel ||
                          account.regionLabel ||
                          '';
                        const q = primary?.q || null;
                        const formatQuotaVal = (
                          quota: { value: string; remaining?: boolean },
                        ) =>
                          quota.remaining && !String(quota.value).includes('剩余')
                            ? `剩余 ${quota.value}`
                            : quota.value;
                        return (
                          <button
                            key={key}
                            type="button"
                            data-overview-limit={account.key}
                            onClick={() => onNavigate?.('limits')}
                            className="w-full text-left px-3.5 py-3 rounded-2xl bg-[var(--tm-bg-row)] hover:bg-[var(--tm-bg-row-hover)] border border-[var(--tm-border-subtle)] active:scale-[0.99] transition-all space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <i
                                  className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`}
                                  aria-hidden="true"
                                />
                                <span className="text-xs font-semibold text-[var(--tm-text-primary)] truncate">
                                  {displayTitle}
                                </span>
                                {subLabel && (
                                  <span className="text-[11px] text-[var(--tm-text-muted)] truncate">
                                    · {subLabel}
                                  </span>
                                )}
                              </div>
                              {!isFresh && (
                                <span className="px-2 py-0.5 rounded-full bg-[var(--tm-warning-soft-bg)] border border-[var(--tm-warning-soft-border)] text-[11px] text-[var(--tm-warning-text)] shrink-0 whitespace-nowrap">
                                  历史读数
                                </span>
                              )}
                            </div>

                            {validQuotas.length > 0 ? (
                              <div className="space-y-2">
                                {validQuotas.map(({ win, q: wq }, wIdx) => {
                                  const winWarn =
                                    wq.percent !== null &&
                                    (wq.remaining ? wq.percent < 15 : wq.percent > 85);
                                  const resetHint = win?.resetsAt
                                    ? formatRelativeCountdown(
                                        win.resetsAt,
                                        now,
                                        win.boundaryKind === 'expiry' ? '已到期' : '即将重置',
                                      )
                                    : win?.resetDescription || '';
                                  return (
                                    <div
                                      key={`${wq.label}-${wIdx}`}
                                      data-overview-limit-window={wIdx}
                                      className="space-y-1"
                                    >
                                      <div className="flex items-baseline justify-between gap-2 text-xs">
                                        <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
                                          <span className="text-[11px] text-[var(--tm-text-secondary)] truncate">
                                            {wq.label}
                                          </span>
                                          {resetHint && (
                                            <span className="text-[10.5px] font-mono-tabular text-[var(--tm-text-muted)] truncate">
                                              · {resetHint}
                                            </span>
                                          )}
                                        </div>
                                        <span
                                          className={`text-xs font-mono-tabular font-semibold shrink-0 ${
                                            winWarn
                                              ? 'text-[var(--tm-danger-text)]'
                                              : 'text-[var(--tm-accent-text)]'
                                          }`}
                                        >
                                          {formatQuotaVal(wq)}
                                        </span>
                                      </div>
                                      {wq.percent !== null && (
                                        <ProgressMeter
                                          percent={wq.percent}
                                          tone={winWarn ? 'danger' : 'sky'}
                                        />
                                      )}
                                      {wq.detail && (
                                        <div className="text-[11px] text-[var(--tm-text-muted)] tabular-nums truncate">
                                          {wq.detail}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <>
                                <div className="flex items-baseline justify-between gap-2 text-xs">
                                  <span className="text-[11px] text-[var(--tm-text-secondary)] truncate min-w-0">
                                    {q ? q.label : '额度详情'}
                                  </span>
                                  <span
                                    className={`text-xs font-mono-tabular font-semibold shrink-0 ${
                                      isWarn
                                        ? 'text-[var(--tm-danger-text)]'
                                        : 'text-[var(--tm-accent-text)]'
                                    }`}
                                  >
                                    {q ? formatQuotaVal(q) : '查看详情'}
                                  </span>
                                </div>
                                {q && q.percent !== null && (
                                  <ProgressMeter
                                    percent={q.percent}
                                    tone={isWarn ? 'danger' : 'sky'}
                                  />
                                )}
                              </>
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
                      className="w-full min-h-[44px] py-2 rounded-2xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-border-default)] text-xs font-semibold text-[var(--tm-accent-text)] active:scale-[0.985] transition-all"
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
              className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3"
            >
              <SectionHeader
                icon={<Server className="w-4 h-4" />}
                title="设备用量贡献"
                subtitle="轻触卡片筛选单台设备"
                action={
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-overview-devices-jump="true"
                      onClick={() => {
                        onBreakdownChange('devices');
                        breakdownSectionRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      }}
                      className="inline-flex items-center gap-0.5 min-h-[44px] px-2.5 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-border-default)] text-[11px] font-semibold text-[var(--tm-accent-text)] active:scale-[0.97] transition-all whitespace-nowrap"
                    >
                      <span>完整分布</span>
                      <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate('devices')}
                        className="inline-flex items-center gap-0.5 min-h-[44px] px-2.5 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-border-default)] text-[11px] font-semibold text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] active:scale-[0.97] transition-all whitespace-nowrap"
                      >
                        <span>设备页</span>
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                }
              />

              <div className="grid grid-cols-2 gap-2.5">
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
                      className="text-left p-3 rounded-2xl bg-[var(--tm-bg-row)] hover:bg-[var(--tm-bg-row-hover)] border border-[var(--tm-border-subtle)] active:scale-[0.985] transition-all space-y-2 min-w-0"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <DeviceIcon
                            kind={dev.deviceKind}
                            className="w-3.5 h-3.5 text-[var(--tm-accent)] shrink-0"
                          />
                          <span className="text-xs font-medium text-[var(--tm-text-primary)] truncate">
                            {dev.hostname || dev.deviceId}
                          </span>
                        </div>
                        <i
                          aria-hidden="true"
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            dev.stale ? 'bg-[var(--tm-warning)]' : 'bg-[var(--tm-success)]'
                          }`}
                        />
                      </div>

                      <div className="flex items-baseline justify-between gap-1 tabular-nums">
                        <span className="text-xs font-bold font-mono-tabular text-[var(--tm-text-primary)] truncate">
                          {tokens === null ? '—' : MonitorModel.compact(tokens)}
                        </span>
                        <span className="text-[11px] text-[var(--tm-text-muted)] shrink-0">
                          {tokens === null
                            ? expired
                              ? '周期已结束'
                              : '暂无读数'
                            : cost !== null
                            ? MonitorModel.money(cost)
                            : `${pct.toFixed(0)}%`}
                        </span>
                      </div>

                      <ProgressMeter
                        percent={tokens !== null && tokens > 0 ? pct : 0}
                        tone="sky"
                        heightClass="h-1"
                      />
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* 4. 统一「历史与每日趋势」面板（去重合并折线 / 柱状，节省约 140px 纵向高度） */}
      {!deviceId && (
        <section className="trend-card glass-panel rounded-3xl p-4 sm:p-5 space-y-3">
          <SectionHeader
            icon={<TrendingUp className="w-4 h-4" />}
            title="每日趋势"
            subtitle="全部设备 · 最近 14 个有记录日"
            badge={
              activity ? (
                <span
                  data-active-days
                  className="px-2 py-0.5 rounded-full bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] text-[11px] tabular-nums text-[var(--tm-text-secondary)]"
                >
                  {activity.complete ? '累计活跃' : '所示日期内活跃'} {activity.count} 天
                </span>
              ) : undefined
            }
          />

          {uniqueTrend.length > 0 ? (
            <div className="space-y-3">
              {/* Crisp 2-row selected-day telemetry strip + range total */}
              <div className="glass-inset rounded-2xl px-3.5 py-2.5 space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                  <div className="trend-selection min-w-0 flex-1" aria-live="polite">
                    {activeTrendDay ? (
                      <span className="inline-flex items-baseline gap-1.5 flex-wrap">
                        <strong className="font-mono-tabular text-[var(--tm-text-primary)]">
                          {activeTrendDay.date}
                        </strong>
                        <span className="text-[var(--tm-text-muted)]">·</span>
                        <span className="font-mono-tabular text-[var(--tm-accent-text)] font-semibold">
                          {formatTrendTokens(activeTrendDay.tokens)}
                        </span>
                        {MonitorModel.numeric(activeTrendDay.cost) !== null && (
                          <>
                            <span className="text-[var(--tm-text-muted)]">·</span>
                            <span className="font-mono-tabular text-[var(--tm-success-text)] font-medium">
                              {MonitorModel.money(activeTrendDay.cost)}
                            </span>
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="text-[var(--tm-text-secondary)]">Token 用量</span>
                    )}
                  </div>
                  {activeDayShare && (
                    <span className="text-[11px] font-mono-tabular text-[var(--tm-text-muted)] shrink-0">
                      占比 {activeDayShare}%
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--tm-text-muted)] tabular-nums">
                  <span>{chartMode === 'cumulative' ? '当前图表按区间累计绘制' : '当前图表按单日用量绘制'}</span>
                  <span className="shrink-0">
                    区间合计{' '}
                    <span className="font-mono-tabular text-[var(--tm-text-secondary)] font-medium">
                      {formatTrendTokens(trendTotalTokens)}
                    </span>
                  </span>
                </div>
              </div>

              <HistoryChart
                trend={uniqueTrend}
                selectedDate={activeTrendDay?.date}
                onSelectDate={setSelectedDate}
                embedded={true}
                exactTrendTokens={exactTrendTokens}
                mode={chartMode}
                onModeChange={setChartMode}
                chartStyle={chartStyle}
                onChartStyleChange={setChartStyle}
              />

              <div className="daily-details pt-2 border-t border-[var(--tm-border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowDailyList((prev) => !prev)}
                  data-daily-toggle="true"
                  aria-expanded={showDailyList}
                  className="w-full min-h-[44px] flex items-center justify-between text-xs font-medium text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] transition-colors"
                >
                  <span className="tabular-nums">查看每日数值明细 ({uniqueTrend.length} 天)</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`w-4 h-4 transition-transform duration-150 ${
                      showDailyList
                        ? 'rotate-180 text-[var(--tm-accent)]'
                        : 'text-[var(--tm-text-muted)]'
                    }`}
                  />
                </button>
                {showDailyList && (
                  <div
                    data-daily-values="true"
                    className="mt-2 space-y-1.5 pt-1 max-h-60 overflow-y-auto pr-1"
                  >
                    {uniqueTrend
                      .slice()
                      .reverse()
                      .map((row) => {
                        const isSelected = activeTrendDay?.date === row.date;
                        return (
                          <button
                            key={row.date}
                            type="button"
                            onClick={() => setSelectedDate(row.date)}
                            className={`w-full min-h-[44px] flex items-center justify-between gap-2 text-xs py-2 px-3 rounded-xl border font-mono-tabular active:scale-[0.99] transition-all ${
                              isSelected
                                ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-text-primary)]'
                                : 'bg-[var(--tm-bg-row)] border-[var(--tm-border-subtle)] text-[var(--tm-text-secondary)] hover:bg-[var(--tm-bg-row-hover)]'
                            }`}
                          >
                            <span className="shrink-0">{row.date}</span>
                            <div className="flex items-center gap-2.5 min-w-0 justify-end">
                              <span className="text-[var(--tm-text-primary)] font-semibold truncate">
                                {formatTrendTokens(row.tokens)}
                              </span>
                              <span className="text-[var(--tm-text-muted)] min-w-[54px] text-right shrink-0">
                                {MonitorModel.money(row.cost)}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              compact
              className="bg-transparent border-[var(--tm-border-subtle)] shadow-none"
              title="暂无历史趋势"
              description="请在采集设备开启历史记录并等待上传。"
            />
          )}
        </section>
      )}

      {/* 5. 多维用量分布面板 */}
      <section
        id="overview-breakdown"
        ref={breakdownSectionRef}
        className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5"
      >
        <SectionHeader
          icon={<Layers className="w-4 h-4" />}
          title="用量分布"
          action={
            <SegmentedControl<BreakdownSortBy>
              size="sm"
              tone="accent"
              fullWidth={false}
              ariaLabel="用量分布排序方式"
              value={breakdownSort}
              onChange={setBreakdownSort}
              options={[
                { value: 'tokens', label: '按 Token', dataAttrs: { 'data-breakdown-sort': 'tokens' } },
                { value: 'cost', label: '按费用', dataAttrs: { 'data-breakdown-sort': 'cost' } },
              ]}
            />
          }
        />

        <SegmentedControl<BreakdownKind>
          ariaLabel="用量分布维度"
          value={effectiveBreakdownKind}
          onChange={onBreakdownChange}
          options={(
            (deviceId
              ? [
                  ['clients', '工具', allBreakdownCounts.clients],
                  ['models', '模型', allBreakdownCounts.models],
                  ['projects', '项目', allBreakdownCounts.projects],
                ]
              : [
                  ['clients', '工具', allBreakdownCounts.clients],
                  ['devices', '设备', allBreakdownCounts.devices],
                  ['models', '模型', allBreakdownCounts.models],
                  ['projects', '项目', allBreakdownCounts.projects],
                ]) as Array<[BreakdownKind, string, number]>
          ).map(([kind, label, count]) => ({
            value: kind,
            label,
            badge: count > 0 ? count : undefined,
            dataAttrs: { 'data-breakdown': kind },
          }))}
        />

        {(totalRawBreakdownCount > 5 || breakdownSearch !== '') && (
          <SearchField
            value={breakdownSearch}
            onChange={(val) => {
              setBreakdownSearch(val);
              setShowAllBreakdown(false);
            }}
            placeholder={`${BREAKDOWN_SEARCH_LABELS[effectiveBreakdownKind]}…`}
            ariaLabel={BREAKDOWN_SEARCH_LABELS[effectiveBreakdownKind]}
            clearAriaLabel="清除分布筛选"
            inputProps={{ 'data-breakdown-search': 'true' }}
          />
        )}

        {effectiveBreakdownKind === 'devices' ? (
          visibleDeviceRows.length > 0 ? (
            <div className="space-y-2.5">
              {visibleDeviceRows.map((row, idx) => (
                <DeviceBreakdownRowCard
                  key={row.deviceId}
                  row={row}
                  rank={idx + 1}
                  breakdownSort={breakdownSort}
                  activeTokensTotal={activeDeviceTokensTotal}
                  activeCostTotal={activeDeviceCostTotal}
                  isExpanded={row.available && expandedBreakdownDevices.has(row.deviceId)}
                  onToggle={() => {
                    if (!row.available) return;
                    setExpandedBreakdownDevices((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.deviceId)) next.delete(row.deviceId);
                      else next.add(row.deviceId);
                      return next;
                    });
                  }}
                  onSelectDevice={onSelectDevice}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-[var(--tm-text-muted)] py-6">
              {searchKeyword ? '无匹配的设备' : '当前周期暂无设备明细'}
            </p>
          )
        ) : visibleRows.length > 0 ? (
          <div className="space-y-2.5">
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
                effectiveBreakdownKind === 'clients' ? clientName(row.label) : row.label;
              const tone =
                effectiveBreakdownKind === 'clients' ? clientTone(row.id) : clientTone(undefined);
              const drillIds = row.ids && row.ids.length > 0 ? row.ids : [row.id];
              const matchingSessionTools = sessionPulse
                ? drillIds.filter((id) => sessionPulse.toolHasSessions.has(id))
                : [];
              const canDrillSessions =
                effectiveBreakdownKind === 'clients' &&
                period !== 'allTime' &&
                Boolean(onSelectToolSessions) &&
                matchingSessionTools.length > 0;

              return (
                <div
                  key={row.id}
                  className="rounded-2xl bg-[var(--tm-bg-row)] border border-[var(--tm-border-subtle)] px-3 py-2.5 space-y-2"
                >
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[11px] font-mono-tabular text-[var(--tm-text-muted)] w-5 shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      {effectiveBreakdownKind === 'clients' && (
                        <i
                          className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`}
                          aria-hidden="true"
                        />
                      )}
                      <span className="font-semibold text-[var(--tm-text-primary)] truncate min-w-0">
                        {displayLabel}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 font-mono-tabular font-semibold ${
                        breakdownSort === 'cost'
                          ? 'text-[var(--tm-success-text)]'
                          : 'text-[var(--tm-text-primary)]'
                      }`}
                    >
                      {breakdownSort === 'cost'
                        ? MonitorModel.money(row.cost)
                        : MonitorModel.compact(row.tokens)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--tm-text-muted)]">
                    <div className="flex items-baseline gap-2 min-w-0 flex-wrap tabular-nums">
                      <span>占比 {formatSharePct(pct)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular text-[var(--tm-text-secondary)]">
                        {breakdownSort === 'cost'
                          ? MonitorModel.compact(row.tokens)
                          : MonitorModel.money(row.cost)}
                      </span>
                    </div>
                    {canDrillSessions && (
                      <button
                        type="button"
                        data-breakdown-tool-sessions={row.id}
                        onClick={() =>
                          onSelectToolSessions?.(
                            matchingSessionTools.length === 1 ? matchingSessionTools[0] : row.id
                          )
                        }
                        aria-label={`查看 ${displayLabel} 的会话`}
                        className="inline-flex items-center justify-center gap-1 min-h-[44px] px-3 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-border-default)] text-[11px] font-semibold text-[var(--tm-accent-text)] active:scale-[0.97] transition-all shrink-0"
                      >
                        <span>会话</span>
                        <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <ProgressMeter
                    percent={pct}
                    tone="custom"
                    barClassName={`bg-gradient-to-r ${tone.bar}`}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-xs text-[var(--tm-text-muted)] py-6">
            {searchKeyword
              ? '无匹配的分布项'
              : effectiveBreakdownKind === 'projects' && detailsAvailable === false
                ? '当前范围包含历史记录汇总，暂不含项目分布明细'
                : '此周期暂无明细'}
          </p>
        )}

        {sortedBreakdownCount > 30 && (
          <InlineAlert
            tone="amber"
            action={
              <button
                type="button"
                data-breakdown-expand="true"
                onClick={() => setShowAllBreakdown((prev) => !prev)}
                className="min-h-[44px] px-3 rounded-xl bg-[var(--tm-warning-soft-bg)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-warning-soft-border)] text-xs font-semibold text-[var(--tm-warning-text)] whitespace-nowrap active:scale-[0.97] transition-all"
              >
                {showAllBreakdown ? '收起至前 30 项' : `展开全部 (${sortedBreakdownCount} 项)`}
              </button>
            }
          >
            <span>
              {showAllBreakdown
                ? `已展示全部 ${sortedBreakdownCount} 项明细；总量保持完整。`
                : `仅列出${breakdownSort === 'cost' ? '费用' : '用量'}最高的 ${visibleBreakdownCount} 项，共 ${sortedBreakdownCount} 项；总量保持完整。`}
            </span>
          </InlineAlert>
        )}

        {effectiveBreakdownKind === 'devices' && unavailableDevicesCount > 0 && (
          <InlineAlert tone="sky">
            <span>{unavailableDevicesCount} 台设备当前周期已结束或暂无读数，未计入有效占比。</span>
          </InlineAlert>
        )}

        {effectiveBreakdownKind === 'projects' &&
          (stats.projectsIncomplete || stats.periodProjectsOmitted?.[period]) && (
            <InlineAlert tone="amber">
              <span>部分设备未提供完整项目明细，项目合计可能小于总用量。</span>
            </InlineAlert>
          )}
      </section>

      {onOpenReports && (
        <section
          id="overview-reports-card"
          className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3 border-[var(--tm-border-accent)]"
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0 space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--tm-violet-soft-bg)] border border-[var(--tm-violet-soft-border)] text-[11px] font-semibold text-[var(--tm-violet-text)]">
                <Sparkles className="w-3 h-3 text-[var(--tm-violet)] shrink-0" aria-hidden="true" />
                <span>报告专区 · AI 智能分析</span>
              </div>
              <h3 className="text-sm font-bold text-[var(--tm-text-primary)] tracking-tight">
                周期与项目分析报告
              </h3>
              <p className="text-[11px] text-[var(--tm-text-secondary)] leading-relaxed">
                查看主 Hub 生成的日报 / 周报 / 月报排版文档、项目归因与 AI 深度总结
              </p>
            </div>
            <button
              type="button"
              id="open-reports-button"
              onClick={() => onOpenReports('daily')}
              className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[var(--tm-accent-soft-bg)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-accent-soft-border)] text-xs font-semibold text-[var(--tm-accent-text)] inline-flex items-center gap-1 shrink-0 active:scale-[0.97] transition-all"
            >
              <span>进入专区</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['daily', '日报', '今日'],
                ['weekly', '周报', '本周'],
                ['monthly', '月报', '本月'],
              ] as Array<[ReportGranularity, string, string]>
            ).map(([granularity, label, periodHint]) => (
              <button
                key={granularity}
                type="button"
                data-open-report={granularity}
                onClick={() => onOpenReports(granularity)}
                className="min-h-[54px] px-3 py-2 rounded-2xl bg-[var(--tm-bg-row)] hover:bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-border-default)] hover:border-[var(--tm-accent-soft-border)] text-left flex flex-col justify-between active:scale-[0.97] transition-all"
              >
                <span className="text-xs font-bold text-[var(--tm-text-primary)]">{label}</span>
                <span className="text-[11px] text-[var(--tm-text-muted)]">{periodHint}</span>
              </button>
            ))}
          </div>

          {onOpenReportWindow && (
            <button
              type="button"
              id="overview-open-report-window"
              onClick={() => onOpenReportWindow('daily')}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[var(--tm-violet-soft-bg)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-violet-soft-border)] text-xs font-semibold text-[var(--tm-violet-text)] flex items-center justify-between gap-2 active:scale-[0.985] transition-all"
            >
              <span className="inline-flex items-center gap-2 min-w-0">
                <BookOpen className="w-4 h-4 text-[var(--tm-violet)] shrink-0" aria-hidden="true" />
                <span className="truncate">打开 AI 报告窗口</span>
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--tm-accent)] shrink-0" aria-hidden="true" />
            </button>
          )}
        </section>
      )}

      <p className="text-[11px] text-[var(--tm-text-muted)] text-center leading-relaxed pt-2 pb-2">
        数据来自 Hub · 保留离线设备历史
        <br />
        今日与本月使用各采集设备的本地统计周期
      </p>
    </div>
  );
};
