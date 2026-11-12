import { useEffect, useMemo, useState } from 'react';
import type { MonitorStats } from '../types/monitor';

interface Point { start: number; end: number; tokens: number; rate: number }
interface Reading {
  state: 'live' | 'idle' | 'waiting' | 'stale' | 'unavailable';
  tokensPerSecond: number | null;
  tokensPerMinute: number | null;
  sampledAt: number | null;
  intervalMs: number | null;
  points: Point[];
}
interface Source { deviceId: string; hostname: string; identity: string; at: number; outputTokens: number; available: boolean }
interface RateApi {
  sessionSources(stats: MonitorStats, key: string, now: number): Source[];
  createTracker(): { observe(source: Source | null, now: number): Reading; read(now?: number): Reading; reset(): void };
  chart(points: Point[], now: number): { segments: string[]; peak: number };
}
const rates = (window as typeof window & { TokenMonitorSessionRealtime: RateApi }).TokenMonitorSessionRealtime;
const labels: Record<Reading['state'], string> = {
  live: '实时观测中', idle: '本次采样无新增输出', waiting: '等待下一次来源采样',
  stale: '来源尚未更新', unavailable: '来源数据不可用',
};
const format = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);

export function SessionRealtime({ stats, detailKey, deviceId, available, foreground }: {
  stats: MonitorStats; detailKey: string; deviceId: string; available: boolean; foreground: boolean;
}) {
  const [clock, setClock] = useState(Date.now);
  const [selected, setSelected] = useState(deviceId || '');
  const sources = rates.sessionSources(stats, detailKey, Date.now());
  const owner = selected ? sources.find(source => source.deviceId === selected)
    : sources.find(source => source.available) || sources[0];
  const target = owner?.deviceId || selected;
  const tracker = useMemo(() => rates.createTracker(), [detailKey, target]);
  const [snapshot, setSnapshot] = useState<{ tracker: typeof tracker; reading: Reading }>(() => ({ tracker, reading: tracker.read(clock) }));
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
    const observedSource = rates.sessionSources(stats, detailKey, observedNow).find(source => source.deviceId === target);
    const next = tracker.observe(available && foreground ? observedSource || null : null, observedNow);
    setSnapshot({ tracker, reading: next });
    // Source counters are observed from stats only; the one-second clock merely
    // expires readings and moves the chart. Duplicate source times add no point.
  }, [stats, detailKey, target, selected, available, foreground, clock, tracker]);

  const drawing = rates.chart(reading.points, Date.now());
  return (
    <div className="space-y-3 mb-4" data-session-realtime="true" data-realtime-state={reading.state}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-xs font-semibold text-sky-200">实时观测速率</h4>
        <p role="status" className="text-[11px] text-slate-400">{labels[reading.state]}</p>
      </div>
      {(sources.length > 1 || !owner) && (
        <label className="block text-xs text-slate-400">
          速率来源设备
          <select aria-label="速率来源设备" value={target} onChange={event => setSelected(event.target.value)}
            className="w-full min-h-[44px] mt-1 px-3 rounded-xl bg-[#111b25] text-slate-200 border border-white/10">
            {selected && !owner && <option value={selected}>{selected}（不可用）</option>}
            {sources.map(source => <option key={source.deviceId} value={source.deviceId}>{source.hostname} · {source.deviceId}</option>)}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-inset rounded-2xl p-3.5 min-w-0">
          <span className="text-[11px] text-slate-400">实时输出</span>
          <div className="text-lg font-bold text-sky-300 font-mono-tabular mt-1 break-words">
            <span data-rate-output="second">{format(reading.tokensPerSecond)}</span> <small className="text-xs font-normal">tok/s</small>
          </div>
        </div>
        <div className="glass-inset rounded-2xl p-3.5 min-w-0">
          <span className="text-[11px] text-slate-400">同一采样间隔折算</span>
          <div className="text-lg font-bold text-emerald-300 font-mono-tabular mt-1 break-words">
            <span data-rate-output="minute">{format(reading.tokensPerMinute)}</span> <small className="text-xs font-normal">tok/min</small>
          </div>
        </div>
      </div>
      <div className="glass-inset rounded-2xl p-3.5">
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>最近五分钟 · 输出 tok/s</span>
          {reading.points.length > 0 && <span>峰值 {format(drawing.peak)}</span>}
        </div>
        <svg viewBox="0 0 280 76" preserveAspectRatio="none" role="img" aria-label="最近五分钟实时输出速率趋势"
          className="w-full h-20 text-sky-300 border-b border-white/10 mt-2" data-realtime-chart="true">
          {drawing.segments.map((points, index) => <polyline key={index} points={points} fill="none"
            stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
        </svg>
        <div className="flex justify-between text-[10px] text-slate-500 mt-1"><span>−5 分钟</span><span>现在</span></div>
        {!reading.points.length && <p className="text-[11px] text-slate-500 mt-2">获得两个有效读数后开始绘制趋势。</p>}
        {reading.sampledAt !== null && <p className="text-[10px] text-slate-500 mt-2">
          来源采样 {new Date(reading.sampledAt).toLocaleTimeString()} · 间隔 {Number(reading.intervalMs) / 1000} 秒
        </p>}
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        新增输出 ÷ 来源采样间隔；tok/min 为同一间隔折算。打开后开始监控。
        仅在回复结束时写入的日志会形成批量观测，不代表逐 Token 流速。离线或缺少新读数时不补造趋势。
      </p>
    </div>
  );
}
