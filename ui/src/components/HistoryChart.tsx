import { useId, useState } from 'react';
import { Activity } from 'lucide-react';
import type { DailyHistoryRow } from '../types/monitor';
import { MonitorModel } from '../model/monitorModel';

export interface HistoryChartProps {
  trend: DailyHistoryRow[];
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
  embedded?: boolean;
}

export function HistoryChart({
  trend,
  selectedDate,
  onSelectDate,
  embedded = false,
}: HistoryChartProps) {
  const [mode, setMode] = useState<'daily' | 'cumulative'>('daily');
  const gradientId = useId().replace(/:/g, '');
  if (!trend.length) return null;
  let cumulative = 0;
  const values = trend.map((row) => {
    cumulative += MonitorModel.count(row.tokens);
    return mode === 'cumulative' ? cumulative : MonitorModel.count(row.tokens);
  });
  const max = Math.max(1, ...values);
  const avg = Math.round(cumulative / Math.max(1, trend.length));
  const firstDay = Date.parse(trend[0].date);
  const span = Date.parse(trend[trend.length - 1].date) - firstDay;
  const points = values.map((value, index) => ({
    x: span ? 8 + ((Date.parse(trend[index].date) - firstDay) / span) * 304 : 160,
    y: 88 - (value / max) * 74,
  }));
  const line = points
    .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ');
  const area = `${line} L${points[points.length - 1].x.toFixed(2)},92 L${points[0].x.toFixed(2)},92 Z`;
  const label = mode === 'cumulative' ? '区间累计' : '每日用量';
  const latestValue = values[values.length - 1] ?? 0;
  const activeIndex = selectedDate
    ? trend.findIndex((row) => row.date === selectedDate)
    : trend.length - 1;
  const resolvedIndex = activeIndex >= 0 ? activeIndex : trend.length - 1;
  const activePoint = points[resolvedIndex];

  return (
    <div className={embedded ? 'mb-3.5 pb-3 border-b border-white/8' : 'mt-4 pt-3.5 border-t border-white/10'}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-200">
            <Activity className="w-3.5 h-3.5 text-sky-400" />
            <span>{embedded ? '趋势曲线 · 全部设备' : '历史用量 · 全部设备'}</span>
          </span>
          <span className="text-[11px] font-mono-tabular text-slate-300/90">
            · {MonitorModel.compact(latestValue)}
          </span>
        </div>
        <div
          className="inline-flex rounded-xl bg-black/30 border border-white/10 p-0.5"
          aria-label="历史趋势显示方式"
        >
          {(['daily', 'cumulative'] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-chart-mode={value}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                mode === value
                  ? 'bg-sky-400/20 text-sky-200 border border-sky-400/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {value === 'daily' ? '每日' : '区间累计'}
            </button>
          ))}
        </div>
      </div>
      <svg
        className={`history-chart w-full h-28 mt-1.5 ${
          mode === 'cumulative' ? 'text-emerald-400' : 'text-sky-400'
        }`}
        viewBox="0 0 320 100"
        role="img"
        aria-label={`${label}：${trend
          .map((row, index) => `${row.date} ${MonitorModel.compact(values[index])} tokens`)
          .join('；')}`}
      >
        <defs>
          <linearGradient id={`history-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path
          d="M8 26H312 M8 58H312 M8 90H312"
          fill="none"
          stroke="white"
          strokeOpacity="0.07"
          strokeDasharray="3 5"
        />
        <path d={area} fill={`url(#history-fill-${gradientId})`} />
        {activePoint && (
          <line
            x1={activePoint.x}
            y1={12}
            x2={activePoint.x}
            y2={92}
            stroke="currentColor"
            strokeOpacity="0.28"
            strokeDasharray="2 3"
          />
        )}
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) => {
          const isSelected = index === resolvedIndex;
          const row = trend[index];
          return (
            <g
              key={row.date}
              role={onSelectDate ? 'button' : undefined}
              tabIndex={onSelectDate ? 0 : undefined}
              aria-label={onSelectDate ? `${row.date} · ${MonitorModel.compact(values[index])} tokens` : undefined}
              aria-pressed={onSelectDate ? isSelected : undefined}
              onClick={onSelectDate ? () => onSelectDate(row.date) : undefined}
              onKeyDown={onSelectDate ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectDate(row.date);
                }
              } : undefined}
              className={onSelectDate ? 'cursor-pointer focus:outline-none' : undefined}
            >
              {onSelectDate && (
                <circle cx={point.x} cy={point.y} r="10" fill="transparent" />
              )}
              {isSelected && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="5.5"
                  fill="currentColor"
                  fillOpacity="0.22"
                />
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r={isSelected ? '3.4' : '2.3'}
                fill="currentColor"
              />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 font-mono-tabular">
        <span>{trend[0].date.slice(5)}</span>
        <span className="text-slate-400">
          峰值 {MonitorModel.compact(max)} · 日均 {MonitorModel.compact(avg)}
        </span>
        <span>{trend[trend.length - 1].date.slice(5)}</span>
      </div>
      <p className="chart-scope mt-1.5 text-[10px] text-slate-400 leading-relaxed">
        {mode === 'cumulative'
          ? '仅累加图中有记录日，不代表全部历史总量。'
          : '最近有记录日的真实读数；缺失日期不补零。'}
      </p>
    </div>
  );
}
