import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronRight, MessageSquare, RotateCcw } from 'lucide-react';
import { MonitorModel } from '../model/monitorModel';
import {
  DeviceData,
  MonitorStats,
  PeriodData,
  PeriodId,
  SessionStatusResult,
} from '../types/monitor';
import { clientName, clientTone, formatShortTime } from '../utils/formatters';
import { DeviceIcon } from './DeviceIcon';
import {
  CopyButton,
  EmptyState,
  InlineAlert,
  SearchField,
  SegmentedControl,
} from './ui/Primitives';

interface SessionsViewProps {
  stats: MonitorStats;
  selected: {
    period: PeriodData | null;
    device: DeviceData | null;
    expired: boolean;
  };
  period: PeriodId;
  deviceId: string;
  search: string;
  onSearchChange: (val: string) => void;
  tool: string;
  onToolChange: (tool: string) => void;
  sessionLimit: number;
  onLoadMore: () => void;
  onResetLimit?: () => void;
  openKeys: Set<string>;
  onToggleOpen: (key: string) => void;
  onOpenSessionDetail: (key: string) => void;
  statusHealthy: boolean;
  foreground: boolean;
  fetchedAt: number;
  now: number;
}

type StatusFilterId = 'all' | 'running' | 'waiting' | 'ended';
type SessionSortId = 'recent' | 'tokens' | 'cost';

export function renderStatusText(status: SessionStatusResult) {
  const inferred = status.source === 'inferred';
  const isRunning = status.state === 'running';
  const isWaiting = status.state === 'waiting';
  const isEnded = status.state === 'ended';

  const pillClass = isRunning
    ? inferred
      ? 'bg-[var(--tm-success-soft-bg)] border-[var(--tm-success-soft-border)] border-dashed text-[var(--tm-success-text)]'
      : 'bg-[var(--tm-success-soft-bg)] border-[var(--tm-success-soft-border)] text-[var(--tm-success-text)]'
    : isWaiting
    ? 'bg-[var(--tm-warning-soft-bg)] border-[var(--tm-warning-soft-border)] text-[var(--tm-warning-text)]'
    : isEnded
    ? 'bg-[var(--tm-info-soft-bg)] border-[var(--tm-info-soft-border)] text-[var(--tm-info-text)]'
    : 'bg-[var(--tm-bg-control)] border-[var(--tm-border-default)] text-[var(--tm-text-secondary)]';

  const dotClass = isRunning
    ? inferred
      ? 'border border-[var(--tm-success)] bg-[var(--tm-success-soft-bg)]'
      : 'bg-[var(--tm-success)]'
    : isWaiting
    ? 'bg-[var(--tm-warning)]'
    : isEnded
    ? 'bg-[var(--tm-info)]'
    : 'bg-[var(--tm-text-muted)]';

  return (
    <span
      data-session-state={status.state}
      data-state-source={status.source}
      aria-label={`会话状态：${status.label}${inferred ? '，根据最近活动推断' : ''}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${pillClass}`}
    >
      <i className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} aria-hidden="true" />
      <span>{status.label}</span>
      {inferred && <span className="text-[11px] opacity-85">(推断)</span>}
    </span>
  );
}

