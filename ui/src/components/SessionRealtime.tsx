import { useEffect, useId, useMemo, useState } from 'react';
import type { MonitorStats } from '../types/monitor';

interface Point {
  start: number;
  end: number;
  tokens: number;
  rate: number;
}
interface Reading {
  state: 'live' | 'idle' | 'waiting' | 'stale' | 'unavailable';
  tokensPerSecond: number | null;
  tokensPerMinute: number | null;
  sampledAt: number | null;
  intervalMs: number | null;
  points: Point[];
}
interface Source {
  deviceId: string;
  hostname: string;
  identity: string;
  at: number;
  outputTokens: number;
  available: boolean;
}
interface RateApi {
  sessionSources(stats: MonitorStats, key: string, now: number): Source[];
  createTracker(): {
    observe(source: Source | null, now: number): Reading;
    read(now?: number): Reading;
    reset(): void;
  };
  chart(points: Point[], now: number): { segments: string[]; peak: number };
}

const rates = (window as typeof window & { TokenMonitorSessionRealtime: RateApi })
  .TokenMonitorSessionRealtime;

const STATE_META: Record<
  Reading['state'],
  { label: string; pillClass: string; dotClass: string }
> = {
  live: {
    label: '实时观测中',
    pillClass:
      'bg-[var(--tm-success-soft-bg)] border-[var(--tm-success-soft-border)] text-[var(--tm-success-text)]',
    dotClass: 'bg-[var(--tm-success)]',
  },
  idle: {
    label: '本次采样无新增输出',
    pillClass:
      'bg-[var(--tm-info-soft-bg)] border-[var(--tm-info-soft-border)] text-[var(--tm-info-text)]',
    dotClass: 'bg-[var(--tm-info)]',
  },
  waiting: {
    label: '等待下一次来源采样',
    pillClass:
      'bg-[var(--tm-warning-soft-bg)] border-[var(--tm-warning-soft-border)] text-[var(--tm-warning-text)]',
    dotClass: 'bg-[var(--tm-warning)] animate-pulse',
  },
  stale: {
    label: '来源尚未更新',
    pillClass:
      'bg-[var(--tm-warning-soft-bg)] border-[var(--tm-warning-soft-border)] text-[var(--tm-warning-text)]',
    dotClass: 'bg-[var(--tm-warning)]',
  },
  unavailable: {
    label: '来源数据不可用',
    pillClass:
      'bg-[var(--tm-bg-control)] border-[var(--tm-border-default)] text-[var(--tm-text-secondary)]',
    dotClass: 'bg-[var(--tm-text-muted)]',
  },
};

const format = (value: number | null) =>
  value === null
    ? '—'
    : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);

function segmentAreaPath(pointsStr: string): string {
  const coords = pointsStr.trim().split(/\s+/).filter(Boolean);
  if (coords.length < 2) return '';
  const firstX = coords[0].split(',')[0];
  const lastX = coords[coords.length - 1].split(',')[0];
  if (!firstX || !lastX) return '';
  return `M${coords[0]} ${coords
    .slice(1)
    .map((pt) => `L${pt}`)
    .join(' ')} L${lastX},72 L${firstX},72 Z`;
}

