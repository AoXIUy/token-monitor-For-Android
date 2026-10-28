import React from 'react';
import { ArrowRight, ChevronRight, MessageSquare, Search, X } from 'lucide-react';
import { MonitorModel } from '../model/monitorModel';
import {
  DeviceData,
  MonitorStats,
  PeriodData,
  PeriodId,
  SessionStatusResult,
} from '../types/monitor';
import { clientTone, formatShortTime, providerName } from '../utils/formatters';

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
  sessionLimit: number;
  onLoadMore: () => void;
  openKeys: Set<string>;
  onToggleOpen: (key: string) => void;
  onOpenSessionDetail: (key: string) => void;
  statusHealthy: boolean;
  foreground: boolean;
  fetchedAt: number;
  now: number;
}

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
  sessionLimit,
  onLoadMore,
  openKeys,
  onToggleOpen,
  onOpenSessionDetail,
  statusHealthy,
  foreground,
  fetchedAt,
  now,
}) => {
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

  const rows = MonitorModel.sessions(selected.period, search);
  const omitted = (selected.device || stats).sessionDetailsOmitted?.[period];

  const statusOptions = { now, stats, deviceId, period, connected: statusHealthy, foreground, fetchedAt };
  const statuses = rows.map(row => MonitorModel.sessionStatus(row, statusOptions));

  const activeCount = statuses.filter((s) => s.state === 'running').length;
  const waitingCount = statuses.filter((s) => s.state === 'waiting').length;

  return (
    <div className="space-y-3.5">

      <div id="session-search">
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
              className="w-full min-h-[44px] pl-10 pr-9 py-2.5 rounded-2xl glass-inset text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60 transition-colors"
            />
            {search && (
              <button
                type="button"
                id="clear-search"
                onClick={() => onSearchChange('')}
                aria-label="清除搜索"
                className="w-8 h-8 flex items-center justify-center absolute right-1.5 text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </label>
      </div>

      {omitted ? (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-400/25 rounded-2xl p-3 leading-relaxed">
          {omitted} 条会话明细未上传；总览的 Token 和费用仍包含完整汇总。
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="glass-panel rounded-3xl p-8 text-center my-4">
          <MessageSquare className="w-8 h-8 text-sky-400/70 mx-auto mb-3" />
          <p className="text-base font-semibold text-slate-100 mb-1.5">暂无匹配会话</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            {search
              ? '试试其他工具、项目或模型名称。'
              : '采集设备可能尚未提供会话明细。'}
          </p>
        </div>
      ) : (
        <>

          <div className="flex items-center justify-between flex-wrap gap-2 px-1 text-xs">
            <div className="flex items-center gap-2.5 font-mono-tabular">
              <span className="text-slate-300">
                <strong className="text-white">{rows.length}</strong> 条{search ? '匹配' : ''}会话
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-300 font-medium">
                活跃 {activeCount}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-amber-300 font-medium">
                等待 {waitingCount}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              前台实时跟踪 · 以采集端上报为准
            </span>
          </div>

          <div className="space-y-2.5">
            {rows.slice(0, sessionLimit).map((row, index) => {
              const encodedKey = encodeURIComponent(row.key);
              const isOpen = openKeys.has(encodedKey);
              const status = statuses[index];
              const tone = clientTone(row.client);
              const modelNames = Object.keys(row.models || {}).join(', ') || '模型未知';

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
                          {MonitorModel.numeric(row.totalTokens) === null ? '—' : MonitorModel.compact(row.totalTokens)}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {MonitorModel.money(row.costUsd)}
                        </span>
                      </div>
                    </div>

                    <div className="text-sm font-semibold text-slate-100 leading-snug my-2 break-words">
                      {row.title || row.projectLabel || row.sessionId || row.key}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 font-mono-tabular">
                        <span className="shrink-0">{formatShortTime(row.lastUsedAt)}</span>
                        <span className="text-slate-600">·</span>
                        <span className="truncate">{modelNames}</span>
                      </div>
                      {row.subagentCount ? (
                        <span data-subagent-count={row.subagentCount} className="shrink-0 text-sky-300">
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
                    <div className="px-4 pb-4 pt-2 border-t border-white/8">
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
                          <dt className="text-[10px] text-slate-400">会话 ID</dt>
                          <dd className="font-mono-tabular text-slate-200 mt-0.5 truncate">
                            {row.sessionId || row.key}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-400">项目</dt>
                          <dd className="font-mono-tabular text-slate-200 mt-0.5 truncate">
                            {row.projectLabel || '—'}
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
                            {row.groupRows.map(member => (
                              <li key={member.key}>
                                <button
                                  type="button"
                                  data-session-member={encodeURIComponent(member.key)}
                                  onClick={() => onOpenSessionDetail(member.key)}
                                  className="w-full min-h-[44px] glass-inset rounded-xl p-3 text-left space-y-1.5"
                                >
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-[10px] font-semibold text-sky-300">
                                      {member.groupRole === 'main' ? '主会话' : '子代理'} · {providerName(member.client)}
                                    </span>
                                    {renderStatusText(MonitorModel.sessionStatus(member, statusOptions))}
                                  </div>
                                  <div className="text-xs text-slate-100 break-words">
                                    {member.title || member.projectLabel || member.sessionId || member.key}
                                  </div>
                                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 font-mono-tabular">
                                    <span className="min-w-0 truncate">{member.sessionId || member.key}</span>
                                    <span className="shrink-0">
                                      {MonitorModel.numeric(member.totalTokens) === null ? '—' : MonitorModel.compact(member.totalTokens)}
                                      {' · '}{MonitorModel.money(member.costUsd)}
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

          {rows.length > sessionLimit && (
            <button
              type="button"
              onClick={onLoadMore}
              className="w-full min-h-[46px] rounded-2xl glass-panel text-xs font-semibold text-sky-300 hover:text-sky-200 transition-colors"
            >
              再显示 40 条（剩余 {rows.length - sessionLimit}）
            </button>
          )}
        </>
      )}
    </div>
  );
};
