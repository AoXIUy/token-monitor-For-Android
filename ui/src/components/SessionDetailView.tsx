import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Cpu,
  GitBranch,
  Layers,
  Laptop,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { MonitorModel } from '../model/monitorModel';
import { MonitorStats, PeriodId, SessionConversationState } from '../types/monitor';
import {
  clientName,
  clientTone,
  formatExact,
  formatFullTime,
  PERIOD_LABELS,
} from '../utils/formatters';
import { renderStatusText } from './SessionsView';
import { DeviceIcon } from './DeviceIcon';
import { SessionConversation } from './SessionConversation';
import { SessionRealtime } from './SessionRealtime';
import {
  CopyButton,
  EmptyState,
  InlineAlert,
  ProgressMeter,
  SectionHeader,
} from './ui/Primitives';

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
  conversation?: SessionConversationState | null;
  onQueryConversation?: (deviceId: string, key: string, cursor?: string) => void;
  onClearConversation?: () => void;
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
  conversation = null,
  onQueryConversation,
  onClearConversation,
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
      className="min-h-[44px] px-3.5 py-2 rounded-full glass-pill-bar hover:border-[var(--tm-border-strong)] active:scale-[0.98] inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--tm-text-primary)] transition-all"
    >
      <ArrowLeft className="w-4 h-4 text-[var(--tm-accent)] shrink-0" aria-hidden="true" />
      <span>返回会话列表</span>
    </button>
  );

  if (!data) {
    return (
      <div className="space-y-3">
        {backButton}
        <EmptyState
          icon={<MessageSquare className="w-6 h-6" />}
          title="Hub 未提供这条会话的明细"
          description="可能已跨统计周期、被移除，或采集端未上传。可刷新后重试。"
        />
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

  // Guard minor backward wall-clock skew (up to 5s) so temporary NTP drift does not deadlock live availability.
  const effectiveNow = fetchedAt > 0 && fetchedAt > now && fetchedAt - now <= 5000 ? fetchedAt : now;
  const liveAvailable =
    foreground &&
    statusHealthy &&
    fetchedAt > 0 &&
    effectiveNow - fetchedAt < 30000 &&
    effectiveNow >= fetchedAt;

  // Verify the parent session actually exists in the current snapshot before making it clickable.
  const parentResolvable = Boolean(
    data.parentKey &&
      MonitorModel.sessionDetail(stats, data.parentKey, {
        deviceId,
        period: data.period,
        now,
      }),
  );

  const renderField = (
    label: string,
    value: React.ReactNode,
    options?: { fullWidth?: boolean; copyValue?: string; mono?: boolean; breakAll?: boolean },
  ) => (
    <div className={`min-w-0 ${options?.fullWidth ? 'col-span-2' : ''}`}>
      <dt className="text-[11px] text-[var(--tm-text-muted)] flex items-center justify-between gap-2">
        <span className="truncate">{label}</span>
        {options?.copyValue && (
          <CopyButton text={options.copyValue} ariaLabel={`复制 ${label}`} />
        )}
      </dt>
      <dd
        className={`text-xs font-medium text-[var(--tm-text-primary)] mt-0.5 ${
          options?.breakAll ? 'break-all' : 'break-words [overflow-wrap:anywhere]'
        } ${options?.mono ? 'font-mono-tabular' : 'tabular-nums'}`}
      >
        {value}
      </dd>
    </div>
  );

  const cache = MonitorModel.sessionCacheEfficiency(row);
  const tokenParts = [
    {
      id: 'input',
      label: '输入',
      tokens: MonitorModel.count(row.inputTokens),
      colorVar: 'var(--tm-chart-input)',
    },
    {
      id: 'output',
      label: '输出',
      tokens: MonitorModel.count(row.outputTokens),
      colorVar: 'var(--tm-chart-output)',
    },
    {
      id: 'cacheRead',
      label: '缓存读取',
      tokens: MonitorModel.count(row.cacheReadTokens),
      colorVar: 'var(--tm-chart-cache-read)',
    },
    {
      id: 'cacheWrite',
      label: '缓存写入',
      tokens: MonitorModel.count(row.cacheWriteTokens),
      colorVar: 'var(--tm-chart-cache-write)',
    },
  ].filter((part) => part.tokens > 0);

  const tokenPartsSum = tokenParts.reduce((acc, item) => acc + item.tokens, 0);
  const latestModelLabel = MonitorModel.sessionLatestModel(row) || '未知';
  const reasoningEffort = MonitorModel.sessionReasoningEffort(row);
  const usageDisplay = MonitorModel.sessionUsageDisplay(row);
  const timedDurationNum = MonitorModel.numeric(row.timedDurationMs);

  return (
    <div className="space-y-3.5">
      {backButton}

      <section className="glass-hero rounded-3xl p-4 sm:p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${tone.text}`}>
            {clientName(row.client)}
          </span>
          {renderStatusText(status)}
          <span className="px-2 py-0.5 rounded-full bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] text-[11px] font-medium text-[var(--tm-text-secondary)]">
            {PERIOD_LABELS[data.period]}快照
          </span>
        </div>

        <h2 className="text-lg font-bold text-[var(--tm-text-primary)] leading-snug mt-2.5 mb-1 break-words">
          {row.title || row.projectLabel || row.sessionId || row.key}
        </h2>

        <p className="text-xs text-[var(--tm-text-secondary)] leading-relaxed break-words">
          项目：{row.projectLabel || '未提供项目'}
        </p>

        <div className="glass-inset rounded-2xl p-3.5 mt-4 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <div className="text-xl sm:text-2xl font-bold text-[var(--tm-text-primary)] font-mono-tabular break-words">
              {usageDisplay.tokensText}
            </div>
            <div className="text-[11px] text-[var(--tm-text-muted)] font-mono-tabular mt-0.5 break-all">
              {usageDisplay.pending && MonitorModel.numeric(row.totalTokens) === null
                ? '0'
                : formatExact(row.totalTokens)}{' '}
              Tokens
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xl sm:text-2xl font-bold text-[var(--tm-success-text)] font-mono-tabular break-words">
              {usageDisplay.costText}
            </div>
            <div className="text-[11px] text-[var(--tm-text-muted)] mt-0.5">已知费用 · USD</div>
          </div>
        </div>

        {row.unpricedTokens ? (
          <InlineAlert tone="amber" className="mt-3">
            {MonitorModel.compact(row.unpricedTokens)} tokens 暂无定价；费用为已知小计。
          </InlineAlert>
        ) : null}
      </section>

      {onQueryConversation && onClearConversation && (
        <SessionConversation
          key={detailKey}
          detailKey={detailKey}
          client={row.client}
          owners={data.owners}
          available={liveAvailable}
          conversation={conversation}
          onQuery={onQueryConversation}
          onClear={onClearConversation}
        />
      )}

      <section className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5">
        <SectionHeader icon={<Clock className="w-4 h-4" />} title="活动与身份" />
        <dl className="grid grid-cols-2 gap-3.5 pt-3 border-t border-[var(--tm-border-subtle)]">
          {renderField('当前状态', status.label)}
          {renderField('状态依据', status.detail)}
          {renderField('状态观测', formatFullTime(status.observedAt), { mono: true })}
          {renderField(
            '本轮结束',
            row.turnEnded === true ? '已确认结束' : row.turnEnded === false ? '进行中' : '未声明',
          )}
          {renderField('开始时间', formatFullTime(row.startedAt), { mono: true })}
          {renderField('最近使用', formatFullTime(row.lastUsedAt), { mono: true })}
          {renderField('项目', row.projectLabel || '—')}
          {renderField('消息数', formatExact(row.messageCount), { mono: true })}
          {reasoningEffort ? renderField('推理强度', reasoningEffort, { mono: true }) : null}
          {renderField('会话 ID', row.sessionId || row.key, {
            fullWidth: true,
            copyValue: row.sessionId || row.key,
            mono: true,
            breakAll: true,
          })}
          {renderField('完整键值', row.key, {
            fullWidth: true,
            copyValue: row.key,
            mono: true,
            breakAll: true,
          })}
          {row.nativeSessionId
            ? renderField('原生会话 ID', row.nativeSessionId, {
                fullWidth: true,
                copyValue: row.nativeSessionId,
                mono: true,
                breakAll: true,
              })
            : null}
          {row.t3ThreadId
            ? renderField('T3 会话 ID', row.t3ThreadId, {
                fullWidth: true,
                copyValue: row.t3ThreadId,
                mono: true,
                breakAll: true,
              })
            : null}
          {row.sessionKind ? renderField('会话类型', row.sessionKind, { mono: true }) : null}
        </dl>
      </section>

      <section className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5">
        <SectionHeader icon={<Layers className="w-4 h-4" />} title="Token 组成" />

        {tokenPartsSum > 0 && (
          <div className="pt-3 border-t border-[var(--tm-border-subtle)] space-y-2">
            <div
              className="h-2 w-full rounded-full bg-[var(--tm-track-bg)] overflow-hidden flex gap-px"
              role="img"
              aria-label="Token 组成比例条"
            >
              {tokenParts.map((part) => (
                <div
                  key={part.id}
                  style={{
                    width: `${(part.tokens / tokenPartsSum) * 100}%`,
                    backgroundColor: part.colorVar,
                  }}
                  className="h-full min-w-[3px]"
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-[var(--tm-text-secondary)]">
              {tokenParts.map((part) => {
                const pct = ((part.tokens / tokenPartsSum) * 100).toFixed(1);
                return (
                  <span key={part.id} className="inline-flex items-center gap-1.5">
                    <i
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: part.colorVar }}
                      aria-hidden="true"
                    />
                    <span>{part.label}</span>
                    <span className="font-mono-tabular text-[var(--tm-text-muted)]">{pct}%</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-3.5 pt-2.5 border-t border-[var(--tm-border-subtle)]">
          {renderField('输入 Tokens', formatExact(row.inputTokens), { mono: true })}
          {renderField('输出 Tokens', formatExact(row.outputTokens), { mono: true })}
          {renderField('缓存读取', formatExact(row.cacheReadTokens), { mono: true })}
          {renderField('缓存写入', formatExact(row.cacheWriteTokens), { mono: true })}
          {renderField('输入缓存命中率', cache ? `${cache.percent.toFixed(1)}%` : '—', { mono: true })}
          <div className="min-w-0">
            <dt className="text-[11px] text-[var(--tm-text-muted)] truncate">最近使用模型</dt>
            <dd className="text-xs font-medium text-[var(--tm-text-primary)] font-mono-tabular mt-0.5 break-words [overflow-wrap:anywhere]">
              {latestModelLabel}
            </dd>
          </div>
          {renderField('推理 Tokens', formatExact(row.reasoningTokens), { mono: true })}
          {renderField('未分类 Tokens', formatExact(row.unclassifiedTokens), { mono: true })}
          {renderField('匹配计时的输出', formatExact(row.timedOutputTokens), { mono: true })}
          {renderField(
            '匹配输出时长',
            timedDurationNum !== null && timedDurationNum >= 0
              ? `${(timedDurationNum / 1000).toFixed(2)} 秒`
              : '—',
          )}
        </dl>
        <p className="text-[11px] text-[var(--tm-text-muted)] leading-relaxed pt-2.5 border-t border-[var(--tm-border-subtle)]">
          计时是生成速率测算的依据，不等于会话从开始到结束的持续时间。
        </p>
      </section>

      <section className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5">
        <SectionHeader icon={<Zap className="w-4 h-4" />} title="上下文与性能" />

        <div className="pt-3 border-t border-[var(--tm-border-subtle)] space-y-3.5">
          {['antigravity', 'codex'].includes(row.client || '') && (
            <SessionRealtime
              key={`${detailKey}:${deviceId}`}
              stats={stats}
              detailKey={detailKey}
              deviceId={deviceId}
              available={liveAvailable}
              foreground={foreground}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="glass-inset rounded-2xl p-3.5 min-w-0">
              <span className="text-[11px] text-[var(--tm-text-muted)] block">历史匹配均速</span>
              <div className="text-lg font-bold text-[var(--tm-accent-text)] font-mono-tabular mt-1 break-words">
                {MonitorModel.numeric(data.tokensPerSecond) !== null ? (
                  <>
                    {data.tokensPerSecond!.toFixed(1)}{' '}
                    <span className="text-xs text-[var(--tm-text-muted)] font-normal">tok/s</span>
                  </>
                ) : (
                  '—'
                )}
              </div>
            </div>
            <div className="glass-inset rounded-2xl p-3.5 min-w-0">
              <span className="text-[11px] text-[var(--tm-text-muted)] block">提示缓存租约</span>
              <div className="text-lg font-bold text-[var(--tm-success-text)] font-mono-tabular mt-1 break-words">
                {data.promptCache ? (
                  <>
                    {data.promptCache.minutes}{' '}
                    <span className="text-xs text-[var(--tm-text-muted)] font-sans font-normal">分钟</span>
                  </>
                ) : (
                  '—'
                )}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-[var(--tm-text-muted)] leading-relaxed">
            历史均速来自累计匹配计时（非实时）；缺失耗时时不估算。
          </p>

          {data.context ? (
            <div className="pt-3 border-t border-[var(--tm-border-subtle)] space-y-2">
              <div className="space-y-0.5">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-[var(--tm-text-primary)] font-medium">上下文窗口</span>
                  <span
                    className={`font-semibold shrink-0 font-mono-tabular ${
                      data.context.percentUsed > 80
                        ? 'text-[var(--tm-danger-text)]'
                        : 'text-[var(--tm-accent-text)]'
                    }`}
                  >
                    {data.context.percentUsed}%
                  </span>
                </div>
                <p className="text-[11px] font-mono-tabular text-[var(--tm-text-muted)] break-words">
                  {formatExact(data.context.contextTokens)} / {formatExact(data.context.contextWindow)} tokens
                </p>
              </div>
              <ProgressMeter
                percent={data.context.percentUsed}
                tone={data.context.percentUsed > 80 ? 'danger' : 'sky'}
                heightClass="h-2"
                ariaLabel="上下文窗口占用比例"
              />
            </div>
          ) : (
            <p className="text-xs text-[var(--tm-text-muted)] pt-3 border-t border-[var(--tm-border-subtle)]">
              未提供可用的上下文读数
            </p>
          )}

          <p className="text-[11px] text-[var(--tm-text-muted)] leading-relaxed">
            {data.promptCache
              ? `提示缓存预计至 ${formatFullTime(data.promptCache.expiresAt)}；这不是服务端承诺的到期时间。`
              : '没有有效的提示缓存估计。'}{' '}
            上下文占用不计入累计 Token 总量。
          </p>
        </div>
      </section>

      <section className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3">
        <SectionHeader icon={<Cpu className="w-4 h-4" />} title="模型与提供方" />
        <div className="pt-2.5 border-t border-[var(--tm-border-subtle)] space-y-2.5">
          {data.models.length > 0 ? (
            data.models.map((model) => (
              <div key={model.id} className="space-y-1.5 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[var(--tm-text-primary)] font-mono-tabular truncate min-w-0">
                    {model.label}
                  </span>
                  <div className="flex items-baseline gap-2 shrink-0 font-mono-tabular">
                    <span className="font-semibold text-[var(--tm-text-primary)]">
                      {MonitorModel.compact(model.tokens)}
                    </span>
                    <span className="text-[11px] text-[var(--tm-success-text)]">
                      {MonitorModel.money(model.cost)}
                    </span>
                  </div>
                </div>
                {model.components && (
                  <div
                    data-model-components={model.id}
                    className="glass-inset rounded-2xl p-3 text-[11px] text-[var(--tm-text-secondary)] space-y-2"
                  >
                    <p className="text-[var(--tm-text-muted)] tabular-nums">
                      已观测组成：
                      <span className="font-mono-tabular text-[var(--tm-text-primary)]">
                        {formatExact(model.components.totalTokens)} / {formatExact(model.tokens)} Tokens
                      </span>
                    </p>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 tabular-nums">
                      <div className="min-w-0 flex items-baseline justify-between gap-1">
                        <dt className="text-[var(--tm-text-muted)]">输入</dt>
                        <dd className="font-mono-tabular text-[var(--tm-text-primary)]">
                          {formatExact(model.components.inputTokens)}
                        </dd>
                      </div>
                      <div className="min-w-0 flex items-baseline justify-between gap-1">
                        <dt className="text-[var(--tm-text-muted)]">输出</dt>
                        <dd className="font-mono-tabular text-[var(--tm-text-primary)]">
                          {formatExact(model.components.outputTokens)}
                        </dd>
                      </div>
                      <div className="min-w-0 flex items-baseline justify-between gap-1">
                        <dt className="text-[var(--tm-text-muted)]">缓存读取</dt>
                        <dd className="font-mono-tabular text-[var(--tm-success-text)]">
                          {formatExact(model.components.cacheReadTokens)}
                        </dd>
                      </div>
                      <div className="min-w-0 flex items-baseline justify-between gap-1">
                        <dt className="text-[var(--tm-text-muted)]">缓存写入</dt>
                        <dd className="font-mono-tabular text-[var(--tm-warning-text)]">
                          {formatExact(model.components.cacheWriteTokens)}
                        </dd>
                      </div>
                    </dl>
                    {model.components.totalTokens < model.tokens && (
                      <p className="text-[var(--tm-warning-text)]">其余 Tokens 的组成未知</p>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-xs text-[var(--tm-text-muted)]">未提供模型明细</p>
          )}

          {data.providers.map((prov) => (
            <p
              key={prov.label}
              className="text-[11px] text-[var(--tm-text-secondary)] font-mono-tabular pt-2 border-t border-[var(--tm-border-subtle)]"
            >
              {prov.label} · {formatExact(prov.tokens)} tokens
            </p>
          ))}
        </div>
      </section>

      <section className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3">
        <SectionHeader icon={<Laptop className="w-4 h-4" />} title="来源设备" />
        <div className="pt-2.5 border-t border-[var(--tm-border-subtle)] divide-y divide-[var(--tm-border-subtle)]">
          {data.owners.length > 0 ? (
            data.owners.map((owner) => (
              <div key={owner.deviceId} className="py-3 first:pt-0 last:pb-0 space-y-2">
                <div className="flex items-start justify-between gap-2 text-xs">
                  <div className="inline-flex items-center gap-1.5 min-w-0 flex-1">
                    <DeviceIcon kind={owner.deviceKind} className="w-4 h-4 text-[var(--tm-accent)] shrink-0" />
                    <span className="font-semibold text-[var(--tm-text-primary)] break-words min-w-0">
                      {owner.hostname}
                      {owner.platform ? (
                        <span className="text-[var(--tm-text-muted)] font-normal ml-1.5">{owner.platform}</span>
                      ) : null}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium shrink-0 whitespace-nowrap ${
                      owner.stale
                        ? 'bg-[var(--tm-warning-soft-bg)] border-[var(--tm-warning-soft-border)] text-[var(--tm-warning-text)]'
                        : 'bg-[var(--tm-success-soft-bg)] border-[var(--tm-success-soft-border)] text-[var(--tm-success-text)]'
                    }`}
                  >
                    <i
                      aria-hidden="true"
                      className={`w-1.5 h-1.5 rounded-full ${
                        owner.stale ? 'bg-[var(--tm-warning)]' : 'bg-[var(--tm-success)]'
                      }`}
                    />
                    <span>{owner.stale ? '上报过期' : '近期上报'}</span>
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-2 p-3 rounded-2xl glass-inset text-[11px]">
                  <div className="col-span-2 min-w-0">
                    <dt className="text-[var(--tm-text-muted)]">设备 ID</dt>
                    <dd className="font-mono-tabular text-[var(--tm-text-secondary)] mt-0.5 break-all">
                      {owner.deviceId}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[var(--tm-text-muted)]">用量更新</dt>
                    <dd className="font-mono-tabular text-[var(--tm-text-secondary)] mt-0.5 break-words">
                      {formatFullTime(owner.updatedAt)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[var(--tm-text-muted)]">Hub 接收</dt>
                    <dd className="font-mono-tabular text-[var(--tm-text-secondary)] mt-0.5 break-words">
                      {formatFullTime(owner.receivedAt)}
                    </dd>
                  </div>
                  <div className="col-span-2 min-w-0 pt-1.5 border-t border-[var(--tm-border-subtle)] flex items-baseline justify-between gap-2 flex-wrap">
                    <dt className="text-[var(--tm-text-muted)]">此设备的会话用量</dt>
                    <dd className="font-mono-tabular text-[var(--tm-text-primary)] font-medium">
                      {owner.session.tokenDataUnavailable === true &&
                      MonitorModel.numeric(owner.session.totalTokens) === null
                        ? '0'
                        : formatExact(owner.session.totalTokens)}{' '}
                      tokens ·{' '}
                      <span className="text-[var(--tm-success-text)]">
                        {MonitorModel.sessionUsageDisplay(owner.session).costText}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
            ))
          ) : (
            <p className="text-xs text-[var(--tm-text-muted)]">未提供来源明细</p>
          )}
        </div>
      </section>

      <section className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3">
        <SectionHeader icon={<GitBranch className="w-4 h-4" />} title="父子会话关系" />
        <div className="pt-2.5 border-t border-[var(--tm-border-subtle)] space-y-2">
          {data.parentKey ? (
            parentResolvable ? (
              <button
                type="button"
                onClick={() => onSelectSession(data.parentKey)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-2xl bg-[var(--tm-accent-soft-bg)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.99] border border-[var(--tm-accent-soft-border)] flex items-center justify-between gap-2 text-xs font-medium text-[var(--tm-accent-text)] transition-all text-left"
              >
                <span className="min-w-0 flex-1 truncate">父会话 {row.parentSessionId}</span>
                <ArrowRight className="w-4 h-4 shrink-0 text-[var(--tm-accent)]" aria-hidden="true" />
              </button>
            ) : (
              <div className="w-full px-3.5 py-2.5 rounded-2xl glass-inset text-xs text-[var(--tm-text-muted)] flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-mono-tabular">
                  父会话 {row.parentSessionId}
                </span>
                <span className="text-[11px] shrink-0">不在当前快照中</span>
              </div>
            )
          ) : (
            <p className="text-xs text-[var(--tm-text-muted)]">未上报父会话</p>
          )}

          {data.children.length > 0 ? (
            data.children.map((child) => (
              <button
                key={child.key}
                type="button"
                onClick={() => onSelectSession(child.key)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-2xl glass-inset hover:border-[var(--tm-border-strong)] active:scale-[0.99] flex items-center justify-between gap-2 text-xs font-medium text-[var(--tm-accent-text)] transition-all text-left"
              >
                <span className="min-w-0 flex-1 truncate">子会话：{child.label}</span>
                <ArrowRight className="w-4 h-4 shrink-0 text-[var(--tm-accent)]" aria-hidden="true" />
              </button>
            ))
          ) : (
            <p className="text-xs text-[var(--tm-text-muted)]">此快照没有已同步的子会话</p>
          )}

          <p className="text-[11px] text-[var(--tm-text-muted)] leading-relaxed pt-2 border-t border-[var(--tm-border-subtle)]">
            每条会话保留自己的用量，父子关系不会重复累加 Token。
          </p>
        </div>
      </section>

      <p className="text-[11px] text-[var(--tm-text-muted)] text-center leading-relaxed pt-2 pb-2">
        统计与元数据来自 Hub 快照；Antigravity 与 Codex 对话仅在查看时向在线设备查询。
        <br />
        缺失字段显示为 —，不代表零。
      </p>
    </div>
  );
};