export function SessionRealtime({
  stats,
  detailKey,
  deviceId,
  available,
  foreground,
}: {
  stats: MonitorStats;
  detailKey: string;
  deviceId: string;
  available: boolean;
  foreground: boolean;
}) {
  const gradientId = useId().replace(/:/g, '');
  const [clock, setClock] = useState(Date.now);
  const [observedAt, setObservedAt] = useState(clock);
  const [selected, setSelected] = useState(deviceId || '');
  const nowMs = Math.max(clock, observedAt);
  const sources = useMemo(
    () => rates.sessionSources(stats, detailKey, nowMs),
    [stats, detailKey, nowMs],
  );
  const owner = selected
    ? sources.find((source) => source.deviceId === selected)
    : sources.find((source) => source.available) || sources[0];
  const target = owner?.deviceId || selected;
  const tracker = useMemo(() => rates.createTracker(), [detailKey, target]);
  const [snapshot, setSnapshot] = useState<{
    tracker: typeof tracker;
    reading: Reading;
  }>(() => ({
    tracker,
    reading: tracker.read(nowMs),
  }));
  const reading = snapshot.tracker === tracker ? snapshot.reading : tracker.read(nowMs);

  useEffect(() => {
    if (!foreground) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [foreground]);

  useEffect(() => {
    if (!foreground) tracker.reset();
    const observedNow = Date.now();
    const currentSources = rates.sessionSources(stats, detailKey, observedNow);
    const resolvedOwner = selected
      ? currentSources.find((source) => source.deviceId === selected)
      : currentSources.find((source) => source.available) || currentSources[0];
    if (resolvedOwner && !selected) {
      setSelected(resolvedOwner.deviceId);
    }
    const targetId = resolvedOwner?.deviceId || selected;
    const observedSource = currentSources.find((source) => source.deviceId === targetId);
    const next = tracker.observe(
      available && foreground ? observedSource || null : null,
      observedNow,
    );
    setObservedAt(observedNow);
    setSnapshot({ tracker, reading: next });
    // Source counters are observed from stats only; the one-second clock merely
    // expires readings and moves the chart. Duplicate source times add no point.
  }, [stats, detailKey, selected, available, foreground, clock, tracker]);

  const drawing = useMemo(() => rates.chart(reading.points, nowMs), [reading.points, nowMs]);
  const stateMeta = STATE_META[reading.state];
  const hasChartData = reading.points.length > 0 && drawing.segments.length > 0;
  const showSourceSelect = sources.length > 1 || (Boolean(selected) && !owner);

  return (
    <div
      className="space-y-3"
      data-session-realtime="true"
      data-realtime-state={reading.state}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-xs font-semibold text-[var(--tm-accent-text)]">实时观测速率</h4>
        <p
          role="status"
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${stateMeta.pillClass}`}
        >
          <i className={`w-1.5 h-1.5 rounded-full shrink-0 ${stateMeta.dotClass}`} aria-hidden="true" />
          <span>{stateMeta.label}</span>
        </p>
      </div>

      {showSourceSelect && (
        <label className="block text-xs text-[var(--tm-text-secondary)] space-y-1.5">
          <span>速率来源设备</span>
          <select
            aria-label="速率来源设备"
            value={target}
            onChange={(event) => setSelected(event.target.value)}
            className="w-full min-h-[44px] px-3 py-2 text-xs glass-select focus:outline-none focus:border-[var(--tm-border-accent)]"
          >
            {selected && !owner && <option value={selected}>{selected}（不可用）</option>}
            {sources.map((source) => (
              <option key={source.deviceId} value={source.deviceId}>
                {source.hostname} · {source.deviceId}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="glass-inset rounded-2xl p-3.5 min-w-0">
          <span className="text-[11px] text-[var(--tm-text-muted)] block">实时输出</span>
          <div className="text-lg font-bold text-[var(--tm-accent-text)] font-mono-tabular mt-1 break-words">
            <span data-rate-output="second">{format(reading.tokensPerSecond)}</span>{' '}
            <span className="text-xs text-[var(--tm-text-muted)] font-normal">tok/s</span>
          </div>
        </div>
        <div className="glass-inset rounded-2xl p-3.5 min-w-0">
          <span className="text-[11px] text-[var(--tm-text-muted)] block">同一采样间隔折算</span>
          <div className="text-lg font-bold text-[var(--tm-success-text)] font-mono-tabular mt-1 break-words">
            <span data-rate-output="minute">{format(reading.tokensPerMinute)}</span>{' '}
            <span className="text-xs text-[var(--tm-text-muted)] font-normal">tok/min</span>
          </div>
        </div>
      </div>

      <div className="glass-inset rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--tm-text-secondary)] flex-wrap">
          <span>最近五分钟 · 输出 tok/s</span>
          {hasChartData && (
            <span className="font-mono-tabular text-[var(--tm-accent-text)] font-medium">
              峰值 {format(drawing.peak)} tok/s
            </span>
          )}
        </div>

        {hasChartData ? (
          <>
            <div className="flex items-stretch gap-2">
              {/* Dedicated Y-axis gutter outside SVG plot so scale labels never collide with curve */}
              <div
                aria-hidden="true"
                className="flex flex-col justify-between text-right text-[11px] font-mono-tabular text-[var(--tm-chart-axis)] shrink-0 min-w-[26px] py-0.5 select-none"
              >
                <span>{drawing.peak > 0 ? format(drawing.peak) : ''}</span>
                <span>0</span>
              </div>
              <div className="flex-1 min-w-0">
                <svg
                  viewBox="0 0 280 76"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="最近五分钟实时输出速率趋势"
                  style={{ color: 'var(--tm-chart-primary)' }}
                  className="w-full h-20 block"
                  data-realtime-chart="true"
                >
                  <defs>
                    <linearGradient id={`rt-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <line
                    x1="0"
                    y1="4"
                    x2="280"
                    y2="4"
                    stroke="var(--tm-chart-grid)"
                    strokeDasharray="3 4"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1="0"
                    y1="38"
                    x2="280"
                    y2="38"
                    stroke="var(--tm-chart-grid)"
                    strokeDasharray="3 4"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1="0"
                    y1="72"
                    x2="280"
                    y2="72"
                    stroke="var(--tm-border-default)"
                    vectorEffect="non-scaling-stroke"
                  />
                  {drawing.segments.map((points, index) => {
                    const area = segmentAreaPath(points);
                    return area ? (
                      <path key={`area-${index}`} d={area} fill={`url(#rt-fill-${gradientId})`} />
                    ) : null;
                  })}
                  {drawing.segments.map((points, index) => (
                    <polyline
                      key={index}
                      points={points}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
              </div>
            </div>
            <div className="flex justify-between text-[11px] text-[var(--tm-text-muted)] tabular-nums pl-[34px]">
              <span>−5 分钟</span>
              <span>现在</span>
            </div>
          </>
        ) : (
          <div
            data-realtime-chart="true"
            role="img"
            aria-label="最近五分钟实时输出速率趋势"
            className="rounded-xl border border-dashed border-[var(--tm-border-default)] bg-[var(--tm-bg-row)] px-3 py-4 text-center"
          >
            <p className="text-xs text-[var(--tm-text-muted)]">获得两个有效读数后开始绘制趋势。</p>
          </div>
        )}

        {reading.sampledAt !== null && (
          <p className="text-[11px] text-[var(--tm-text-muted)] tabular-nums pt-1.5 border-t border-[var(--tm-border-subtle)]">
            来源采样{' '}
            <span className="font-mono-tabular text-[var(--tm-text-secondary)]">
              {new Date(reading.sampledAt).toLocaleTimeString('zh-CN', { hour12: false })}
            </span>
            {' · 间隔 '}
            <span className="font-mono-tabular text-[var(--tm-text-secondary)]">
              {(Number(reading.intervalMs) / 1000).toFixed(1)} 秒
            </span>
          </p>
        )}
      </div>

      <p className="text-[11px] text-[var(--tm-text-muted)] leading-relaxed">
        新增输出 ÷ 来源采样间隔；tok/min 为同一间隔折算。打开后开始监控。
        仅在回复结束时写入的日志会形成批量观测，不代表逐 Token 流速。离线或缺少新读数时不补造趋势。
      </p>
    </div>
  );
}
