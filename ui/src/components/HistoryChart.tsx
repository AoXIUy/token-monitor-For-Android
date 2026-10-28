import { useState } from 'react';
import { Activity } from 'lucide-react';
import type { DailyHistoryRow } from '../types/monitor';
import { MonitorModel } from '../model/monitorModel';

export function HistoryChart({ trend }: { trend: DailyHistoryRow[] }) {
  const [mode, setMode] = useState<'daily' | 'cumulative'>('daily');
  if (!trend.length) return null;
  let cumulative = 0;
  const values = trend.map(row => {
    cumulative += MonitorModel.count(row.tokens);
    return mode === 'cumulative' ? cumulative : MonitorModel.count(row.tokens);
  });
  const max = Math.max(1, ...values);
  const firstDay = Date.parse(trend[0].date);
  const span = Date.parse(trend[trend.length - 1].date) - firstDay;
  const points = values.map((value, index) => ({
    x: span ? 8 + (Date.parse(trend[index].date) - firstDay) / span * 304 : 160,
    y: 88 - value / max * 76,
  }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const area = `${line} L${points[points.length - 1].x.toFixed(2)},92 L${points[0].x.toFixed(2)},92 Z`;
  const label = mode === 'cumulative' ? '区间累计' : '每日用量';

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-sky-200">
          <Activity className="w-3.5 h-3.5" />历史用量 · 全部设备
        </span>
        <div className="inline-flex rounded-xl bg-black/25 border border-white/8 p-0.5" aria-label="历史趋势显示方式">
          {(['daily', 'cumulative'] as const).map(value => (
            <button key={value} type="button" data-chart-mode={value} aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`min-h-8 px-2 rounded-lg text-[10px] ${mode === value ? 'bg-sky-400/20 text-sky-200' : 'text-slate-400'}`}>
              {value === 'daily' ? '每日' : '区间累计'}
            </button>
          ))}
        </div>
      </div>
      <svg className={`history-chart w-full h-28 mt-1 ${mode === 'cumulative' ? 'text-emerald-400' : 'text-sky-400'}`}
        viewBox="0 0 320 100" role="img"
        aria-label={`${label}：${trend.map((row, index) => `${row.date} ${MonitorModel.compact(values[index])} tokens`).join('；')}`}>
        <defs><linearGradient id="history-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient></defs>
        <path d="M8 30H312 M8 60H312 M8 90H312" fill="none" stroke="white" strokeOpacity="0.06" strokeDasharray="3 5" />
        <path d={area} fill="url(#history-fill)" />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        {points.map((point, index) => <circle key={trend[index].date} cx={point.x} cy={point.y} r="2.5" fill="currentColor" />)}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 font-mono-tabular">
        <span>{trend[0].date.slice(5)}</span><span>{trend[trend.length - 1].date.slice(5)}</span>
      </div>
      <p className="chart-scope mt-2 text-[10px] text-slate-400 leading-relaxed">
        {mode === 'cumulative' ? '仅累加图中有记录日，不代表全部历史总量。' : '最近有记录日的真实读数；缺失日期不补零。'}
      </p>
    </div>
  );
}
