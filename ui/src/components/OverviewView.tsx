import React, { useState } from 'react';
import { ChevronDown, Layers, TrendingUp } from 'lucide-react';
import { HistoryChart } from './HistoryChart';
import { MonitorModel } from '../model/monitorModel';
import { BreakdownKind, DeviceData, MonitorStats, PeriodData, PeriodId } from '../types/monitor';
import { clientTone, PERIOD_LABELS, providerName } from '../utils/formatters';

interface OverviewViewProps {
  stats: MonitorStats;
  selected: {
    period: PeriodData | null;
    device: DeviceData | null;
    expired: boolean;
  };
  period: PeriodId;
  deviceId: string;
  breakdownKind: BreakdownKind;
  onBreakdownChange: (kind: BreakdownKind) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  stats,
  selected,
  period,
  deviceId,
  breakdownKind,
  onBreakdownChange,
}) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [showDailyList, setShowDailyList] = useState(false);
  const p = selected.period;
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
  const devices = stats.devices || [];
  const activeDevicesCount = devices.filter((d) => !d.stale).length;
  const unpriced = MonitorModel.count(p.unpricedTokens);
  const trend = MonitorModel.daily(stats);
  const rows = MonitorModel.breakdown(p, breakdownKind);
  const visibleRows = rows.slice(0, 30);
  const totalTokensCount = MonitorModel.count(p.totalTokens);

  const maxTrendTokens = trend.length
    ? Math.max(1, ...trend.map((row) => MonitorModel.count(row.tokens)))
    : 1;
  const trendTotalTokens = trend.reduce((sum, row) => sum + MonitorModel.count(row.tokens), 0);
  const activeTrendDay = trend.find(row => row.date === selectedDate) || trend[trend.length - 1] || null;

  return (
    <div className="space-y-3.5">

      <section className="glass-hero rounded-3xl p-5 relative overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-sky-200/80 tracking-wide">
            {PERIOD_LABELS[period]} Token 用量
          </p>
          <span className="text-[11px] font-mono-tabular text-sky-300/90">
            {deviceId
              ? selected.device?.hostname || selected.device?.deviceId
              : `${activeDevicesCount} / ${devices.length} 台近期上报`}
          </span>
        </div>

        <div className="my-3 flex items-baseline gap-2.5">
          <div className="token-total text-[44px] sm:text-5xl font-extrabold tracking-tight text-white font-mono-tabular leading-none">
            {MonitorModel.compact(p.totalTokens)}
          </div>
          <span className="text-xs font-medium text-slate-300/80 font-mono-tabular">tokens</span>
        </div>

        {!deviceId && <HistoryChart trend={trend} />}

        <div className="pt-2.5 mt-1 border-t border-white/10 flex items-center justify-between gap-2 text-xs text-slate-300/90 font-mono-tabular">
          <span>精确累计: {Number(totalTokensCount).toLocaleString('en-US')}</span>
          {components && (
            <span className="text-emerald-300/95">
              输出 {MonitorModel.compact(components.output)}
            </span>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <section className="glass-panel rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">{PERIOD_LABELS[period]}费用 · USD</p>
            <div className="text-2xl font-bold text-slate-50 font-mono-tabular mt-2 mb-1 tracking-tight">
              {MonitorModel.money(p.costUsd)}
            </div>
          </div>
          <p className="text-[11px] text-slate-400/90 leading-snug mt-1">
            {unpriced
              ? `${MonitorModel.compact(unpriced)} tokens 暂无定价；费用为已知小计`
              : '按采集端定价统计'}
          </p>
        </section>

        <section className="glass-panel rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">缓存读取占比</p>
            <div className="text-2xl font-bold text-emerald-400 font-mono-tabular mt-2 mb-1 tracking-tight">
              {components ? (
                <>
                  {components.cachePercent}
                  <span className="text-sm font-semibold ml-0.5 text-emerald-400/80">%</span>
                </>
              ) : (
                '—'
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-400/90 leading-snug mt-1 font-mono-tabular">
            {components
              ? `${MonitorModel.compact(components.cached)} 缓存 / ${MonitorModel.compact(components.output)} 输出`
              : '采集端未提供完整组件读数'}
          </p>
        </section>
      </div>

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

          {trend.length > 0 ? (
            <section className="trend-card glass-panel rounded-3xl p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="trend-selection text-xs text-slate-300 font-mono-tabular" aria-live="polite">
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
                    </span>
                  ) : (
                    <span>Token 用量</span>
                  )}
                </div>
                <span className="text-[11px] font-mono-tabular text-slate-400">
                  合计 {MonitorModel.compact(trendTotalTokens)}
                </span>
              </div>

              <div
                className="flex items-end gap-1.5 h-32 pt-3 pb-1 border-b border-white/8"
                role="group"
                aria-label="每日 Token 用量，轻触柱体查看单日详情"
              >
                {trend.map((row) => {
                  const pct = Math.max(4, (MonitorModel.count(row.tokens) / maxTrendTokens) * 100);
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
                      className="trend-col flex-1 h-full flex flex-col justify-end items-center group focus:outline-none min-h-0"
                    >
                      <div
                        style={{ height: `${pct}%` }}
                        className={`trend-bar w-full rounded-t-md transition-all duration-150 ${
                          isSelected
                            ? 'bg-gradient-to-t from-sky-500/80 to-cyan-300 shadow-[0_0_12px_rgba(56,189,248,0.45)]'
                            : 'bg-gradient-to-t from-sky-500/25 to-sky-400/55 group-hover:from-sky-400/50 group-hover:to-cyan-300/80'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-between text-[11px] font-mono-tabular text-slate-400 pt-2">
                <span>{trend[0].date.slice(5)}</span>
                <span className="text-slate-500 text-[10px]">轻触柱体查看单日详情</span>
                <span>{trend[trend.length - 1].date.slice(5)}</span>
              </div>

              <div className="daily-details mt-3 pt-2.5 border-t border-white/6">
                <button
                  type="button"
                  onClick={() => setShowDailyList((prev) => !prev)}
                  data-daily-toggle="true"
                  aria-expanded={showDailyList}
                  className="w-full min-h-[36px] flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <span>查看每日数值明细 ({trend.length} 天)</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-150 ${
                      showDailyList ? 'rotate-180 text-sky-400' : ''
                    }`}
                  />
                </button>
                {showDailyList && (
                  <div data-daily-values="true" className="mt-2 space-y-1.5 pt-1 max-h-60 overflow-y-auto pr-1">
                    {trend
                      .slice()
                      .reverse()
                      .map((row) => (
                        <div
                          key={row.date}
                          className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] font-mono-tabular"
                        >
                          <span className="text-slate-300">{row.date}</span>
                          <div className="flex items-center gap-2.5">
                            <span className="text-slate-100 font-semibold">
                              {MonitorModel.compact(row.tokens)}
                            </span>
                            <span className="text-slate-400 w-16 text-right">
                              {MonitorModel.money(row.cost)}
                            </span>
                          </div>
                        </div>
                      ))}
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

      <div className="pt-2">
        <div className="flex items-baseline justify-between mb-2.5 px-1">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-sky-400" />
            <span>用量分布</span>
          </h3>
          <span className="text-[11px] font-mono-tabular text-slate-400">TOKENS · COST</span>
        </div>

        <section className="glass-panel rounded-3xl p-4">

          <div className="glass-inset p-1 rounded-2xl flex gap-1 mb-4">
            {(
              [
                ['clients', '工具'],
                ['models', '模型'],
                ['projects', '项目'],
              ] as Array<[BreakdownKind, string]>
            ).map(([kind, label]) => {
              const active = breakdownKind === kind;
              return (
                <button
                  key={kind}
                  data-breakdown={kind}
                  type="button"
                  onClick={() => onBreakdownChange(kind)}
                  aria-pressed={active}
                  className={`flex-1 min-h-[38px] rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-slate-800/95 text-white shadow-sm border border-white/10'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {visibleRows.length > 0 ? (
            <div className="space-y-3.5">
              {visibleRows.map((row) => {
                const pct = totalTokensCount > 0 ? Math.min(100, (row.tokens / totalTokensCount) * 100) : 0;
                const displayLabel =
                  breakdownKind === 'clients' ? providerName(row.label) : row.label;
                const tone =
                  breakdownKind === 'clients' ? clientTone(row.id) : clientTone(undefined);

                return (
                  <div key={row.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-slate-100 truncate">
                          {displayLabel}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                          {pct >= 0.1 ? `${pct.toFixed(1)}%` : '<0.1%'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 shrink-0 font-mono-tabular">
                        <span className="font-semibold text-slate-100">
                          {MonitorModel.compact(row.tokens)}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {MonitorModel.money(row.cost)}
                        </span>
                      </div>
                    </div>

                    <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
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
            <p className="text-center text-xs text-slate-400 py-6">此周期暂无明细</p>
          )}

          {rows.length > visibleRows.length && (
            <p className="mt-4 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-400/20 rounded-xl p-3 leading-relaxed">
              仅列出用量最高的 {visibleRows.length} 项，共 {rows.length} 项；总量保持完整。
            </p>
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
