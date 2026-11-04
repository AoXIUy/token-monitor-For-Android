import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, Copy, MessageSquare, Search, X } from 'lucide-react';
import { MonitorModel } from '../model/monitorModel';
import {
  DeviceData,
  MonitorStats,
  PeriodData,
  PeriodId,
  SessionStatusResult,
} from '../types/monitor';
import { clientTone, copyTextToClipboard, formatShortTime, providerName } from '../utils/formatters';
import { DeviceIcon } from './DeviceIcon';

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

export function renderStatusText(status: SessionStatusResult) {
  const inferred = status.source === 'inferred';
  const toneClass =
    status.state === 'running'
      ? 'text-emerald-300'
      : status.state === 'waiting' || inferred
      ? 'text-amber-300'
      : status.state === 'ended'
      ? 'text-sky-300'
      : 'text-slate-400';

  const dotClass =
    status.state === 'running'
      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]'
      : status.state === 'waiting' || inferred
      ? 'bg-amber-400'
      : status.state === 'ended'
      ? 'bg-sky-400'
      : 'bg-slate-500';

  return (
    <span
      data-session-state={status.state}
      data-state-source={status.source}
      aria-label={`会话状态：${status.label}${inferred ? '，根据最近活动推断' : ''}`}
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${toneClass}`}
    >
      <i className={`w-1.5 h-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      <span>{status.label}</span>
      {inferred && <small className="text-[10px] opacity-80">(推断)</small>}
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    setStatusFilter('all');
  }, [period, deviceId]);

  const handleCopy = async (text: string, keyId: string) => {
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    setCopiedKey(keyId);
    copyTimer.current = window.setTimeout(() => {
      setCopiedKey((prev) => (prev === keyId ? null : prev));
      copyTimer.current = null;
    }, 1500);
  };

  const searchedRows = useMemo(
    () => MonitorModel.sessions(selected.period, search),
    [selected.period, search]
  );
  const selection = useMemo(
    () => MonitorModel.filterSessionTools(searchedRows, tool),
    [searchedRows, tool]
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
    [now, stats, deviceId, period, statusHealthy, foreground, fetchedAt]
  );
  const allStatuses = useMemo(
    () => allRows.map((row) => MonitorModel.sessionStatus(row, statusOptions)),
    [allRows, statusOptions]
  );

  if (period === 'allTime') {
    return (
      <div className="glass-panel rounded-3xl p-8 text-center my-4">
        <MessageSquare className="w-8 h-8 text-sky-400/70 mx-auto mb-3" />
        <p className="text-base font-semibold text-slate-100 mb-1.5">
          累计会话明细不通过 Hub 同步
        </p>
        <p className="text-xs text-slate-400 leading-relaxed">
          请选择今日或本月查看会话，累计总量仍可在总览查看。
        </p>
      </div>
    );
  }

  const { counts, indices: filteredIndices } = MonitorModel.filterSessionStatuses(allStatuses, statusFilter);
  const { running: activeCount, waiting: waitingCount, ended: endedCount } = counts;

  return (
    <div className="space-y-3.5">
      <div id="session-search" className="space-y-2.5">
        <label className="block">
          <span className="sr-only">搜索会话</span>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              id="search"
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索工具、项目、模型或会话 ID…"
              autoComplete="off"
              className="w-full min-h-[44px] pl-10 pr-11 py-2.5 rounded-2xl glass-inset text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60 transition-colors"
            />
            {search && (
              <button
                type="button"
                id="clear-search"
                onClick={() => onSearchChange('')}
                aria-label="清除搜索"
                className="w-10 h-10 flex items-center justify-center absolute right-1 text-slate-400 hover:text-slate-200 rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </label>

        {allRows.length > 0 && (
          <div
            className="glass-inset p-1 rounded-2xl grid grid-cols-4 gap-1"
            role="group"
            aria-label="按会话状态筛选"
          >
            {(
              [
                ['all', '全部', allRows.length],
                ['running', '活跃', activeCount],
                ['waiting', '等待', waitingCount],
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
                  className={`min-h-[36px] px-2 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1 transition-all duration-150 whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-slate-800/95 text-white shadow-sm border border-white/10'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{fLabel}</span>
                  <span className="font-mono-tabular text-[10px] opacity-80">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selection.tools.length > 1 && (
        <div role="group" aria-label="按工具筛选会话" className="flex gap-2 overflow-x-auto pb-1">
          {['', ...selection.tools].map(client => (
            <button
              key={client}
              type="button"
              data-session-tool={client}
              aria-pressed={selection.tool === client}
              onClick={() => onToolChange(selection.tool === client ? '' : client)}
              className={`min-h-[44px] shrink-0 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                selection.tool === client ? 'bg-sky-400/15 border-sky-400/40 text-sky-200' : 'glass-inset text-slate-300'
              }`}
            >
              {client ? providerName(client) : '全部工具'}
            </button>
          ))}
        </div>
      )}

      {omitted ? (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-400/25 rounded-2xl p-3 leading-relaxed">
          {omitted} 条会话明细未上传；总览的 Token 和费用仍包含完整汇总。
        </div>
      ) : null}

      {filteredIndices.length === 0 ? (
        <div className="glass-panel rounded-3xl p-8 text-center my-4">
          <MessageSquare className="w-8 h-8 text-sky-400/70 mx-auto mb-3" />
          <p className="text-base font-semibold text-slate-100 mb-1.5">暂无匹配会话</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            {statusFilter !== 'all'
              ? '当前状态筛选下没有会话，可切换至「全部」查看。'
              : search
              ? '试试其他工具、项目或模型名称。'
              : '采集设备可能尚未提供会话明细。'}
          </p>
          {statusFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className="mt-3 min-h-[40px] px-4 rounded-xl bg-sky-500/15 border border-sky-400/25 text-xs font-semibold text-sky-300 hover:bg-sky-500/25 transition-colors"
            >
              显示全部会话 ({allRows.length})
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 px-1 text-xs">
            <div className="flex items-center gap-2 font-mono-tabular">
              <span className="text-slate-300">
                <strong className="text-white">{filteredIndices.length}</strong> 条
                {search || statusFilter !== 'all' ? '匹配' : ''}会话
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-300 font-medium">活跃 {activeCount}</span>
              <span className="text-slate-600">·</span>
              <span className="text-amber-300 font-medium">等待 {waitingCount}</span>
            </div>
            <span className="text-[11px] text-slate-400">
              前台实时跟踪 · 以采集端上报为准
            </span>
          </div>

          <div className="space-y-2.5">
            {filteredIndices.slice(0, sessionLimit).map((rowIndex) => {
              const row = allRows[rowIndex];
              const status = allStatuses[rowIndex];
              const encodedKey = encodeURIComponent(row.key);
              const isOpen = openKeys.has(encodedKey);
              const tone = clientTone(row.client);
              const modelNames = Object.keys(row.models || {}).join(', ') || '模型未知';
              const isCopied = copiedKey === row.key;

              const inTok = MonitorModel.count(row.inputTokens);
              const outTok = MonitorModel.count(row.outputTokens);
              const cacheTok = MonitorModel.count(row.cacheReadTokens);
              const cacheWriteTok = MonitorModel.count(row.cacheWriteTokens);
              const partSum = inTok + outTok + cacheTok + cacheWriteTok;
              const effort = MonitorModel.sessionReasoningEffort(row);
              const sources = MonitorModel.sessionDevices(row, stats, period, deviceId);

              return (
                <section
                  key={row.key}
                  data-session={encodedKey}
                  className="session glass-panel rounded-3xl overflow-hidden transition-all duration-150"
                >
                  <button
                    type="button"
                    onClick={() => onToggleOpen(encodedKey)}
                    aria-expanded={isOpen}
                    className="session-toggle w-full text-left p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className={`text-xs font-semibold ${tone.text}`}>
                          {providerName(row.client)}
                        </span>
                        <span className="text-slate-600" aria-hidden="true">
                          ·
                        </span>
                        {renderStatusText(status)}
                      </div>

                      <div className="flex items-baseline gap-1.5 shrink-0 font-mono-tabular">
                        <span className="text-xs font-bold text-slate-100">
                          {MonitorModel.numeric(row.totalTokens) === null
                            ? '—'
                            : MonitorModel.compact(row.totalTokens)}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {MonitorModel.money(row.costUsd)}
                        </span>
                      </div>
                    </div>

                    <div className="text-sm font-semibold text-slate-100 leading-snug my-2 break-words">
                      {row.title || row.projectLabel || row.sessionId || row.key}
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-[11px] text-slate-400">
                      {sources.length ? sources.map(source => (
                        <span key={source.deviceId} data-session-device={source.deviceId}
                          className="inline-flex items-center gap-1 min-w-0 max-w-full">
                          <DeviceIcon kind={source.deviceKind} className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{source.hostname}{source.hostname !== source.deviceId ? ` · ${source.deviceId}` : ''}</span>
                        </span>
                      )) : <span>来源设备未知</span>}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 font-mono-tabular">
                        <span className="shrink-0">{formatShortTime(row.lastUsedAt)}</span>
                        <span className="text-slate-600">·</span>
                        <span className="truncate">{modelNames}</span>
                        {effort && <span data-reasoning-effort={effort} className="shrink-0 text-sky-300">推理 {effort}</span>}
                      </div>
                      {row.subagentCount ? (
                        <span
                          data-subagent-count={row.subagentCount}
                          className="shrink-0 text-sky-300 font-medium"
                        >
                          {row.subagentCount} 个子代理
                        </span>
                      ) : null}
                      <ChevronRight
                        className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${
                          isOpen ? 'rotate-90 text-sky-400' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-2.5 border-t border-white/8">
                      {partSum > 0 && (
                        <div className="mb-3 space-y-1.5">
                          <div
                            className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden flex"
                            aria-hidden="true"
                          >
                            {inTok > 0 && (
                              <div
                                style={{ width: `${(inTok / partSum) * 100}%` }}
                                className="h-full bg-sky-400"
                              />
                            )}
                            {outTok > 0 && (
                              <div
                                style={{ width: `${(outTok / partSum) * 100}%` }}
                                className="h-full bg-violet-400"
                              />
                            )}
                            {cacheTok > 0 && (
                              <div
                                style={{ width: `${(cacheTok / partSum) * 100}%` }}
                                className="h-full bg-emerald-400"
                              />
                            )}
                            {cacheWriteTok > 0 && (
                              <div
                                style={{ width: `${(cacheWriteTok / partSum) * 100}%` }}
                                className="h-full bg-amber-400"
                              />
                            )}
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-slate-400 font-mono-tabular">
                            <span className="text-sky-300">
                              输入 {MonitorModel.compact(inTok)}
                            </span>
                            <span className="text-violet-300">
                              输出 {MonitorModel.compact(outTok)}
                            </span>
                            <span className="text-emerald-300">
                              缓存读取 {MonitorModel.compact(cacheTok)}
                            </span>
                            {cacheWriteTok > 0 && (
                              <span className="text-amber-300">
                                缓存写入 {MonitorModel.compact(cacheWriteTok)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <dl className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <dt className="text-[10px] text-slate-400">当前状态</dt>
                          <dd className="text-slate-100 font-medium mt-0.5">{status.label}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-400">状态依据</dt>
                          <dd className="text-slate-200 mt-0.5">{status.detail}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-400">状态观测</dt>
                          <dd className="font-mono-tabular text-slate-200 mt-0.5">
                            {status.observedAt ? formatShortTime(status.observedAt) : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-400">项目</dt>
                          <dd className="font-mono-tabular text-slate-200 mt-0.5 truncate">
                            {row.projectLabel || '—'}
                          </dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-[10px] text-slate-400 flex items-center justify-between">
                            <span>会话 ID</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(row.sessionId || row.key, row.key)}
                              className="inline-flex items-center gap-1 min-h-[26px] px-2 py-0.5 rounded-lg bg-white/[0.04] hover:bg-sky-500/15 border border-white/[0.08] text-[10px] text-sky-300 hover:text-sky-200 transition-colors"
                            >
                              {isCopied ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-300">已复制</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>复制 ID</span>
                                </>
                              )}
                            </button>
                          </dt>
                          <dd className="font-mono-tabular text-slate-200 mt-0.5 break-all">
                            {row.sessionId || row.key}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-400">输入 Tokens</dt>
                          <dd className="font-mono-tabular text-slate-200 mt-0.5">
                            {MonitorModel.numeric(row.inputTokens) === null
                              ? '—'
                              : MonitorModel.compact(row.inputTokens)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-400">输出 Tokens</dt>
                          <dd className="font-mono-tabular text-slate-200 mt-0.5">
                            {MonitorModel.numeric(row.outputTokens) === null
                              ? '—'
                              : MonitorModel.compact(row.outputTokens)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-400">缓存读取</dt>
                          <dd className="font-mono-tabular text-emerald-300 mt-0.5">
                            {MonitorModel.numeric(row.cacheReadTokens) === null
                              ? '—'
                              : MonitorModel.compact(row.cacheReadTokens)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-400">消息数</dt>
                          <dd className="font-mono-tabular text-slate-200 mt-0.5">
                            {MonitorModel.numeric(row.messageCount) === null
                              ? '—'
                              : MonitorModel.compact(row.messageCount)}
                          </dd>
                        </div>
                      </dl>

                      {row.unpricedTokens ? (
                        <p className="mt-3 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-400/20 rounded-xl p-2.5 leading-relaxed">
                          {MonitorModel.compact(row.unpricedTokens)} tokens 暂无定价，费用为已知小计
                        </p>
                      ) : null}

                      {row.groupRows && (
                        <div className="mt-4 pt-3 border-t border-white/8">
                          <p className="text-[10px] text-slate-400 mb-2">
                            主会话与子代理 · {row.groupRows.length} 条记录
                          </p>
                          <ul className="space-y-2">
                            {row.groupRows.map((member) => (
                              <li key={member.key}>
                                <button
                                  type="button"
                                  data-session-member={encodeURIComponent(member.key)}
                                  onClick={() => onOpenSessionDetail(member.key)}
                                  className="w-full min-h-[44px] glass-inset hover:border-white/15 rounded-xl p-3 text-left space-y-1.5 transition-colors"
                                >
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-[10px] font-semibold text-sky-300">
                                      {member.groupRole === 'main' ? '主会话' : '子代理'} ·{' '}
                                      {providerName(member.client)}
                                    </span>
                                    {renderStatusText(
                                      MonitorModel.sessionStatus(member, statusOptions)
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-100 break-words">
                                    {member.title ||
                                      member.projectLabel ||
                                      member.sessionId ||
                                      member.key}
                                  </div>
                                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 font-mono-tabular">
                                    <span className="min-w-0 truncate">
                                      {member.sessionId || member.key}
                                    </span>
                                    <span className="shrink-0">
                                      {MonitorModel.numeric(member.totalTokens) === null
                                        ? '—'
                                        : MonitorModel.compact(member.totalTokens)}
                                      {' · '}
                                      {MonitorModel.money(member.costUsd)}
                                    </span>
                                    <ChevronRight className="w-3.5 h-3.5 shrink-0 text-sky-300" />
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenSessionDetail(row.detailKey || row.key)}
                        data-session-detail={encodeURIComponent(row.detailKey || row.key)}
                        className="w-full min-h-[44px] mt-3 pt-2.5 border-t border-white/8 flex items-center justify-between text-xs font-semibold text-sky-300 hover:text-sky-200 transition-colors"
                      >
                        <span>{row.groupRows ? '查看主会话详情' : '查看完整详情'}</span>
                        <ArrowRight className="w-4 h-4" />
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
              className="w-full min-h-[46px] rounded-2xl glass-panel text-xs font-semibold text-sky-300 hover:text-sky-200 transition-colors"
            >
              再显示 40 条（剩余 {filteredIndices.length - sessionLimit}）
            </button>
          )}
        </>
      )}
    </div>
  );
};
