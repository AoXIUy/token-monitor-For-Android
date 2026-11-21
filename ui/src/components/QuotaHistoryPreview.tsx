import { useEffect, useId, useRef, useState } from 'react';
import { MonitorModel } from '../model/monitorModel';
import type { LimitProvider, QuotaHistoryPayload, QuotaHistoryPoint } from '../types/monitor';
import { formatShortTime } from '../utils/formatters';
import { InlineAlert } from './ui/Primitives';

interface HistoryModel {
  segments(points: QuotaHistoryPoint[]): QuotaHistoryPoint[][];
}
const historyModel = (
  window as unknown as { TokenMonitorLimitsHistoryModel: HistoryModel }
).TokenMonitorLimitsHistoryModel;

export function QuotaHistoryPreview({
  provider,
  history,
  fetchedAt,
  foreground,
}: {
  provider: LimitProvider;
  history: QuotaHistoryPayload | null;
  fetchedAt: number;
  foreground: boolean;
}) {
  const [selected, setSelected] = useState('');
  const [day, setDay] = useState('');
  const [activePointKey, setActivePointKey] = useState<string>('');
  const gradientId = useId().replace(/:/g, '');
  const barStripRef = useRef<HTMLDivElement>(null);
  const key = provider.androidHistoryKey;
  const data = history?.key === key ? history : null;

  useEffect(() => {
    if (key && foreground) window.HubNative?.quotaHistory?.(key);
  }, [key, fetchedAt, foreground]);

  const entry = data?.windows.find((row) => row.key === selected) || data?.windows[0];
  const now = data?.now || fetchedAt;
  const bounds = entry ? MonitorModel.quotaTrendBounds(provider, entry.window, now) : null;
  const points =
    entry && bounds
      ? entry.points.filter((point) => point.at >= bounds.start && point.at <= Math.min(bounds.end, now))
      : [];
  const percent = entry?.unit === 'pp';
  const value = (n: number) =>
    percent
      ? `${Number(n.toFixed(2))}%`
      : `${MonitorModel.money(n, entry?.unit)}${
          entry?.unit.toUpperCase() === 'CREDITS' ? ' 积分' : ''
        }`;
  const remaining = (point: QuotaHistoryPoint) => (percent ? 100 - point.value : point.value);
  const max = percent ? 100 : Math.max(1, ...points.map(remaining));
  const x = (at: number) =>
    bounds ? 12 + ((at - bounds.start) / Math.max(1, bounds.end - bounds.start)) * 296 : 12;
  const y = (n: number) => 104 - (Math.max(0, Math.min(max, n)) / max) * 88;
  const segments = historyModel.segments(points);
  const buckets = entry?.distribution.buckets || [];
  const chosenDay = buckets.find((bucket) => bucket.key === day) || buckets.at(-1);
  const largestDay = Math.max(1, ...buckets.map((bucket) => bucket.value ?? 0));

  useEffect(() => {
    const strip = barStripRef.current;
    if (strip) {
      strip.scrollLeft = strip.scrollWidth;
    }
  }, [entry?.key, buckets.length]);

  const flatPoints = segments.flatMap((segment, segIdx) =>
    segment.map((point, ptIdx) => ({
      id: `${segIdx}-${ptIdx}-${point.at}`,
      point,
      cx: x(point.at),
      cy: y(remaining(point)),
    })),
  );
  const activePoint =
    flatPoints.find((item) => item.id === activePointKey) || flatPoints.at(-1) || null;

  return (
    <div
      data-quota-history={key || 'preview'}
      className="mt-3 pt-3 border-t border-white/8 space-y-3"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-200">
          <i aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          <span>本机观测记录</span>
        </span>
        <span className="text-[11px] text-slate-400">本机缓存历史 · 按需读取</span>
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
        <InlineAlert tone="amber" role="alert">
          {data.error}
        </InlineAlert>
      )}
      {data && !entry && (
        <p className="text-xs text-slate-400 glass-inset rounded-xl p-3">
          暂无可观测的额度窗口；失败或过期读数不会新增记录。
        </p>
      )}

      {entry && bounds && (
        <>
          <div
            className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
            role="group"
            aria-label="历史额度窗口"
          >
            {data?.windows.map((row) => {
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
                  className={`shrink-0 min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] whitespace-nowrap ${
                    active
                      ? 'bg-sky-500/18 border-sky-400/40 text-sky-100 shadow-sm'
                      : 'glass-inset text-slate-300 hover:border-white/20'
                  }`}
                >
                  {MonitorModel.quota(provider, row.window).label}
                </button>
              );
            })}
          </div>

          <div className="glass-inset rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-200 font-medium">
                {percent ? '剩余额度趋势' : entry.balance ? '余额趋势' : '累计消费趋势'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-[11px] text-slate-300">
                <span>{bounds.cycle ? '当前额度周期' : '近 14 天'}</span>
              </span>
            </div>

            {activePoint && (
              <div className="flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-400/25 font-mono-tabular">
                <span className="text-slate-300">{formatShortTime(activePoint.point.at)}</span>
                <span className="text-sky-200 font-semibold">
                  {value(remaining(activePoint.point))}
                </span>
              </div>
            )}

            <svg
              viewBox="0 0 320 124"
              className="w-full h-32 text-sky-400"
              role="img"
              aria-label={`${percent ? '剩余额度' : '额度'}观测趋势${
                percent && bounds.cycle ? '；虚线为均匀使用参考，不是预测' : ''
              }`}
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
                strokeOpacity="0.09"
                strokeDasharray="3 5"
                fill="none"
              />
              {percent && bounds.cycle && (
                <path
                  d="M12 16L308 104"
                  stroke="currentColor"
                  strokeOpacity="0.34"
                  strokeDasharray="4 4"
                  fill="none"
                />
              )}
              {segments.map((segment, index) => {
                const pts = segment.map(
                  (point) => `${x(point.at).toFixed(2)},${y(remaining(point)).toFixed(2)}`,
                );
                const areaPath =
                  segment.length >= 2
                    ? `M${pts[0]} ${pts
                        .slice(1)
                        .map((p) => `L${p}`)
                        .join(' ')} L${x(segment[segment.length - 1].at).toFixed(2)},104 L${x(
                        segment[0].at,
                      ).toFixed(2)},104 Z`
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
                          role="button"
                          tabIndex={0}
                          aria-label={`${formatShortTime(point.at)}：${value(remaining(point))}`}
                          aria-pressed={isActive}
                          onClick={() => setActivePointKey(ptId)}
                          onFocus={() => setActivePointKey(ptId)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setActivePointKey(ptId);
                            }
                          }}
                          className="cursor-pointer focus:outline-none [&:focus-visible_.qh-focus-ring]:opacity-100"
                        >
                          <circle cx={cx} cy={cy} r="13" fill="transparent" />
                          <circle
                            className="qh-focus-ring opacity-0 transition-opacity"
                            cx={cx}
                            cy={cy}
                            r="7"
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth="1.8"
                          />
                          {isActive && (
                            <circle cx={cx} cy={cy} r="5.5" fill="currentColor" fillOpacity="0.24" />
                          )}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isActive ? '3.4' : '2.3'}
                            fill="currentColor"
                            className="text-sky-300"
                          >
                            <title>
                              {formatShortTime(point.at)}：{value(remaining(point))}
                            </title>
                          </circle>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
              <text x="12" y="12" fontSize="10" fill="currentColor" className="text-slate-400">
                {percent ? '100%' : value(max)}
              </text>
              <text x="12" y="119" fontSize="10" fill="currentColor" className="text-slate-400">
                {percent ? '0%' : value(0)}
              </text>
            </svg>

            {!points.length && (
              <p className="text-xs text-slate-400">当前范围暂无观测，未读取的区间保持空白。</p>
            )}
            <div className="flex justify-between text-[11px] text-slate-400 font-mono-tabular">
              <span>{formatShortTime(bounds.start)}</span>
              <span>{formatShortTime(bounds.end)}</span>
            </div>
          </div>

          <div className="glass-inset rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-200 font-medium">近 14 天观测净变化</span>
              <span className="text-[11px] text-slate-400">左右滑动 · 轻触日期</span>
            </div>

            <div
              ref={barStripRef}
              className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 h-28 items-end"
              role="group"
              aria-label="近14天额度净变化"
            >
              {buckets.map((bucket) => {
                const isSelected = chosenDay?.key === bucket.key;
                const barHeight =
                  bucket.value === null ? 4 : Math.max(6, (bucket.value / largestDay) * 72);
                return (
                  <button
                    type="button"
                    key={bucket.key}
                    onClick={() => setDay(bucket.key)}
                    onFocus={() => setDay(bucket.key)}
                    aria-label={`${bucket.key}：${
                      bucket.value === null ? '数据不足' : value(bucket.value)
                    }${bucket.uncertain ? '，观测不完整' : ''}`}
                    aria-pressed={isSelected}
                    className={`shrink-0 min-w-[30px] flex-1 h-full rounded-lg px-1 pb-1 flex flex-col justify-end items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-sky-300 ${
                      isSelected
                        ? 'bg-sky-400/18 ring-1 ring-sky-400/40'
                        : 'hover:bg-white/[0.05] active:bg-white/[0.08]'
                    }`}
                  >
                    <span
                      className={`w-full max-w-[16px] rounded-t transition-all ${
                        bucket.value === null
                          ? 'bg-white/12'
                          : bucket.uncertain
                          ? 'bg-sky-400/45 border border-dashed border-sky-300/45'
                          : isSelected
                          ? 'bg-sky-300'
                          : 'bg-sky-400/80'
                      }`}
                      style={{ height: barHeight }}
                    />
                    <span
                      className={`text-[11px] font-mono-tabular leading-none ${
                        isSelected ? 'text-sky-200 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {bucket.key.slice(-2)}
                    </span>
                  </button>
                );
              })}
            </div>

            <p
              aria-live="polite"
              className="text-xs text-sky-200 min-h-[1.75rem] leading-relaxed tabular-nums"
            >
              {chosenDay ? (
                <>
                  <span className="font-mono-tabular">{chosenDay.key}</span>
                  {' · '}
                  {chosenDay.value == null ? '数据不足' : value(chosenDay.value)}
                  {chosenDay.uncertain && ' · 观测不完整'}
                </>
              ) : (
                '暂无可展示的每日净变化'
              )}
            </p>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              仅反映已观测的净变化，不代表完整消费；未观测日期留空，重置与跨日变化不分摊。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
