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

const PLOT_LEFT = 12;
const PLOT_RIGHT = 308;
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 104;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
const PLOT_MID = PLOT_TOP + PLOT_HEIGHT / 2;

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
  const canLoadNative = typeof window !== 'undefined' && Boolean(window.HubNative?.quotaHistory);

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
  const unitCode = typeof entry?.unit === 'string' ? entry.unit : '';
  const value = (n: number) =>
    percent
      ? `${Number(n.toFixed(2))}%`
      : `${MonitorModel.money(n, unitCode || undefined)}${
          unitCode.toUpperCase() === 'CREDITS' ? ' 积分' : ''
        }`;
  const remaining = (point: QuotaHistoryPoint) => (percent ? 100 - point.value : point.value);
  const peak = points.length > 0 ? Math.max(0, ...points.map(remaining)) : 0;
  const scaleMax = percent ? 100 : peak > 0 ? peak : 1;
  const x = (at: number) =>
    bounds ? PLOT_LEFT + ((at - bounds.start) / Math.max(1, bounds.end - bounds.start)) * PLOT_WIDTH : PLOT_LEFT;
  const y = (n: number) => PLOT_BOTTOM - (Math.max(0, Math.min(scaleMax, n)) / scaleMax) * PLOT_HEIGHT;
  const segments = historyModel.segments(points);
  const buckets = entry?.distribution.buckets || [];
  const chosenDay = buckets.find((bucket) => bucket.key === day) || buckets.at(-1);
  const dayPeak = buckets.reduce(
    (acc, bucket) => (bucket.value !== null && bucket.value > acc ? bucket.value : acc),
    0,
  );
  const largestDay = dayPeak > 0 ? dayPeak : 1;

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
  const sortedByX = flatPoints.slice().sort((a, b) => a.cx - b.cx);
  const hitStrips = new Map<string, { x: number; width: number }>();
  sortedByX.forEach((item, idx) => {
    const leftBound = idx === 0 ? 0 : (sortedByX[idx - 1].cx + item.cx) / 2;
    const rightBound = idx === sortedByX.length - 1 ? 320 : (item.cx + sortedByX[idx + 1].cx) / 2;
    const rawWidth = Math.max(0, rightBound - leftBound);
    const width = Math.max(14, rawWidth);
    const stripX =
      rawWidth >= 14
        ? leftBound
        : Math.max(0, Math.min(320 - width, item.cx - width / 2));
    hitStrips.set(item.id, { x: stripX, width });
  });

  const activePoint =
    flatPoints.find((item) => item.id === activePointKey) || flatPoints.at(-1) || null;

  return (
    <div
      data-quota-history={key || 'preview'}
      className="mt-3 pt-3 border-t border-[var(--tm-border-subtle)] space-y-3"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--tm-accent-text)]">
          <i aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[var(--tm-accent)]" />
          <span>本机观测记录</span>
        </span>
        <span className="text-[11px] text-[var(--tm-text-muted)]">本机缓存历史 · 按需读取</span>
      </div>

      {!key && (
        <p className="text-xs text-[var(--tm-text-muted)] glass-inset rounded-xl p-3">
          历史从安卓客户端成功读取额度后开始记录。
        </p>
      )}
      {key && !data && canLoadNative && (
        <p role="status" className="text-xs text-[var(--tm-text-muted)] glass-inset rounded-xl p-3">
          正在读取额度历史…
        </p>
      )}
      {key && !data && !canLoadNative && (
        <p className="text-xs text-[var(--tm-text-muted)] glass-inset rounded-xl p-3">
          当前预览模式暂无此账户的本机历史记录；在 Android 客户端运行后会自动记录。
        </p>
      )}
      {data?.error && (
        <InlineAlert tone="amber" role="alert">
          {data.error}
        </InlineAlert>
      )}
      {data && !entry && (
        <p className="text-xs text-[var(--tm-text-muted)] glass-inset rounded-xl p-3">
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
                      ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)] shadow-sm'
                      : 'glass-inset text-[var(--tm-text-secondary)] hover:border-[var(--tm-border-strong)]'
                  }`}
                >
                  {MonitorModel.quota(provider, row.window).label}
                </button>
              );
            })}
          </div>

          <div className="glass-inset rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[var(--tm-text-primary)] font-medium">
                {percent ? '剩余额度趋势' : entry.balance ? '余额趋势' : '累计消费趋势'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] text-[11px] text-[var(--tm-text-secondary)]">
                <span>{bounds.cycle ? '当前额度周期' : '近 14 天'}</span>
              </span>
            </div>

            {activePoint && (
              <div className="flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-xl bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] font-mono-tabular">
                <span className="text-[var(--tm-text-secondary)]">
                  {formatShortTime(activePoint.point.at)}
                </span>
                <span className="text-[var(--tm-accent-text)] font-semibold">
                  {value(remaining(activePoint.point))}
                </span>
              </div>
            )}

            <svg
              viewBox="0 0 320 132"
              className="w-full h-36 text-[var(--tm-chart-primary)] overflow-visible"
              role="img"
              aria-label={`${percent ? '剩余额度' : '额度'}观测趋势${
                percent && bounds.cycle ? '；虚线为均匀使用参考，不是预测' : ''
              }`}
            >
              <defs>
                <linearGradient id={`qh-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={`M${PLOT_LEFT} ${PLOT_TOP}H${PLOT_RIGHT} M${PLOT_LEFT} ${PLOT_MID}H${PLOT_RIGHT} M${PLOT_LEFT} ${PLOT_BOTTOM}H${PLOT_RIGHT}`}
                stroke="var(--tm-chart-grid)"
                strokeDasharray="3 5"
                fill="none"
              />
              {percent && bounds.cycle && (
                <path
                  d={`M${PLOT_LEFT} ${PLOT_TOP}L${PLOT_RIGHT} ${PLOT_BOTTOM}`}
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
                        .join(' ')} L${x(segment[segment.length - 1].at).toFixed(2)},${PLOT_BOTTOM} L${x(
                        segment[0].at,
                      ).toFixed(2)},${PLOT_BOTTOM} Z`
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
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {segment.map((point, pIndex) => {
                      const ptId = `${index}-${pIndex}-${point.at}`;
                      const cx = x(point.at);
                      const cy = y(remaining(point));
                      const isActive = activePoint?.id === ptId;
                      const strip = hitStrips.get(ptId);
                      return (
                        <g
                          key={ptId}
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
                          {strip && (
                            <rect
                              x={strip.x}
                              y={PLOT_TOP - 8}
                              width={strip.width}
                              height={PLOT_HEIGHT + 16}
                              fill="transparent"
                            />
                          )}
                          <circle
                            className="qh-focus-ring opacity-0 transition-opacity"
                            cx={cx}
                            cy={cy}
                            r="7"
                            fill="none"
                            stroke="var(--tm-focus-ring)"
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
              <text
                x={PLOT_LEFT}
                y="14"
                fontSize="9.5"
                fontFamily="var(--font-mono)"
                fill="var(--tm-chart-axis)"
              >
                {percent ? '100%' : points.length > 0 ? value(peak) : value(0)}
              </text>
              <text
                x={PLOT_LEFT}
                y="124"
                fontSize="9.5"
                fontFamily="var(--font-mono)"
                fill="var(--tm-chart-axis)"
              >
                {percent ? '0%' : value(0)}
              </text>
            </svg>

            {!points.length && (
              <p className="text-xs text-[var(--tm-text-muted)]">
                当前范围暂无观测，未读取的区间保持空白。
              </p>
            )}
            <div className="flex justify-between text-[11px] text-[var(--tm-text-muted)] font-mono-tabular">
              <span>{formatShortTime(bounds.start)}</span>
              <span>{formatShortTime(bounds.end)}</span>
            </div>
          </div>

          <div className="glass-inset rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[var(--tm-text-primary)] font-medium">近 14 天观测净变化</span>
              <span className="text-[11px] text-[var(--tm-text-muted)]">左右滑动 · 轻触日期</span>
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
                  bucket.value === null
                    ? 4
                    : bucket.value <= 0
                      ? 2
                      : Math.max(6, (bucket.value / largestDay) * 68);
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
                    className={`shrink-0 min-w-[36px] min-h-[44px] flex-1 h-full rounded-lg px-1 pb-1 flex flex-col justify-end items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-[var(--tm-focus-ring)] ${
                      isSelected
                        ? 'bg-[var(--tm-accent-soft-bg)] ring-1 ring-[var(--tm-accent-soft-border)]'
                        : 'hover:bg-[var(--tm-bg-row-hover)] active:bg-[var(--tm-bg-control-hover)]'
                    }`}
                  >
                    <span
                      className={`w-full max-w-[16px] rounded-t transition-all ${
                        bucket.value === null || bucket.value <= 0
                          ? 'bg-[var(--tm-track-bg)]'
                          : bucket.uncertain
                            ? 'bg-[var(--tm-accent-soft-bg)] border border-dashed border-[var(--tm-accent-soft-border)]'
                            : isSelected
                              ? 'bg-[var(--tm-chart-primary)]'
                              : 'bg-[var(--tm-chart-primary)] opacity-75'
                      }`}
                      style={{ height: barHeight }}
                    />
                    <span
                      className={`text-[11px] font-mono-tabular leading-none ${
                        isSelected
                          ? 'text-[var(--tm-accent-text)] font-semibold'
                          : 'text-[var(--tm-text-muted)]'
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
              className="text-xs text-[var(--tm-accent-text)] min-h-[1.75rem] leading-relaxed tabular-nums"
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

            <p className="text-[11px] text-[var(--tm-text-muted)] leading-relaxed">
              仅反映已观测的净变化，不代表完整消费；未观测日期留空，重置与跨日变化不分摊。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
