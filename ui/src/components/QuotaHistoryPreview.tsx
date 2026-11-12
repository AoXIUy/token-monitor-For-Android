import { useEffect, useId, useState } from 'react';
import { MonitorModel } from '../model/monitorModel';
import type { LimitProvider, QuotaHistoryPayload, QuotaHistoryPoint } from '../types/monitor';
import { formatShortTime } from '../utils/formatters';

interface HistoryModel {
  segments(points: QuotaHistoryPoint[]): QuotaHistoryPoint[][];
}
const historyModel = (window as unknown as { TokenMonitorLimitsHistoryModel: HistoryModel }).TokenMonitorLimitsHistoryModel;

export function QuotaHistoryPreview({ provider, history, fetchedAt, foreground }: {
  provider: LimitProvider; history: QuotaHistoryPayload | null; fetchedAt: number; foreground: boolean;
}) {
  const [selected, setSelected] = useState('');
  const [day, setDay] = useState('');
  const [activePointKey, setActivePointKey] = useState<string>('');
  const gradientId = useId().replace(/:/g, '');
  const key = provider.androidHistoryKey;
  const data = history?.key === key ? history : null;

  useEffect(() => {
    if (key && foreground) window.HubNative?.quotaHistory?.(key);
  }, [key, fetchedAt, foreground]);

  const entry = data?.windows.find(row => row.key === selected) || data?.windows[0];
  const now = data?.now || fetchedAt;
  const bounds = entry ? MonitorModel.quotaTrendBounds(provider, entry.window, now) : null;
  const points = entry && bounds
    ? entry.points.filter(point => point.at >= bounds.start && point.at <= Math.min(bounds.end, now))
    : [];
  const percent = entry?.unit === 'pp';
  const value = (n: number) =>
    percent
      ? `${Number(n.toFixed(2))}%`
      : `${MonitorModel.money(n, entry?.unit)}${entry?.unit.toUpperCase() === 'CREDITS' ? ' 积分' : ''}`;
  const remaining = (point: QuotaHistoryPoint) => (percent ? 100 - point.value : point.value);
  const max = percent ? 100 : Math.max(1, ...points.map(remaining));
  const x = (at: number) => (bounds ? 12 + ((at - bounds.start) / Math.max(1, bounds.end - bounds.start)) * 296 : 12);
  const y = (n: number) => 104 - (Math.max(0, Math.min(max, n)) / max) * 88;
  const segments = historyModel.segments(points);
  const buckets = entry?.distribution.buckets || [];
  const chosenDay = buckets.find(bucket => bucket.key === day) || buckets.at(-1);
  const largestDay = Math.max(1, ...buckets.map(bucket => bucket.value ?? 0));

  const flatPoints = segments.flatMap((segment, segIdx) =>
    segment.map((point, ptIdx) => ({
      id: `${segIdx}-${ptIdx}-${point.at}`,
      point,
      cx: x(point.at),
      cy: y(remaining(point)),
    }))
  );
  const activePoint = flatPoints.find(item => item.id === activePointKey) || flatPoints.at(-1) || null;

  return (
    <div data-quota-history={key || 'preview'} className="mt-3 pt-3 border-t border-white/8 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-200">
          <i aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          <span>本机观测记录</span>
        </span>
        <span className="text-[10px] text-slate-400">打开预览仅读取本地 SQLite</span>
      </div>

      {!key && (
        <p className="text-xs text-slate-400 glass-inset rounded-xl p-3">
          历史从安卓客户端成功读取额度后开始记录。
        </p>
      )}
      {key && !data && (
        <p role="status" className="text-xs text-slate-400 glass-inset rounded-xl p-3">
          正在读取额度历史…
        </p>
      )}
      {data?.error && (
        <p role="alert" className="text-xs text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-xl p-3">
          {data.error}
        </p>
      )}
      {data && !entry && (
        <p className="text-xs text-slate-400 glass-inset rounded-xl p-3">
          暂无可观测的额度窗口；失败或过期读数不会新增记录。
        </p>
      )}

      {entry && bounds && (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="历史额度窗口">
            {data?.windows.map(row => {
              const active = row.key === entry.key;
              return (
                <button
                  key={row.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSelected(row.key);
                    setDay('');
                    setActivePointKey('');
                  }}
                  className={`shrink-0 min-h-[40px] px-3 rounded-xl text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-sky-500/18 border-sky-400/40 text-sky-200 shadow-sm'
                      : 'glass-inset text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {MonitorModel.quota(provider, row.window).label}
                </button>
              );
            })}
          </div>

          <div className="glass-inset rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-300 font-medium">
                {percent ? '剩余额度趋势' : entry.balance ? '余额趋势' : '累计消费趋势'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[10px] text-slate-300">
                <span>{bounds.cycle ? '当前额度周期' : '近 14 天'}</span>
              </span>
            </div>

            {activePoint && (
              <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-xl bg-sky-500/10 border border-sky-400/20 font-mono-tabular">
                <span className="text-slate-300">{formatShortTime(activePoint.point.at)}</span>
                <span className="text-sky-200 font-semibold">{value(remaining(activePoint.point))}</span>
              </div>
            )}

            <svg
              viewBox="0 0 320 120"
              className="w-full h-32 text-sky-400"
              role="img"
              aria-label={`${percent ? '剩余额度' : '额度'}观测趋势${percent && bounds.cycle ? '；虚线为均匀使用参考，不是预测' : ''}`}
            >
              <defs>
                <linearGradient id={`qh-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M12 16H308 M12 60H308 M12 104H308"
                stroke="white"
                strokeOpacity="0.08"
                strokeDasharray="3 5"
                fill="none"
              />
              {percent && bounds.cycle && (
                <path
                  d="M12 16L308 104"
                  stroke="currentColor"
                  strokeOpacity="0.32"
                  strokeDasharray="4 4"
                  fill="none"
                />
              )}
              {segments.map((segment, index) => {
                const pts = segment.map(point => `${x(point.at).toFixed(2)},${y(remaining(point)).toFixed(2)}`);
                const areaPath =
                  segment.length >= 2
                    ? `M${pts[0]} ${pts.slice(1).map(p => `L${p}`).join(' ')} L${x(segment[segment.length - 1].at).toFixed(2)},104 L${x(segment[0].at).toFixed(2)},104 Z`
                    : '';
                return (
                  <g key={index}>
                    {areaPath && <path d={areaPath} fill={`url(#qh-fill-${gradientId})`} />}
                    {segment.length >= 2 && (
                      <polyline
                        points={pts.join(' ')}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {segment.map((point, pIndex) => {
                      const ptId = `${index}-${pIndex}-${point.at}`;
                      const cx = x(point.at);
                      const cy = y(remaining(point));
                      const isActive = activePoint?.id === ptId;
                      return (
                        <g
                          key={pIndex}
                          onClick={() => setActivePointKey(ptId)}
                          className="cursor-pointer"
                        >
                          <circle cx={cx} cy={cy} r="9" fill="transparent" />
                          {isActive && <circle cx={cx} cy={cy} r="5" fill="currentColor" fillOpacity="0.24" />}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isActive ? '3.2' : '2.2'}
                            fill="currentColor"
                            className="text-sky-300"
                          >
                            <title>{formatShortTime(point.at)}：{value(remaining(point))}</title>
                          </circle>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
              {percent && (
                <>
                  <text x="12" y="12" fontSize="9" fill="currentColor" className="text-slate-500">100%</text>
                  <text x="12" y="117" fontSize="9" fill="currentColor" className="text-slate-500">0%</text>
                </>
              )}
            </svg>

            {!points.length && (
              <p className="text-xs text-slate-400">当前范围暂无观测，未读取的区间保持空白。</p>
            )}
            <div className="flex justify-between text-[10px] text-slate-400 font-mono-tabular">
              <span>{formatShortTime(bounds.start)}</span>
              <span>{formatShortTime(bounds.end)}</span>
            </div>
          </div>

          <div className="glass-inset rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-200 font-medium">近 14 天观测净变化</span>
              <span className="text-[10px] text-slate-400">轻触日期查看</span>
            </div>
            <div className="grid grid-cols-14 gap-1 h-24 items-end" role="group" aria-label="近14天额度净变化">
              {buckets.map(bucket => {
                const isSelected = chosenDay?.key === bucket.key;
                const barHeight = bucket.value === null ? 3 : Math.max(4, (bucket.value / largestDay) * 68);
                return (
                  <button
                    type="button"
                    key={bucket.key}
                    onClick={() => setDay(bucket.key)}
                    onFocus={() => setDay(bucket.key)}
                    aria-label={`${bucket.key}：${bucket.value === null ? '数据不足' : value(bucket.value)}${bucket.uncertain ? '，观测不完整' : ''}`}
                    aria-pressed={isSelected}
                    className={`h-full min-w-0 rounded-md flex flex-col justify-end items-center gap-1 pb-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-sky-300 ${
                      isSelected ? 'bg-sky-400/15 ring-1 ring-sky-400/35' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <span
                      className={`w-full rounded-t transition-all ${
                        bucket.value === null
                          ? 'bg-white/10'
                          : bucket.uncertain
                          ? 'bg-sky-400/45 border border-dashed border-sky-300/40'
                          : isSelected
                          ? 'bg-sky-300'
                          : 'bg-sky-400/75'
                      }`}
                      style={{ height: barHeight }}
                    />
                    <span className={`text-[8px] font-mono-tabular ${isSelected ? 'text-sky-200 font-semibold' : 'text-slate-500'}`}>
                      {bucket.key.slice(-2)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p aria-live="polite" className="text-xs text-sky-200 min-h-[2rem] leading-relaxed font-mono-tabular">
              {chosenDay?.key} · {chosenDay?.value == null ? '数据不足' : value(chosenDay.value)}
              {chosenDay?.uncertain && ' · 观测不完整'}
            </p>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              仅反映已观测的净变化，不代表完整消费；未观测日期留空，重置与跨日变化不分摊。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
