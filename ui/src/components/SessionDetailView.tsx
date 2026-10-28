import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Cpu,
  GitBranch,
  Layers,
  Laptop,
  Zap,
} from 'lucide-react';
import { MonitorModel } from '../model/monitorModel';
import { MonitorStats, PeriodId } from '../types/monitor';
import {
  clientTone,
  formatExact,
  formatFullTime,
  PERIOD_LABELS,
  providerName,
} from '../utils/formatters';
import { renderStatusText } from './SessionsView';

interface SessionDetailViewProps {
  stats: MonitorStats;
  detailKey: string;
  deviceId: string;
  period: PeriodId;
  statusHealthy: boolean;
  foreground: boolean;
  fetchedAt: number;
  now: number;
  onBack: () => void;
  onSelectSession: (key: string) => void;
}

export const SessionDetailView: React.FC<SessionDetailViewProps> = ({
  stats,
  detailKey,
  deviceId,
  period,
  statusHealthy,
  foreground,
  fetchedAt,
  now,
  onBack,
  onSelectSession,
}) => {
  const data = MonitorModel.sessionDetail(stats, detailKey, {
    deviceId,
    period,
    now,
  });

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      data-back-sessions="true"
      className="min-h-[44px] inline-flex items-center gap-2 text-xs font-semibold text-sky-300 hover:text-sky-200 transition-colors mb-1"
    >
      <ArrowLeft className="w-4 h-4" />
      <span>返回会话列表</span>
    </button>
  );

  if (!data) {
    return (
      <div className="space-y-3">
        {backButton}
        <div className="glass-panel rounded-3xl p-8 text-center">
          <p className="text-base font-semibold text-slate-100 mb-1.5">
            Hub 未提供这条会话的明细
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            可能已跨统计周期、被移除，或采集端未上传。可刷新后重试。
          </p>
        </div>
      </div>
    );
  }

  const { row } = data;
  const status = MonitorModel.sessionStatus(row, {
    now,
    stats,
    deviceId,
    period: data.period,
    connected: statusHealthy,
    foreground,
    fetchedAt,
  });
  const tone = clientTone(row.client);

  const renderField = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-[11px] text-slate-400">{label}</dt>
      <dd className="text-xs font-medium text-slate-100 font-mono-tabular mt-0.5 break-all">
        {value}
      </dd>
    </div>
  );

  return (
    <div className="space-y-3.5">
      {backButton}

      <section className="glass-hero rounded-3xl p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${tone.text}`}>
            {providerName(row.client)}
          </span>
          <span className="text-slate-500">·</span>
          {renderStatusText(status)}
        </div>

        <h2 className="text-lg font-bold text-white leading-snug mt-2.5 mb-1.5 break-words">
          {row.title || row.projectLabel || row.sessionId}
        </h2>

        <p className="text-xs text-slate-300/80 font-mono-tabular break-all">
          {PERIOD_LABELS[data.period]}统计快照 · {row.projectLabel || '未提供项目'} ·{' '}
          <span className="text-slate-400">{row.key}</span>
        </p>

        <div className="glass-inset rounded-2xl p-3.5 mt-4 grid grid-cols-2 gap-3">
          <div>
            <div className="text-2xl font-bold text-white font-mono-tabular">
              {MonitorModel.compact(row.totalTokens)}
            </div>
            <div className="text-[11px] text-slate-400 font-mono-tabular mt-0.5">
              {formatExact(row.totalTokens)} Tokens
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-300 font-mono-tabular">
              {MonitorModel.money(row.costUsd)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">已知费用 · USD</div>
          </div>
        </div>

        {row.unpricedTokens ? (
          <p className="mt-3 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-400/20 rounded-xl p-3 leading-relaxed">
            {MonitorModel.compact(row.unpricedTokens)} tokens 暂无定价；费用为已知小计。
          </p>
        ) : null}
      </section>

      <section className="glass-panel rounded-3xl p-4.5">
        <div className="flex items-center gap-2 mb-3.5">
          <Clock className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-100">活动与身份</h3>
        </div>
        <dl className="grid grid-cols-2 gap-3.5 pt-3 border-t border-white/8">
          {renderField('当前状态', status.label)}
          {renderField('状态依据', status.detail)}
          {renderField('状态观测', formatFullTime(status.observedAt))}
          {renderField('开始时间', formatFullTime(row.startedAt))}
          {renderField('最近使用', formatFullTime(row.lastUsedAt))}
          {renderField(
            '本轮结束',
            row.turnEnded === true ? '已确认结束' : row.turnEnded === false ? '进行中' : '未声明'
          )}
          {renderField('会话 ID', row.sessionId || row.key)}
          {renderField('完整键值', row.key)}
          {renderField('项目', row.projectLabel || '—')}
          {renderField('消息数', formatExact(row.messageCount))}
          {row.nativeSessionId ? renderField('原生会话 ID', row.nativeSessionId) : null}
          {row.t3ThreadId ? renderField('T3 会话 ID', row.t3ThreadId) : null}
          {row.sessionKind ? renderField('会话类型', row.sessionKind) : null}
        </dl>
      </section>

      <section className="glass-panel rounded-3xl p-4.5">
        <div className="flex items-center gap-2 mb-3.5">
          <Layers className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-100">Token 组成与性能</h3>
        </div>
        <dl className="grid grid-cols-2 gap-3.5 pt-3 border-t border-white/8">
          {renderField('输入 Tokens', formatExact(row.inputTokens))}
          {renderField('输出 Tokens', formatExact(row.outputTokens))}
          {renderField('缓存读取', formatExact(row.cacheReadTokens))}
          {renderField('缓存写入', formatExact(row.cacheWriteTokens))}
          {renderField('推理 Tokens', formatExact(row.reasoningTokens))}
          {renderField('未分类 Tokens', formatExact(row.unclassifiedTokens))}
          {renderField('匹配计时的输出', formatExact(row.timedOutputTokens))}
          {renderField(
            '匹配输出时长',
            MonitorModel.numeric(row.timedDurationMs) !== null
              ? `${(Number(row.timedDurationMs) / 1000).toFixed(2)} 秒`
              : '—'
          )}
        </dl>
        <p className="text-[11px] text-slate-400 leading-relaxed mt-3 pt-2.5 border-t border-white/6">
          计时是生成速率测算的依据，不等于会话从开始到结束的持续时间。
        </p>
      </section>

      <section className="glass-panel rounded-3xl p-4.5">
        <div className="flex items-center gap-2 mb-3.5">
          <Zap className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-100">性能与上下文</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="glass-inset rounded-2xl p-3.5">
            <span className="text-[11px] text-slate-400 block">生成速率</span>
            <div className="text-lg font-bold text-sky-300 font-mono-tabular mt-1">
              {MonitorModel.numeric(data.tokensPerSecond) !== null ? (
                <>
                  {data.tokensPerSecond!.toFixed(1)}{' '}
                  <small className="text-xs text-slate-400 font-normal">tok/s</small>
                </>
              ) : (
                '—'
              )}
            </div>
          </div>
          <div className="glass-inset rounded-2xl p-3.5">
            <span className="text-[11px] text-slate-400 block">推理 Tokens</span>
            <div className="text-lg font-bold text-sky-300 font-mono-tabular mt-1">
              {MonitorModel.numeric(row.reasoningTokens) === null
                ? '—'
                : MonitorModel.compact(row.reasoningTokens)}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed mt-2.5">
          速率来自累计匹配计时，并非据模型可知的最近轮次；缺失耗时时不估算。
        </p>

        {data.context ? (
          <div className="mt-3.5 pt-3 border-t border-white/8 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2 text-xs font-mono-tabular">
              <span className="text-slate-200">
                上下文窗口 ({formatExact(data.context.contextTokens)} /{' '}
                {formatExact(data.context.contextWindow)})
              </span>
              <span
                className={`font-semibold ${
                  data.context.percentUsed > 80 ? 'text-amber-300' : 'text-sky-300'
                }`}
              >
                {data.context.percentUsed}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div
                style={{ width: `${Math.max(1.5, Math.min(100, data.context.percentUsed))}%` }}
                className={`h-full rounded-full transition-all duration-300 ${
                  data.context.percentUsed > 80
                    ? 'bg-gradient-to-r from-amber-400 to-rose-400'
                    : 'bg-gradient-to-r from-sky-400 to-emerald-400'
                }`}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-white/8">
            未提供可用的上下文读数
          </p>
        )}

        <p className="text-[11px] text-slate-400 leading-relaxed mt-3">
          {data.promptCache
            ? `提示缓存命中状态：预计租约还剩 ${data.promptCache.minutes} 分钟（至 ${formatFullTime(
                data.promptCache.expiresAt
              )}）；这不是服务端承诺的到期时间。`
            : '没有有效的提示缓存估计。'}{' '}
          上下文占用不计入累计 Token 总量。
        </p>
      </section>

      <section className="glass-panel rounded-3xl p-4.5">
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-100">模型与提供方</h3>
        </div>
        <div className="pt-2.5 border-t border-white/8 space-y-2">
          {data.models.length > 0 ? (
            data.models.map((model) => (
              <div
                key={model.id}
                className="flex items-baseline justify-between gap-2 text-xs font-mono-tabular"
              >
                <span className="text-slate-200 truncate">{model.label}</span>
                <div className="flex items-baseline gap-2 shrink-0">
                  <span className="font-semibold text-slate-100">
                    {MonitorModel.compact(model.tokens)}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {MonitorModel.money(model.cost)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-400">未提供模型明细</p>
          )}

          {data.providers.map((prov) => (
            <p
              key={prov.label}
              className="text-[11px] text-slate-400 font-mono-tabular pt-1 border-t border-white/5"
            >
              {prov.label} · {formatExact(prov.tokens)} tokens
            </p>
          ))}
        </div>
      </section>

      <section className="glass-panel rounded-3xl p-4.5">
        <div className="flex items-center gap-2 mb-3">
          <Laptop className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-100">来源设备</h3>
        </div>
        <div className="pt-2.5 border-t border-white/8 divide-y divide-white/8">
          {data.owners.length > 0 ? (
            data.owners.map((owner) => (
              <div key={owner.deviceId} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-100">
                    {owner.hostname}{' '}
                    <span className="text-slate-400 font-normal">{owner.platform}</span>
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      owner.stale ? 'text-amber-300' : 'text-emerald-300'
                    }`}
                  >
                    {owner.stale ? '上报过期' : '近期上报'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono-tabular leading-relaxed mt-1">
                  {owner.deviceId}
                  <br />
                  用量更新 {formatFullTime(owner.updatedAt)}
                  <br />
                  Hub 接收 {formatFullTime(owner.receivedAt)}
                  <br />
                  此设备的会话用量 {formatExact(owner.session.totalTokens)} tokens ·{' '}
                  {MonitorModel.money(owner.session.costUsd)}
                </p>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-400">未提供来源明细</p>
          )}
        </div>
      </section>

      <section className="glass-panel rounded-3xl p-4.5">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-100">父子会话关系</h3>
        </div>
        <div className="pt-2.5 border-t border-white/8 space-y-2">
          {data.parentKey ? (
            <button
              type="button"
              onClick={() => onSelectSession(data.parentKey)}
              className="w-full min-h-[42px] px-3 py-2 rounded-2xl bg-sky-500/10 hover:bg-sky-500/15 border border-sky-400/20 flex items-center justify-between text-xs font-medium text-sky-300 transition-colors text-left"
            >
              <span className="truncate">父会话 {row.parentSessionId}</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          ) : (
            <p className="text-xs text-slate-400">未上报父会话</p>
          )}

          {data.children.length > 0 ? (
            data.children.map((child) => (
              <button
                key={child.key}
                type="button"
                onClick={() => onSelectSession(child.key)}
                className="w-full min-h-[42px] px-3 py-2 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 flex items-center justify-between text-xs font-medium text-sky-300 transition-colors text-left"
              >
                <span className="truncate">子会话：{child.label}</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            ))
          ) : (
            <p className="text-xs text-slate-400">此快照没有已同步的子会话</p>
          )}

          <p className="text-[11px] text-slate-400 leading-relaxed pt-2 border-t border-white/5">
            每条会话保留自己的用量，父子关系不会重复累加 Token。
          </p>
        </div>
      </section>

      <p className="text-[11px] text-slate-400/80 text-center leading-relaxed pt-3 pb-2">
        Hub 同步统计与元数据，不包含对话正文或工具调用原文。
        <br />
        缺失字段显示为 —，不代表零。
      </p>
    </div>
  );
};
