import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronRight, MessageSquare } from 'lucide-react';
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
      ? 'bg-emerald-500/8 border-emerald-400/25 border-dashed text-emerald-200'
      : 'bg-emerald-500/14 border-emerald-400/30 text-emerald-200'
    : isWaiting
    ? 'bg-amber-500/12 border-amber-400/30 text-amber-200'
    : isEnded
    ? 'bg-sky-500/10 border-sky-400/25 text-sky-200'
    : 'bg-white/[0.05] border-white/10 text-slate-300';

  const dotClass = isRunning
    ? inferred
      ? 'border border-emerald-400 bg-emerald-400/25'
      : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]'
    : isWaiting
    ? 'bg-amber-400'
    : isEnded
    ? 'bg-sky-400'
    : 'bg-slate-400';

  return (
    <span
      data-session-state={status.state}
      data-state-source={status.source}
      aria-label={`会话状态：${status.label}${inferred ? '，根据最近活动推断' : ''}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${pillClass}`}
    >
      <i className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} aria-hidden="true" />
      <span>{status.label}</span>
      {inferred && <span className="text-[11px] text-emerald-300/90">(推断)</span>}
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

  const searchedRows = useMemo(
    () => MonitorModel.sessions(selected.period, search, { sortBy }),
    [selected.period, search, sortBy],
  );
  const selection = useMemo(
    () => MonitorModel.filterSessionTools(searchedRows, tool),
    [searchedRows, tool],
  );
  useEffect(() => {
    if (tool && selection.tool !== tool) onToolChange('');
  }, [tool, selection.tool, onToolChange]);

  const allRows = selection.rows;
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
  const sortedIndices = filteredIndices;

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
    <div className="space-y-3.5">
      <div id="session-search" className="space-y-2.5">
        <SearchField
          id="search"
          value={search}
          onChange={onSearchChange}
          placeholder="搜索工具、项目、模型或会话 ID…"
          ariaLabel="搜索会话"
          clearAriaLabel="清除搜索"
        />

        {allRows.length > 0 && (
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
                  className={`flex-1 min-w-fit min-h-[40px] px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all duration-150 whitespace-nowrap active:scale-[0.98] ${
                    active
                      ? 'bg-slate-800/95 text-white shadow-sm border border-white/12'
                      : 'border border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{fLabel}</span>
                  <span className="tabular-nums text-[11px] opacity-85">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selection.tools.length > 1 && (
        <div
          role="group"
          aria-label="按工具筛选会话"
          className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5"
        >
          {['', ...selection.tools].map((client) => {
            const active = selection.tool === client;
            return (
              <button
                key={client}
                type="button"
                data-session-tool={client}
                aria-pressed={active}
                onClick={() => onToolChange(active ? '' : client)}
                className={`min-h-[40px] shrink-0 px-3.5 rounded-full text-xs font-semibold border transition-all active:scale-[0.98] whitespace-nowrap ${
                  active
                    ? 'bg-sky-400/18 border-sky-400/40 text-sky-100'
                    : 'glass-inset text-slate-300 hover:border-white/20'
                }`}
              >
                {client ? clientName(client) : '全部工具'}
              </button>
            );
          })}
        </div>
      )}

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
              : search
              ? '试试其他工具、项目或模型名称。'
              : '采集设备可能尚未提供会话明细。'
          }
          action={
            statusFilter !== 'all' ? (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="min-h-[44px] px-4 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 active:scale-[0.98] border border-sky-400/30 text-xs font-semibold text-sky-200 transition-all"
              >
                显示全部会话 ({allRows.length})
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 px-1 text-xs">
            <div className="flex items-center gap-2 flex-wrap tabular-nums">
              <span className="text-slate-300">
                <strong className="text-white">{filteredIndices.length}</strong> 条
                {search || statusFilter !== 'all' ? '匹配' : ''}会话
              </span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="text-emerald-300 font-medium">运行中 {activeCount}</span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="text-amber-300 font-medium">等待中 {waitingCount}</span>
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
                    className="session-toggle w-full text-left p-4 active:bg-white/[0.03] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span className={`text-xs font-semibold ${tone.text}`}>
                          {clientName(row.client)}
                        </span>
                        {renderStatusText(status)}
                        {supportsConversation && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-500/12 border border-sky-400/25 text-[11px] font-medium text-sky-200">
                            对话
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline gap-1.5 shrink-0 font-mono-tabular pt-0.5">
                        <span className="text-xs font-bold text-slate-50">
                          {usageDisplay.tokensText}
                        </span>
                        <span className="text-[11px] text-emerald-300/90">
                          {usageDisplay.costText}
                        </span>
                      </div>
                    </div>

                    <div className="text-sm font-semibold text-slate-50 leading-snug mt-2 mb-1.5 break-words">
                      {row.title || row.projectLabel || row.sessionId || row.key}
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-[11px] text-slate-400">
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

                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="font-mono-tabular shrink-0">
                          {formatShortTime(row.lastUsedAt)}
                        </span>
                        <span className="text-slate-400 shrink-0" aria-hidden="true">
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
                          className="font-mono-tabular text-slate-300 truncate min-w-0"
                        >
                          {modelNames}
                        </span>
                      </div>
                      <ChevronRight
                        aria-hidden="true"
                        className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${
                          isOpen ? 'rotate-90 text-sky-400' : ''
                        }`}
                      />
                    </div>

                    {(effort || row.subagentCount) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {effort && (
                          <span
                            data-reasoning-effort={effort}
                            className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-500/12 border border-sky-400/25 text-[11px] font-medium text-sky-200"
                          >
                            推理 {effort}
                          </span>
                        )}
                        {row.subagentCount ? (
                          <span
                            data-subagent-count={row.subagentCount}
                            className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-500/12 border border-violet-400/25 text-[11px] font-medium text-violet-200 tabular-nums"
                          >
                            {row.subagentCount} 个子代理
                          </span>
                        ) : null}
                      </div>
                    )}
                  </button>

                  {!isOpen && (
                    <button
                      type="button"
                      data-session-quick-detail={encodeURIComponent(row.detailKey || row.key)}
                      onClick={() => onOpenSessionDetail(row.detailKey || row.key)}
                      className="w-full min-h-[44px] px-4 py-2 border-t border-white/[0.06] bg-white/[0.015] hover:bg-sky-500/[0.07] active:bg-sky-500/12 flex items-center justify-between gap-2 text-xs font-semibold text-sky-300 transition-colors"
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
                  )}

                  {isOpen && (
                    <div className="px-4 pb-4 pt-3 border-t border-white/8 space-y-3">
                      {partSum > 0 && (
                        <div className="space-y-2">
                          <div
                            className="h-2 w-full rounded-full bg-white/[0.07] overflow-hidden flex gap-px"
                            aria-hidden="true"
                          >
                            {inTok > 0 && (
                              <div
                                style={{ width: `${(inTok / partSum) * 100}%` }}
                                className="h-full min-w-[3px] bg-sky-400"
                              />
                            )}
                            {outTok > 0 && (
                              <div
                                style={{ width: `${(outTok / partSum) * 100}%` }}
                                className="h-full min-w-[3px] bg-violet-400"
                              />
                            )}
                            {cacheTok > 0 && (
                              <div
                                style={{ width: `${(cacheTok / partSum) * 100}%` }}
                                className="h-full min-w-[3px] bg-emerald-400"
                              />
                            )}
                            {cacheWriteTok > 0 && (
                              <div
                                style={{ width: `${(cacheWriteTok / partSum) * 100}%` }}
                                className="h-full min-w-[3px] bg-amber-400"
                              />
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums">
                            <span className="text-sky-300">
                              输入 <span className="font-mono-tabular">{MonitorModel.compact(inTok)}</span>
                            </span>
                            <span className="text-violet-300">
                              输出 <span className="font-mono-tabular">{MonitorModel.compact(outTok)}</span>
                            </span>
                            <span className="text-emerald-300">
                              缓存读取 <span className="font-mono-tabular">{MonitorModel.compact(cacheTok)}</span>
                            </span>
                            {cacheWriteTok > 0 && (
                              <span className="text-amber-300">
                                缓存写入 <span className="font-mono-tabular">{MonitorModel.compact(cacheWriteTok)}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <dl className="grid grid-cols-2 gap-3 text-xs">
                        <div className="min-w-0">
                          <dt className="text-[11px] text-slate-400">当前状态</dt>
                          <dd className="text-slate-100 font-medium mt-0.5 break-words">{status.label}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[11px] text-slate-400">状态依据</dt>
                          <dd className="text-slate-200 mt-0.5 break-words">{status.detail}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[11px] text-slate-400">状态观测</dt>
                          <dd className="font-mono-tabular text-slate-200 mt-0.5">
                            {status.observedAt ? formatShortTime(status.observedAt) : '—'}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[11px] text-slate-400">项目</dt>
                          <dd className="text-slate-200 mt-0.5 truncate">
                            {row.projectLabel || '—'}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[11px] text-slate-400">最近使用模型</dt>
                          <dd className="font-mono-tabular text-slate-200 mt-0.5 truncate">
                            {latestModel || '未知'}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[11px] text-slate-400">缓存命中率</dt>
                          <dd className="font-mono-tabular text-emerald-300 mt-0.5">
                            {cacheEff ? `${cacheEff.percent.toFixed(1)}%` : '—'}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[11px] text-slate-400">消息数</dt>
                          <dd className="font-mono-tabular text-slate-200 mt-0.5">
                            {MonitorModel.numeric(row.messageCount) === null
                              ? '—'
                              : MonitorModel.compact(row.messageCount)}
                          </dd>
                        </div>
                        <div className="col-span-2 min-w-0">
                          <dt className="text-[11px] text-slate-400 flex items-center justify-between gap-2">
                            <span>会话 ID</span>
                            <CopyButton
                              text={row.sessionId || row.key}
                              ariaLabel="复制会话 ID"
                              label="复制 ID"
                            />
                          </dt>
                          <dd className="font-mono-tabular text-slate-200 mt-1 break-all">
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
                        <div className="pt-3 border-t border-white/8">
                          <p className="text-[11px] text-slate-400 mb-2 tabular-nums">
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
                                  className="w-full min-h-[44px] glass-inset hover:border-white/20 active:scale-[0.99] rounded-2xl p-3 text-left space-y-1.5 transition-all"
                                >
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-[11px] font-semibold text-sky-300">
                                      {member.groupRole === 'main' ? '主会话' : '子代理'} ·{' '}
                                      {clientName(member.client)}
                                    </span>
                                    {renderStatusText(
                                      MonitorModel.sessionStatus(member, statusOptions),
                                    )}
                                  </div>
                                  <div className="text-xs font-medium text-slate-100 break-words">
                                    {member.title ||
                                      member.projectLabel ||
                                      member.sessionId ||
                                      member.key}
                                  </div>
                                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 font-mono-tabular">
                                    <span className="min-w-0 truncate">
                                      {member.sessionId || member.key}
                                    </span>
                                    <span className="shrink-0">
                                      {memberUsage.tokensText}
                                      {' · '}
                                      {memberUsage.costText}
                                    </span>
                                    <ChevronRight
                                      className="w-4 h-4 shrink-0 text-sky-300"
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
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-2xl bg-sky-500/12 hover:bg-sky-500/20 active:scale-[0.99] border border-sky-400/25 flex items-center justify-between text-xs font-semibold text-sky-200 transition-all"
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

          {filteredIndices.length > sessionLimit && (
            <button
              type="button"
              onClick={onLoadMore}
              className="w-full min-h-[46px] rounded-2xl glass-panel-interactive text-xs font-semibold text-sky-300 hover:text-sky-200 transition-all"
            >
              再显示 40 条（剩余 {filteredIndices.length - sessionLimit}）
            </button>
          )}
        </>
      )}
    </div>
  );
};
