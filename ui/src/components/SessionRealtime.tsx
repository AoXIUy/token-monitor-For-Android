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
    pillClass: 'bg-emerald-500/14 border-emerald-400/30 text-emerald-200',
    dotClass: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]',
  },
  idle: {
    label: '本次采样无新增输出',
    pillClass: 'bg-sky-500/10 border-sky-400/25 text-sky-200',
    dotClass: 'bg-sky-400',
  },
  waiting: {
    label: '等待下一次来源采样',
    pillClass: 'bg-amber-500/10 border-amber-400/25 text-amber-200',
    dotClass: 'bg-amber-400 animate-pulse',
  },
  stale: {
    label: '来源尚未更新',
    pillClass: 'bg-amber-500/12 border-amber-400/30 text-amber-200',
    dotClass: 'bg-amber-400',
  },
  unavailable: {
    label: '来源数据不可用',
    pillClass: 'bg-white/[0.05] border-white/10 text-slate-300',
    dotClass: 'bg-slate-400',
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
  const [selected, setSelected] = useState(deviceId || '');
  const sources = rates.sessionSources(stats, detailKey, Date.now());
  const owner = selected
    ? sources.find((source) => source.deviceId === selected)
    : sources.find((source) => source.available) || sources[0];
  const target = owner?.deviceId || selected;
  const tracker = useMemo(() => rates.createTracker(), [detailKey, target]);
  const [snapshot, setSnapshot] = useState<{ tracker: typeof tracker; reading: Reading }>(() => ({
    tracker,
    reading: tracker.read(clock),
  }));
  const reading = snapshot.tracker === tracker ? snapshot.reading : tracker.read(clock);

  useEffect(() => {
    if (!foreground) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [foreground]);

  useEffect(() => {
    if (owner && !selected) setSelected(owner.deviceId);
    if (!foreground) tracker.reset();
    const observedNow = Date.now();
    const observedSource = rates
      .sessionSources(stats, detailKey, observedNow)
      .find((source) => source.deviceId === target);
    const next = tracker.observe(
      available && foreground ? observedSource || null : null,
      observedNow,
    );
    setSnapshot({ tracker, reading: next });
    // Source counters are observed from stats only; the one-second clock merely
    // expires readings and moves the chart. Duplicate source times add no point.
  }, [stats, detailKey, target, selected, available, foreground, clock, tracker]);

  const drawing = rates.chart(reading.points, Date.now());
  const stateMeta = STATE_META[reading.state];
  const hasChartData = reading.points.length > 0 && drawing.segments.length > 0;

  return (
    <div
      className="space-y-3"
      data-session-realtime="true"
      data-realtime-state={reading.state}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-xs font-semibold text-sky-200">实时观测速率</h4>
        <p
          role="status"
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${stateMeta.pillClass}`}
        >
          <i className={`w-1.5 h-1.5 rounded-full shrink-0 ${stateMeta.dotClass}`} aria-hidden="true" />
          <span>{stateMeta.label}</span>
        </p>
      </div>

      {(sources.length > 1 || !owner) && (
        <label className="block text-xs text-slate-300 space-y-1.5">
          <span>速率来源设备</span>
          <select
            aria-label="速率来源设备"
            value={target}
            onChange={(event) => setSelected(event.target.value)}
            className="w-full min-h-[44px] px-3 py-2 text-xs glass-select focus:outline-none focus:border-sky-400/60"
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
          <span className="text-[11px] text-slate-400 block">实时输出</span>
          <div className="text-lg font-bold text-sky-300 font-mono-tabular mt-1 break-words">
            <span data-rate-output="second">{format(reading.tokensPerSecond)}</span>{' '}
            <span className="text-xs text-slate-400 font-normal">tok/s</span>
          </div>
        </div>
        <div className="glass-inset rounded-2xl p-3.5 min-w-0">
          <span className="text-[11px] text-slate-400 block">同一采样间隔折算</span>
          <div className="text-lg font-bold text-emerald-300 font-mono-tabular mt-1 break-words">
            <span data-rate-output="minute">{format(reading.tokensPerMinute)}</span>{' '}
            <span className="text-xs text-slate-400 font-normal">tok/min</span>
          </div>
        </div>
      </div>

      <div className="glass-inset rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300 flex-wrap">
          <span>最近五分钟 · 输出 tok/s</span>
          {hasChartData && (
            <span className="font-mono-tabular text-sky-200">
              峰值 {format(drawing.peak)} tok/s
            </span>
          )}
        </div>

        {hasChartData ? (
          <>
            <div className="relative">
              <svg
                viewBox="0 0 280 76"
                preserveAspectRatio="none"
                role="img"
                aria-label="最近五分钟实时输出速率趋势"
                className="w-full h-20 text-sky-300"
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
                  stroke="white"
                  strokeOpacity="0.08"
                  strokeDasharray="3 4"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1="0"
                  y1="38"
                  x2="280"
                  y2="38"
                  stroke="white"
                  strokeOpacity="0.08"
                  strokeDasharray="3 4"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1="0"
                  y1="72"
                  x2="280"
                  y2="72"
                  stroke="white"
                  strokeOpacity="0.14"
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
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 flex flex-col justify-between text-[11px] font-mono-tabular text-slate-400"
              >
                <span>{format(drawing.peak)}</span>
                <span>0</span>
              </div>
            </div>
            <div className="flex justify-between text-[11px] text-slate-400 tabular-nums">
              <span>−5 分钟</span>
              <span>现在</span>
            </div>
          </>
        ) : (
          <div
            data-realtime-chart="true"
            role="img"
            aria-label="最近五分钟实时输出速率趋势"
            className="rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-3 py-4 text-center"
          >
            <p className="text-xs text-slate-400">获得两个有效读数后开始绘制趋势。</p>
          </div>
        )}

        {reading.sampledAt !== null && (
          <p className="text-[11px] text-slate-400 tabular-nums pt-1 border-t border-white/[0.06]">
            来源采样{' '}
            <span className="font-mono-tabular text-slate-300">
              {new Date(reading.sampledAt).toLocaleTimeString('zh-CN', { hour12: false })}
            </span>
            {' · 间隔 '}
            <span className="font-mono-tabular text-slate-300">
              {(Number(reading.intervalMs) / 1000).toFixed(1)} 秒
            </span>
          </p>
        )}
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        新增输出 ÷ 来源采样间隔；tok/min 为同一间隔折算。打开后开始监控。
        仅在回复结束时写入的日志会形成批量观测，不代表逐 Token 流速。离线或缺少新读数时不补造趋势。
      </p>
    </div>
  );
}