export const SessionsView: React.FC<SessionsViewProps> = ({
  stats,
  selected,
  period,
  deviceId,
  search,
  onSearchChange,
  tool,
  onToolChange,
  sessionLimit,
  onLoadMore,
  onResetLimit,
  openKeys,
  onToggleOpen,
  onOpenSessionDetail,
  statusHealthy,
  foreground,
  fetchedAt,
  now,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilterId>('all');
  const [sortBy, setSortBy] = useState<SessionSortId>('recent');

  useEffect(() => {
    setStatusFilter('all');
  }, [period, deviceId]);

  // Compute available tools across the full period snapshot BEFORE applying text search,
  // so typing a transient zero-match search never silently destroys the active tool filter.
  const periodRows = useMemo(
    () => MonitorModel.sessions(selected.period, '', { sortBy }),
    [selected.period, sortBy],
  );
  const periodToolSelection = useMemo(
    () => MonitorModel.filterSessionTools(periodRows, tool),
    [periodRows, tool],
  );

  const searchedRows = useMemo(
    () => MonitorModel.sessions(selected.period, search, { sortBy }),
    [selected.period, search, sortBy],
  );

  // Only reset `tool` when the selected tool actually disappears from the period's sessions.
  useEffect(() => {
    if (tool && periodToolSelection.tool !== tool) onToolChange('');
  }, [tool, periodToolSelection.tool, onToolChange]);

  const activeTool = periodToolSelection.tool;
  const availableTools = periodToolSelection.tools;

  const allRows = useMemo(() => {
    if (!activeTool) return searchedRows;
    return searchedRows.filter((row) =>
      (row.groupRows || [row]).some((member) => member.client === activeTool),
    );
  }, [searchedRows, activeTool]);

  const omitted = (selected.device || stats).sessionDetailsOmitted?.[period];

  const statusOptions = useMemo(
    () => ({
      now,
      stats,
      deviceId,
      period,
      connected: statusHealthy,
      foreground,
      fetchedAt,
    }),
    [now, stats, deviceId, period, statusHealthy, foreground, fetchedAt],
  );
  const allStatuses = useMemo(
    () => allRows.map((row) => MonitorModel.sessionStatus(row, statusOptions)),
    [allRows, statusOptions],
  );

  const { counts, indices: filteredIndices } = useMemo(
    () =>
      period === 'allTime'
        ? { counts: { running: 0, waiting: 0, ended: 0 }, indices: [] as number[] }
        : MonitorModel.filterSessionStatuses(allStatuses, statusFilter),
    [period, allStatuses, statusFilter],
  );
  const { running: activeCount, waiting: waitingCount, ended: endedCount } = counts;
  const unknownCount = useMemo(
    () => allStatuses.filter((s) => s.state === 'unknown').length,
    [allStatuses],
  );
  const sortedIndices = filteredIndices;
  const remainingCount = Math.max(0, filteredIndices.length - sessionLimit);
  const nextPageBatch = Math.min(40, remainingCount);
  const hasAnyFilter = Boolean(search.trim() || activeTool || statusFilter !== 'all');

  if (period === 'allTime') {
    return (
      <EmptyState
        icon={<MessageSquare className="w-6 h-6" />}
        title="累计会话明细不通过 Hub 同步"
        description="请选择今日或本月查看会话，累计总量仍可在总览查看。"
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact unified search + status + tool filter toolbar */}
      <div id="session-search" className="glass-panel rounded-2xl p-3 space-y-2">
        <SearchField
          id="search"
          value={search}
          onChange={onSearchChange}
          placeholder="搜索工具、项目、模型或会话 ID…"
          ariaLabel="搜索会话"
          clearAriaLabel="清除搜索"
        />

        {periodRows.length > 0 && (
          <div
            className="glass-inset p-1 rounded-2xl flex gap-1 overflow-x-auto no-scrollbar"
            role="group"
            aria-label="按会话状态筛选"
          >
            {(
              [
                ['all', '全部', allRows.length],
                ['running', '运行中', activeCount],
                ['waiting', '等待中', waitingCount],
                ['ended', '已结束', endedCount],
              ] as Array<[StatusFilterId, string, number]>
            ).map(([fId, fLabel, count]) => {
              const active = statusFilter === fId;
              return (
                <button
                  key={fId}
                  type="button"
                  data-session-status-filter={fId}
                  aria-pressed={active}
                  onClick={() => {
                    setStatusFilter(fId);
                    onResetLimit?.();
                  }}
                  className={`flex-1 min-w-fit min-h-[44px] px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all duration-150 whitespace-nowrap active:scale-[0.98] ${
                    active
                      ? 'bg-[var(--tm-selection-bg)] text-[var(--tm-selection-text)] shadow-sm border border-[var(--tm-selection-border)]'
                      : 'border border-transparent text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)]'
                  }`}
                >
                  <span>{fLabel}</span>
                  <span className="tabular-nums text-[11px] opacity-85">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {availableTools.length > 1 && (
          <div
            role="group"
            aria-label="按工具筛选会话"
            className="flex gap-1.5 overflow-x-auto no-scrollbar pt-0.5"
          >
            {['', ...availableTools].map((client) => {
              const active = activeTool === client;
              return (
                <button
                  key={client}
                  type="button"
                  data-session-tool={client}
                  aria-pressed={active}
                  onClick={() => onToolChange(active ? '' : client)}
                  className={`min-h-[44px] shrink-0 px-3.5 rounded-full text-xs font-semibold border transition-all active:scale-[0.98] whitespace-nowrap ${
                    active
                      ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]'
                      : 'glass-inset text-[var(--tm-text-secondary)] hover:border-[var(--tm-border-strong)]'
                  }`}
                >
                  {client ? clientName(client) : '全部工具'}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {omitted ? (
        <InlineAlert tone="amber">
          {omitted} 条会话明细未上传；总览的 Token 和费用仍包含完整汇总。
        </InlineAlert>
      ) : null}

      {filteredIndices.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="w-6 h-6" />}
          title="暂无匹配会话"
          description={
            statusFilter !== 'all'
              ? '当前状态筛选下没有会话，可切换至「全部」查看。'
              : search && activeTool
              ? `工具「${clientName(activeTool)}」下没有匹配「${search.trim()}」的会话。`
              : search
              ? '试试其他工具、项目或模型名称。'
              : '采集设备可能尚未提供会话明细。'
          }
          action={
            hasAnyFilter ? (
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {statusFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('all');
                      onResetLimit?.();
                    }}
                    className="min-h-[44px] px-4 rounded-xl bg-[var(--tm-accent-soft-bg)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.98] border border-[var(--tm-accent-soft-border)] text-xs font-semibold text-[var(--tm-accent-text)] transition-all"
                  >
                    显示全部状态 ({allRows.length})
                  </button>
                )}
                {(search || activeTool) && (
                  <button
                    type="button"
                    onClick={() => {
                      onSearchChange('');
                      onToolChange('');
                      setStatusFilter('all');
                      onResetLimit?.();
                    }}
                    className="min-h-[44px] px-4 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.98] border border-[var(--tm-border-default)] text-xs font-semibold text-[var(--tm-text-primary)] inline-flex items-center gap-1.5 transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>重置全部筛选</span>
                  </button>
                )}
              </div>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 px-1 text-xs">
            <div className="flex items-center gap-2 flex-wrap tabular-nums">
              <span className="text-[var(--tm-text-secondary)]">
                <strong className="text-[var(--tm-text-primary)]">{filteredIndices.length}</strong> 条
                {hasAnyFilter ? '匹配' : ''}会话
              </span>
              <span className="text-[var(--tm-text-muted)]" aria-hidden="true">
                ·
              </span>
              {unknownCount > 0 && activeCount === 0 && waitingCount === 0 && (!statusHealthy || !foreground || unknownCount === allRows.length) ? (
                <span className="text-[var(--tm-warning-text)] font-medium">
                  状态待同步 {unknownCount}
                </span>
              ) : (
                <>
                  <span className="text-[var(--tm-success-text)] font-medium">
                    运行中 {activeCount}
                  </span>
                  <span className="text-[var(--tm-text-muted)]" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-[var(--tm-warning-text)] font-medium">
                    等待中 {waitingCount}
                  </span>
                </>
              )}
            </div>

            <SegmentedControl<SessionSortId>
              size="sm"
              tone="accent"
              fullWidth={false}
              ariaLabel="会话排序方式"
              value={sortBy}
              onChange={(sId) => {
                setSortBy(sId);
                onResetLimit?.();
              }}
              options={[
                { value: 'recent', label: '最近', dataAttrs: { 'data-session-sort': 'recent' } },
                { value: 'tokens', label: '用量', dataAttrs: { 'data-session-sort': 'tokens' } },
                { value: 'cost', label: '费用', dataAttrs: { 'data-session-sort': 'cost' } },
              ]}
            />
          </div>

          <div className="space-y-3">
            {sortedIndices.slice(0, sessionLimit).map((rowIndex) => {
              const row = allRows[rowIndex];
              const status = allStatuses[rowIndex];
              const encodedKey = encodeURIComponent(row.key);
              const isOpen = openKeys.has(encodedKey);
              const tone = clientTone(row.client);
              const modelNames = MonitorModel.sessionModelLabel(row);
              const latestModel = MonitorModel.sessionLatestModel(row);
              const supportsConversation =
                row.client === 'codex' || row.client === 'antigravity';

              const inTok = MonitorModel.count(row.inputTokens);
              const outTok = MonitorModel.count(row.outputTokens);
              const cacheTok = MonitorModel.count(row.cacheReadTokens);
              const cacheWriteTok = MonitorModel.count(row.cacheWriteTokens);
              const partSum = inTok + outTok + cacheTok + cacheWriteTok;
              const cacheEff = MonitorModel.sessionCacheEfficiency(row);
              const effort = MonitorModel.sessionReasoningEffort(row);
              const sources = MonitorModel.sessionDevices(row, stats, period, deviceId);
              const usageDisplay = MonitorModel.sessionUsageDisplay(row);

              return (
                <section
                  key={row.key}
                  data-session={encodedKey}
                  className="session glass-panel rounded-3xl overflow-hidden transition-colors duration-150"
                >
                  <button
                    type="button"
                    onClick={() => onToggleOpen(encodedKey)}
                    aria-expanded={isOpen}
                    className="session-toggle w-full text-left p-4 active:bg-[var(--tm-bg-row-hover)] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span className={`text-xs font-semibold ${tone.text}`}>
                          {clientName(row.client)}
                        </span>
                        {renderStatusText(status)}
                        {supportsConversation && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-[11px] font-medium text-[var(--tm-accent-text)]">
                            对话
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline gap-1.5 shrink-0 font-mono-tabular pt-0.5">
                        <span className="text-xs font-bold text-[var(--tm-text-primary)]">
                          {usageDisplay.tokensText}
                        </span>
                        <span className="text-[11px] text-[var(--tm-success-text)]">
                          {usageDisplay.costText}
                        </span>
                      </div>
                    </div>

                    <div className="text-sm font-semibold text-[var(--tm-text-primary)] leading-snug mt-2 mb-1.5 break-words">
                      {row.title || row.projectLabel || row.sessionId || row.key}
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-[11px] text-[var(--tm-text-muted)]">
                      {sources.length ? (
                        sources.map((source) => (
                          <span
                            key={source.deviceId}
                            data-session-device={source.deviceId}
                            title={source.deviceId}
                            className="inline-flex items-center gap-1 min-w-0 max-w-full"
                          >
                            <DeviceIcon kind={source.deviceKind} className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{source.hostname}</span>
                          </span>
                        ))
                      ) : (
                        <span>来源设备未知</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--tm-text-muted)]">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="font-mono-tabular shrink-0">
                          {formatShortTime(row.lastUsedAt)}
                        </span>
                        <span className="shrink-0" aria-hidden="true">
                          ·
                        </span>
                        <span
                          data-session-model
                          title={[
                            latestModel ? `最近使用：${latestModel}` : '',
                            ...Object.keys(row.models || {}),
                          ]
                            .filter(Boolean)
                            .join('\n')}
                          className="font-mono-tabular text-[var(--tm-text-secondary)] truncate min-w-0"
                        >
                          {modelNames}
                        </span>
                      </div>
                      <ChevronRight
                        aria-hidden="true"
                        className={`w-4 h-4 shrink-0 transition-transform duration-150 ${
                          isOpen
                            ? 'rotate-90 text-[var(--tm-accent)]'
                            : 'text-[var(--tm-text-muted)]'
                        }`}
                      />
                    </div>

                    {(effort || row.subagentCount) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {effort && (
                          <span
                            data-reasoning-effort={effort}
                            className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--tm-info-soft-bg)] border border-[var(--tm-info-soft-border)] text-[11px] font-medium text-[var(--tm-info-text)]"
                          >
                            推理 {effort}
                          </span>
                        )}
                        {row.subagentCount ? (
                          <span
                            data-subagent-count={row.subagentCount}
                            className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--tm-violet-soft-bg)] border border-[var(--tm-violet-soft-border)] text-[11px] font-medium text-[var(--tm-violet-text)] tabular-nums"
                          >
                            {row.subagentCount} 个子代理
                          </span>
                        ) : null}
                      </div>
                    )}
                  </button>

                  {!isOpen && (
                    <div className="px-4 py-1 border-t border-[var(--tm-border-subtle)] bg-[var(--tm-bg-row)] flex items-center justify-end">
                      <button
                        type="button"
                        data-session-quick-detail={encodeURIComponent(row.detailKey || row.key)}
                        onClick={() => onOpenSessionDetail(row.detailKey || row.key)}
                        className="w-full min-h-[44px] flex items-center justify-between gap-2 text-xs font-semibold text-[var(--tm-accent-text)] hover:text-[var(--tm-accent)] active:scale-[0.99] transition-all"
                      >
                        <span>
                          {supportsConversation
                            ? '查看对话与详情'
                            : row.groupRows
                            ? '查看主会话详情'
                            : '查看会话详情'}
                        </span>
                        <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                      </button>
                    </div>
                  )}

                  {isOpen && (
                    <div className="px-4 pb-4 pt-3 border-t border-[var(--tm-border-subtle)] space-y-3">
                      {partSum > 0 && (
                        <div className="space-y-2">
                          <div
                            className="h-2 w-full rounded-full bg-[var(--tm-track-bg)] overflow-hidden flex gap-px"
                            aria-hidden="true"
                          >
                            {inTok > 0 && (
                              <div
                                style={{
                                  width: `${(inTok / partSum) * 100}%`,
                                  backgroundColor: 'var(--tm-chart-input)',
                                }}
                                className="h-full min-w-[3px]"
                              />
                            )}
                            {outTok > 0 && (
                              <div
                                style={{
                                  width: `${(outTok / partSum) * 100}%`,
                                  backgroundColor: 'var(--tm-chart-output)',
                                }}
                                className="h-full min-w-[3px]"
                              />
                            )}
                            {cacheTok > 0 && (
                              <div
                                style={{
                                  width: `${(cacheTok / partSum) * 100}%`,
                                  backgroundColor: 'var(--tm-chart-cache-read)',
                                }}
                                className="h-full min-w-[3px]"
                              />
                            )}
                            {cacheWriteTok > 0 && (
                              <div
                                style={{
                                  width: `${(cacheWriteTok / partSum) * 100}%`,
                                  backgroundColor: 'var(--tm-chart-cache-write)',
                                }}
                                className="h-full min-w-[3px]"
                              />
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums">
                            <span className="text-[var(--tm-info-text)]">
                              输入 <span className="font-mono-tabular">{MonitorModel.compact(inTok)}</span>
                            </span>
                            <span className="text-[var(--tm-violet-text)]">
                              输出 <span className="font-mono-tabular">{MonitorModel.compact(outTok)}</span>
                            </span>
                            <span className="text-[var(--tm-success-text)]">
                              缓存读取 <span className="font-mono-tabular">{MonitorModel.compact(cacheTok)}</span>
                            </span>
                            {cacheWriteTok > 0 && (
                              <span className="text-[var(--tm-warning-text)]">
                                缓存写入 <span className="font-mono-tabular">{MonitorModel.compact(cacheWriteTok)}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <dl className="grid grid-cols-2 gap-3 text-xs">
                        <div className="min-w-0">
                          <dt className="text-[11px] text-[var(--tm-text-muted)]">当前状态</dt>
                          <dd className="text-[var(--tm-text-primary)] font-medium mt-0.5 break-words">{status.label}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[11px] text-[var(--tm-text-muted)]">状态依据</dt>
                          <dd className="text-[var(--tm-text-secondary)] mt-0.5 break-words">{status.detail}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[11px] text-[var(--tm-text-muted)]">状态观测</dt>
                          <dd className="font-mono-tabular text-[var(--tm-text-secondary)] mt-0.5">
                            {status.observedAt ? formatShortTime(status.observedAt) : '—'}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[11px] text-[var(--tm-text-muted)]">项目</dt>
                          <dd className="text-[var(--tm-text-secondary)] mt-0.5 truncate">
                            {row.projectLabel || '—'}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[11px] text-[var(--tm-text-muted)]">最近使用模型</dt>
                          <dd className="font-mono-tabular text-[var(--tm-text-secondary)] mt-0.5 truncate">
                            {latestModel || '未知'}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[11px] text-[var(--tm-text-muted)]">缓存命中率</dt>
                          <dd className="font-mono-tabular text-[var(--tm-success-text)] mt-0.5 font-medium">
                            {cacheEff ? `${cacheEff.percent.toFixed(1)}%` : '—'}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[11px] text-[var(--tm-text-muted)]">消息数</dt>
                          <dd className="font-mono-tabular text-[var(--tm-text-secondary)] mt-0.5">
                            {MonitorModel.numeric(row.messageCount) === null
                              ? '—'
                              : MonitorModel.compact(row.messageCount)}
                          </dd>
                        </div>
                        <div className="col-span-2 min-w-0">
                          <dt className="text-[11px] text-[var(--tm-text-muted)] flex items-center justify-between gap-2">
                            <span>会话 ID</span>
                            <CopyButton
                              text={row.sessionId || row.key}
                              ariaLabel="复制会话 ID"
                              label="复制 ID"
                            />
                          </dt>
                          <dd className="font-mono-tabular text-[var(--tm-text-secondary)] mt-1 break-all">
                            {row.sessionId || row.key}
                          </dd>
                        </div>
                      </dl>

                      {row.unpricedTokens ? (
                        <InlineAlert tone="amber">
                          {MonitorModel.compact(row.unpricedTokens)} tokens 暂无定价，费用为已知小计
                        </InlineAlert>
                      ) : null}

                      {row.groupRows && (
                        <div className="pt-3 border-t border-[var(--tm-border-subtle)]">
                          <p className="text-[11px] text-[var(--tm-text-muted)] mb-2 tabular-nums">
                            主会话与子代理 · {row.groupRows.length} 条记录
                          </p>
                          <ul className="space-y-2">
                            {row.groupRows.map((member) => {
                              const memberUsage = MonitorModel.sessionUsageDisplay(member);
                              return (
                                <li key={member.key}>
                                  <button
                                    type="button"
                                    data-session-member={encodeURIComponent(member.key)}
                                    onClick={() => onOpenSessionDetail(member.key)}
                                    className="w-full min-h-[44px] glass-inset hover:border-[var(--tm-border-strong)] active:scale-[0.99] rounded-2xl p-3 text-left space-y-1.5 transition-all"
                                  >
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <span className="text-[11px] font-semibold text-[var(--tm-accent-text)]">
                                        {member.groupRole === 'main' ? '主会话' : '子代理'} ·{' '}
                                        {clientName(member.client)}
                                      </span>
                                      {renderStatusText(
                                        MonitorModel.sessionStatus(member, statusOptions),
                                      )}
                                    </div>
                                    <div className="text-xs font-medium text-[var(--tm-text-primary)] break-words">
                                      {member.title ||
                                        member.projectLabel ||
                                        member.sessionId ||
                                        member.key}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--tm-text-muted)] font-mono-tabular">
                                      <span className="min-w-0 truncate">
                                        {member.sessionId || member.key}
                                      </span>
                                      <span className="shrink-0">
                                        {memberUsage.tokensText}
                                        {' · '}
                                        {memberUsage.costText}
                                      </span>
                                      <ChevronRight
                                        className="w-4 h-4 shrink-0 text-[var(--tm-accent)]"
                                        aria-hidden="true"
                                      />
                                    </div>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenSessionDetail(row.detailKey || row.key)}
                        data-session-detail={encodeURIComponent(row.detailKey || row.key)}
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-2xl bg-[var(--tm-accent-soft-bg)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.99] border border-[var(--tm-accent-soft-border)] flex items-center justify-between text-xs font-semibold text-[var(--tm-accent-text)] transition-all"
                      >
                        <span>{row.groupRows ? '查看主会话详情' : '查看完整详情'}</span>
                        <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {remainingCount > 0 && (
            <button
              type="button"
              onClick={onLoadMore}
              className="w-full min-h-[46px] rounded-2xl glass-panel-interactive text-xs font-semibold text-[var(--tm-accent-text)] transition-all"
            >
              再显示 {nextPageBatch} 条（剩余 {remainingCount}）
            </button>
          )}
        </>
      )}
    </div>
  );
};
