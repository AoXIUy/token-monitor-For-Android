import { useId, useState } from 'react';
import { Activity } from 'lucide-react';
import type { DailyHistoryRow } from '../types/monitor';
import { MonitorModel } from '../model/monitorModel';
import { formatExact } from '../utils/formatters';
import { SegmentedControl } from './ui/Primitives';

export interface HistoryChartProps {
  trend: DailyHistoryRow[];
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
  embedded?: boolean;
  exactTrendTokens?: boolean;
}

const PLOT_TOP = 18;
const PLOT_BOTTOM = 94;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
const PLOT_LEFT = 10;
const PLOT_WIDTH = 300;

export function HistoryChart({
  trend,
  selectedDate,
  onSelectDate,
  embedded = false,
  exactTrendTokens = false,
}: HistoryChartProps) {
  const formatTrendTokens = (tokens: unknown) =>
    exactTrendTokens ? formatExact(tokens) : MonitorModel.compact(tokens);
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
    x:
      trend.length === 1 || !span
        ? 160
        : PLOT_LEFT + ((Date.parse(trend[index].date) - firstDay) / span) * PLOT_WIDTH,
    y: PLOT_BOTTOM - (value / max) * PLOT_HEIGHT,
  }));

  const isSinglePoint = points.length === 1;
  const line = points
    .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ');
  const area = isSinglePoint
    ? ''
    : `${line} L${points[points.length - 1].x.toFixed(2)},${PLOT_BOTTOM} L${points[0].x.toFixed(2)},${PLOT_BOTTOM} Z`;

  const label = mode === 'cumulative' ? '区间累计' : '每日用量';
  const activeIndex = selectedDate
    ? trend.findIndex((row) => row.date === selectedDate)
    : trend.length - 1;
  const resolvedIndex = activeIndex >= 0 ? activeIndex : trend.length - 1;
  const activePoint = points[resolvedIndex];
  const activeRow = trend[resolvedIndex];
  const selectedValue = values[resolvedIndex] ?? 0;
  const avgY = PLOT_BOTTOM - (avg / max) * PLOT_HEIGHT;
  const midY = PLOT_TOP + PLOT_HEIGHT / 2;

  return (
    <div className={embedded ? 'mb-3 pb-3 border-b border-white/[0.08]' : 'mt-4 pt-3.5 border-t border-white/10'}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-200 shrink-0">
            <Activity className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
            <span>{embedded ? '趋势曲线' : '历史用量 · 全部设备'}</span>
          </span>
          <span className="text-[11px] font-mono-tabular text-slate-300 truncate">
            · {activeRow ? activeRow.date.slice(5) : ''} {formatTrendTokens(selectedValue)}
          </span>
        </div>

        <SegmentedControl<'daily' | 'cumulative'>
          size="sm"
          tone="accent"
          fullWidth={false}
          ariaLabel="历史趋势显示方式"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'daily', label: '每日', dataAttrs: { 'data-chart-mode': 'daily' } },
            { value: 'cumulative', label: '区间累计', dataAttrs: { 'data-chart-mode': 'cumulative' } },
          ]}
        />
      </div>

      <svg
        className={`history-chart w-full h-32 mt-2 overflow-visible ${
          mode === 'cumulative' ? 'text-emerald-400' : 'text-sky-400'
        }`}
        viewBox="0 0 320 106"
        role="img"
        aria-label={`${label}：${trend
          .map((row, index) => `${row.date} ${formatTrendTokens(values[index])} tokens`)
          .join('；')}`}
      >
        <defs>
          <linearGradient id={`history-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.30" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Aligned horizontal domain gridlines: 100%, 50%, 0% */}
        <path
          d={`M${PLOT_LEFT} ${PLOT_TOP}H310 M${PLOT_LEFT} ${midY}H310 M${PLOT_LEFT} ${PLOT_BOTTOM}H310`}
          fill="none"
          stroke="white"
          strokeOpacity="0.08"
          strokeDasharray="3 5"
        />

        {/* Y-axis scale reference labels */}
        <text
          x={PLOT_LEFT}
          y={PLOT_TOP - 4}
          fill="#94a3b8"
          fontSize="8.5"
          fontFamily="var(--font-mono)"
        >
          {MonitorModel.compact(max)}
        </text>
        <text
          x={PLOT_LEFT}
          y={midY - 3}
          fill="#94a3b8"
          fillOpacity="0.85"
          fontSize="8"
          fontFamily="var(--font-mono)"
        >
          {MonitorModel.compact(Math.round(max / 2))}
        </text>

        {/* Daily average reference line */}
        {mode === 'daily' && !isSinglePoint && avg > 0 && (
          <>
            <line
              x1={PLOT_LEFT}
              y1={avgY}
              x2={310}
              y2={avgY}
              stroke="currentColor"
              strokeOpacity="0.32"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <text
              x={310}
              y={Math.max(PLOT_TOP + 9, avgY - 3)}
              textAnchor="end"
              fill="#94a3b8"
              fontSize="8"
              fontFamily="var(--font-mono)"
            >
              avg {MonitorModel.compact(avg)}
            </text>
          </>
        )}

        {area && <path d={area} fill={`url(#history-fill-${gradientId})`} />}

        {activePoint && (
          <line
            x1={activePoint.x}
            y1={PLOT_TOP}
            x2={activePoint.x}
            y2={PLOT_BOTTOM}
            stroke="currentColor"
            strokeOpacity="0.34"
            strokeDasharray="2 3"
          />
        )}

        {isSinglePoint ? (
          <line
            x1={PLOT_LEFT}
            y1={points[0].y}
            x2={310}
            y2={points[0].y}
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="1.5"
            strokeDasharray="3 4"
          />
        ) : (
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {points.map((point, index) => {
          const isSelected = index === resolvedIndex;
          const row = trend[index];
          const leftBound = index === 0 ? 0 : (points[index - 1].x + point.x) / 2;
          const rightBound =
            index === points.length - 1 ? 320 : (point.x + points[index + 1].x) / 2;
          const hitWidth = Math.max(14, rightBound - leftBound);
          const hitX = Math.max(0, Math.min(320 - hitWidth, leftBound));

          return (
            <g
              key={row.date}
              role={onSelectDate ? 'button' : undefined}
              tabIndex={onSelectDate ? 0 : undefined}
              aria-label={
                onSelectDate ? `${row.date} · ${formatTrendTokens(values[index])} tokens` : undefined
              }
              aria-pressed={onSelectDate ? isSelected : undefined}
              onClick={onSelectDate ? () => onSelectDate(row.date) : undefined}
              onKeyDown={
                onSelectDate
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectDate(row.date);
                      }
                    }
                  : undefined
              }
              className={onSelectDate ? 'cursor-pointer focus:outline-none group' : undefined}
            >
              {onSelectDate && (
                <rect x={hitX} y={0} width={hitWidth} height={106} fill="transparent" />
              )}
              {onSelectDate && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="8"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.6"
                  className="opacity-0 group-focus-visible:opacity-100"
                />
              )}
              {isSelected && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="6"
                  fill="currentColor"
                  fillOpacity="0.24"
                />
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r={isSelected ? '3.5' : isSinglePoint ? '4' : '2.3'}
                fill="currentColor"
              />
            </g>
          );
        })}
      </svg>

      {embedded ? (
        <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] text-slate-400 tabular-nums mt-1">
          <span>
            峰值 <strong className="font-mono-tabular text-slate-200 font-semibold">{formatTrendTokens(max)}</strong>
            <span className="mx-1.5 text-slate-400/70">·</span>
            日均 <strong className="font-mono-tabular text-slate-200 font-semibold">{formatTrendTokens(avg)}</strong>
          </span>
          <p className="chart-scope text-[11px] text-slate-400 leading-snug">
            {mode === 'cumulative' ? '仅累加有记录日' : '缺失日期不补零'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center gap-2 text-[11px] text-slate-400 tabular-nums mt-1">
            <span className="font-mono-tabular">{trend[0].date.slice(5)}</span>
            <span>
              峰值 <span className="font-mono-tabular text-slate-200">{formatTrendTokens(max)}</span> · 日均{' '}
              <span className="font-mono-tabular text-slate-200">{formatTrendTokens(avg)}</span>
            </span>
            <span className="font-mono-tabular">{trend[trend.length - 1].date.slice(5)}</span>
          </div>
          <p className="chart-scope mt-1.5 text-[11px] text-slate-400 leading-relaxed">
            {mode === 'cumulative'
              ? '仅累加图中有记录日，不代表全部历史总量。'
              : '最近有记录日的真实读数；缺失日期不补零。'}
          </p>
        </>
      )}
    </div>
  );
}
