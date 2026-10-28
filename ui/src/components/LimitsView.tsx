import React, { useState } from 'react';
import { ChevronDown, CreditCard, Gauge, ShieldAlert } from 'lucide-react';
import { MonitorModel } from '../model/monitorModel';
import { LimitProvider, MonitorStats, QuotaTabId, SubscriptionsPayload } from '../types/monitor';
import { clientTone, formatShortTime, providerName } from '../utils/formatters';

interface LimitsViewProps {
  providers: LimitProvider[];
  stats: MonitorStats;
  deviceId: string;
  quotaTab: QuotaTabId;
  subscriptions: SubscriptionsPayload | null;
  subscriptionError: string;
}

export const LimitsView: React.FC<LimitsViewProps> = ({
  providers,
  stats,
  deviceId,
  quotaTab,
  subscriptions,
  subscriptionError,
}) => {
  const [openTopUps, setOpenTopUps] = useState<Record<string, boolean>>({});

  if (quotaTab === 'subscriptions') {
    const rows = subscriptions?.subscriptions;
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
            <p className="text-xs text-slate-400 px-1">
              Hub 共享列表 · 不随设备或统计周期筛选
            </p>

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

              return (
                <section key={key} className="glass-panel rounded-3xl p-4.5">
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
                    <span className="text-xs font-medium text-emerald-300 shrink-0">
                      {row.kind === 'subscription' ? '周期订阅' : '预存充值'}
                    </span>
                  </div>

                  <div className="my-3 flex items-baseline gap-2">
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

                  <dl className="grid grid-cols-2 gap-3 pt-3 border-t border-white/8 text-xs">
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
                      <div className="col-span-2">
                        <dt className="text-[11px] text-slate-400">下次续费</dt>
                        <dd className="font-mono-tabular text-sky-300 mt-0.5">
                          {row.nextRenewalOverride}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {row.note && (
                    <p className="text-xs text-slate-300/80 mt-3 pt-2.5 border-t border-white/6 leading-relaxed">
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
                        className="w-full min-h-[36px] flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors"
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
                              className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] font-mono-tabular"
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

  return (
    <div className="space-y-3.5">
      {providers.map((provider) => {
        const account = MonitorModel.limitAccount(provider, stats, deviceId);
        const statusText = provider.stale
          ? '读数已过期'
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

        const isHealthy = provider.status === 'ok' && !provider.stale;
        const tone = clientTone(provider.provider);
        const subMeta = [
          provider.accountName || provider.accountEmail,
          provider.planLabel || provider.accountLabel,
        ].filter(Boolean);

        return (
          <section
            key={account.key}
            data-limit-account={account.key}
            className="glass-panel rounded-3xl p-4.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
                  <h3 className="text-sm font-semibold text-slate-100 truncate">
                    {providerName(provider.provider)}
                  </h3>
                </div>
                {subMeta.length > 0 && (
                  <p className="text-xs text-slate-300/85 mt-1 truncate">
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

              <span
                className={`text-xs font-medium shrink-0 ${
                  isHealthy ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {statusText}
              </span>
            </div>

            {provider.windows && provider.windows.length > 0 ? (
              <div className="mt-3.5 space-y-3 pt-3 border-t border-white/8">
                {provider.windows.map((win, wIdx) => {
                  const q = MonitorModel.quota(provider, win);
                  const isWarn =
                    q.percent !== null && (q.remaining ? q.percent < 15 : q.percent > 85);

                  return (
                    <div key={`${win.kind || 'win'}-${wIdx}`} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="text-slate-200 font-medium min-w-0 break-words">{q.label}</span>
                        <span
                          className={`font-semibold font-mono-tabular shrink-0 ${
                            isWarn ? 'text-amber-300' : 'text-sky-300'
                          }`}
                        >
                          {q.remaining ? `剩余 ${q.value}` : q.value}
                        </span>
                      </div>

                      {q.percent !== null && (
                        <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            style={{
                              width: `${Math.max(1.5, Math.min(100, q.percent))}%`,
                            }}
                            className={`h-full rounded-full transition-all duration-300 ${
                              isWarn
                                ? 'bg-gradient-to-r from-amber-400 to-rose-400'
                                : 'bg-gradient-to-r from-sky-400 to-emerald-400'
                            }`}
                          />
                        </div>
                      )}

                      {q.detail && (
                        <p className="text-[11px] text-slate-400 font-mono-tabular">{q.detail}</p>
                      )}

                      {win.resetsAt ? (
                        <div className="text-[11px] text-slate-400 font-mono-tabular">
                          {win.boundaryKind === 'expiry' ? '到期时间' : '重置时间'} {formatShortTime(win.resetsAt)}
                        </div>
                      ) : win.resetDescription && (
                        <p className="text-[11px] text-slate-400 break-words">{win.resetDescription}</p>
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

            {provider.status !== 'ok' && (
              <p className="mt-3 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-400/20 rounded-xl p-3 leading-relaxed">
                显示的已有读数可能来自上次成功采集，请在来源设备处理账户状态。
              </p>
            )}

            <p className="text-[11px] text-slate-400 font-mono-tabular mt-3 pt-2 border-t border-white/5">
              读数更新 {formatShortTime(provider.updatedAt)}
            </p>
          </section>
        );
      })}

      <p className="text-[11px] text-slate-400/80 text-center leading-relaxed pt-3 pb-2">
        账户与来源设备按 Hub 读数展示 · 刷新只读取已有额度
      </p>
    </div>
  );
};
