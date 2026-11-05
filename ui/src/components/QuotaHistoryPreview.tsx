import { useEffect, useState } from 'react';
import { MonitorModel } from '../model/monitorModel';
import type { LimitProvider, QuotaHistoryPayload, QuotaHistoryPoint, QuotaWindow } from '../types/monitor';
import { formatShortTime } from '../utils/formatters';

interface HistoryModel {
  trendBounds(window: QuotaWindow, now: number, provider: string): { start: number; end: number; cycle: boolean };
  segments(points: QuotaHistoryPoint[]): QuotaHistoryPoint[][];
}
const historyModel = (window as unknown as { TokenMonitorLimitsHistoryModel: HistoryModel }).TokenMonitorLimitsHistoryModel;

export function QuotaHistoryPreview({ provider, history, fetchedAt, foreground }: {
  provider: LimitProvider; history: QuotaHistoryPayload | null; fetchedAt: number; foreground: boolean;
}) {
  const [selected, setSelected] = useState('');
  const [day, setDay] = useState('');
  const key = provider.androidHistoryKey;
  const data = history?.key === key ? history : null;
  useEffect(() => {
    if (key && foreground) window.HubNative?.quotaHistory?.(key);
  }, [key, fetchedAt, foreground]);
  const entry = data?.windows.find(row => row.key === selected) || data?.windows[0];
  const now = data?.now || fetchedAt;
  const bounds = entry ? historyModel.trendBounds(entry.window, now, provider.provider) : null;
  const points = entry && bounds ? entry.points.filter(point => point.at >= bounds.start && point.at <= Math.min(bounds.end, now)) : [];
  const percent = entry?.unit === 'pp';
  const value = (n: number) => percent ? `${Number(n.toFixed(2))}%` : `${MonitorModel.money(n, entry?.unit)}${entry?.unit.toUpperCase() === 'CREDITS' ? ' 积分' : ''}`;
  const remaining = (point: QuotaHistoryPoint) => percent ? 100 - point.value : point.value;
  const max = percent ? 100 : Math.max(1, ...points.map(remaining));
  const x = (at: number) => bounds ? 12 + (at - bounds.start) / Math.max(1, bounds.end - bounds.start) * 296 : 12;
  const y = (n: number) => 104 - Math.max(0, Math.min(max, n)) / max * 88;
  const buckets = entry?.distribution.buckets || [];
  const chosenDay = buckets.find(bucket => bucket.key === day) || buckets.at(-1);
  const largestDay = Math.max(1, ...buckets.map(bucket => bucket.value ?? 0));

  return <div data-quota-history={key || 'preview'} className="mt-3 pt-3 border-t border-white/8 space-y-3">
    <p className="text-[11px] text-slate-400 leading-relaxed">本机观测记录 · 打开预览只读取本地历史</p>
    {!key && <p className="text-xs text-slate-400">历史从安卓客户端成功读取额度后开始记录。</p>}
    {key && !data && <p role="status" className="text-xs text-slate-400">正在读取额度历史…</p>}
    {data?.error && <p role="alert" className="text-xs text-amber-300">{data.error}</p>}
    {data && !entry && <p className="text-xs text-slate-400">暂无可观测的额度窗口；失败或过期读数不会新增记录。</p>}
    {entry && bounds && <>
      <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="历史额度窗口">
        {data?.windows.map(row => <button key={row.key} type="button" aria-pressed={row.key === entry.key}
          onClick={() => { setSelected(row.key); setDay(''); }}
          className={`shrink-0 min-h-[44px] px-3 rounded-xl text-xs border ${row.key === entry.key ? 'bg-sky-500/15 border-sky-400/30 text-sky-200' : 'glass-inset text-slate-400'}`}>
          {MonitorModel.quota(provider, row.window).label}
        </button>)}
      </div>
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>{percent ? '剩余额度趋势' : entry.balance ? '余额趋势' : '累计消费趋势'}</span>
        <span>{bounds.cycle ? '当前额度周期' : '近 14 天'}</span>
      </div>
      <svg viewBox="0 0 320 120" className="w-full h-32" role="img" aria-label={`${percent ? '剩余额度' : '额度'}观测趋势${percent && bounds.cycle ? '；虚线为均匀使用参考，不是预测' : ''}`}>
        <path d="M12 16H308 M12 104H308" stroke="currentColor" className="text-slate-700" fill="none" />
        {percent && bounds.cycle && <path d="M12 16L308 104" stroke="currentColor" strokeDasharray="4 4" className="text-slate-600" />}
        {historyModel.segments(points).map((segment, index) => <g key={index}>
          <polyline points={segment.map(point => `${x(point.at)},${y(remaining(point))}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" className="text-sky-400" />
          {segment.map((point, pIndex) => <circle key={pIndex} cx={x(point.at)} cy={y(remaining(point))} r="2" fill="currentColor" className="text-sky-300">
            <title>{formatShortTime(point.at)}：{value(remaining(point))}</title>
          </circle>)}
        </g>)}
        {percent && <><text x="12" y="12" fontSize="9" fill="currentColor" className="text-slate-500">100%</text><text x="12" y="117" fontSize="9" fill="currentColor" className="text-slate-500">0%</text></>}
      </svg>
      {!points.length && <p className="text-xs text-slate-400">当前范围暂无观测，未读取的区间保持空白。</p>}
      <div className="flex justify-between text-[10px] text-slate-500 font-mono-tabular">
        <span>{formatShortTime(bounds.start)}</span><span>{formatShortTime(bounds.end)}</span>
      </div>
      <p className="text-[11px] text-slate-300">近 14 天观测净变化</p>
      <div className="grid grid-cols-14 gap-1 h-24 items-end" role="group" aria-label="近14天额度净变化">
        {buckets.map(bucket => <button type="button" key={bucket.key} onClick={() => setDay(bucket.key)}
          onFocus={() => setDay(bucket.key)} aria-label={`${bucket.key}：${bucket.value === null ? '数据不足' : value(bucket.value)}${bucket.uncertain ? '，观测不完整' : ''}`}
          aria-pressed={chosenDay?.key === bucket.key}
          className={`h-full min-w-0 rounded flex flex-col justify-end items-center gap-1 focus-visible:outline-2 focus-visible:outline-sky-300 ${chosenDay?.key === bucket.key ? 'bg-sky-400/10' : ''}`}>
          <span className={`w-full rounded-t ${bucket.value === null ? 'bg-white/5' : bucket.uncertain ? 'bg-sky-400/40' : 'bg-sky-400/75'}`}
            style={{ height: bucket.value === null ? 2 : Math.max(3, bucket.value / largestDay * 70) }} />
          <span className="text-[8px] text-slate-500 font-mono-tabular">{bucket.key.slice(-2)}</span>
        </button>)}
      </div>
      <p aria-live="polite" className="text-xs text-sky-200 min-h-[2.5rem] leading-relaxed">
        {chosenDay?.key} · {chosenDay?.value == null ? '数据不足' : value(chosenDay.value)}
        {chosenDay?.uncertain && ' · 观测不完整'}
      </p>
      <p className="text-[10px] text-slate-400 leading-relaxed">仅反映已观测的净变化，不代表完整消费；未观测日期留空，重置与跨日变化不分摊。</p>
    </>}
  </div>;
}
