import { useId, useMemo, useState } from 'react';
import { Activity, BarChart3, TrendingUp } from 'lucide-react';
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
  mode?: 'daily' | 'cumulative';
  onModeChange?: (mode: 'daily' | 'cumulative') => void;
  chartStyle?: 'line' | 'bar';
  onChartStyleChange?: (style: 'line' | 'bar') => void;
}

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 124;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 110;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
const PLOT_LEFT = 38;
const PLOT_RIGHT = 312;
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;

export function HistoryChart({
  trend,
  selectedDate,
  onSelectDate,
  embedded = false,
  exactTrendTokens = false,
  mode: controlledMode,
  onModeChange,
  chartStyle: controlledStyle,
  onChartStyleChange,
}: HistoryChartProps) {
  const formatTrendTokens = (tokens: unknown) =>
    exactTrendTokens ? formatExact(tokens) : MonitorModel.compact(tokens);
  const [internalMode, setInternalMode] = useState<'daily' | 'cumulative'>('daily');
  const [internalStyle, setInternalStyle] = useState<'line' | 'bar'>('line');
  const gradientId = useId().replace(/:/g, '');

  const mode = controlledMode ?? internalMode;
  const setMode = (next: 'daily' | 'cumulative') => {
    if (onModeChange) onModeChange(next);
    else setInternalMode(next);
  };

  const chartStyle = controlledStyle ?? internalStyle;
  const setChartStyle = (next: 'line' | 'bar') => {
    if (onChartStyleChange) onChartStyleChange(next);
    else setInternalStyle(next);
  };

  // Safely dedupe duplicate date keys while preserving chronological order.
  const dedupedTrend = useMemo(() => {
    const byDate = new Map<string, DailyHistoryRow>();
    for (const row of trend) {
      if (!row?.date) continue;
      byDate.set(row.date, row);
    }
    return Array.from(byDate.values());
  }, [trend]);

  if (!dedupedTrend.length) return null;

  let cumulative = 0;
  const values = dedupedTrend.map((row) => {
    const dailyCount = MonitorModel.count(row.tokens);
    cumulative += dailyCount;
    return mode === 'cumulative' ? cumulative : dailyCount;
  });

  const peak = values.length ? Math.max(0, ...values) : 0;
  const scaleMax = peak > 0 ? peak : 1;
  const avg = Math.round(cumulative / Math.max(1, dedupedTrend.length));
  const firstDay = Date.parse(dedupedTrend[0].date);
  const span = Date.parse(dedupedTrend[dedupedTrend.length - 1].date) - firstDay;

  const points = values.map((value, index) => {
    const rawTime = Date.parse(dedupedTrend[index].date);
    const xPos =
      dedupedTrend.length === 1 || !Number.isFinite(span) || span <= 0 || !Number.isFinite(rawTime)
        ? PLOT_LEFT + PLOT_WIDTH / 2
        : PLOT_LEFT + ((rawTime - firstDay) / span) * PLOT_WIDTH;
    return {
      x: xPos,
      y: PLOT_BOTTOM - (value / scaleMax) * PLOT_HEIGHT,
      value,
    };
  });

  const isSinglePoint = points.length === 1;
  const line = points
    .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ');
  const area = isSinglePoint
    ? ''
    : `${line} L${points[points.length - 1].x.toFixed(2)},${PLOT_BOTTOM} L${points[0].x.toFixed(2)},${PLOT_BOTTOM} Z`;

  const label = mode === 'cumulative' ? '区间累计' : '每日用量';
  const activeIndex = selectedDate
    ? dedupedTrend.findIndex((row) => row.date === selectedDate)
    : dedupedTrend.length - 1;
  const resolvedIndex = activeIndex >= 0 ? activeIndex : dedupedTrend.length - 1;
  const activePoint = points[resolvedIndex];
  const activeRow = dedupedTrend[resolvedIndex];
  const selectedValue = values[resolvedIndex] ?? 0;

  const avgY = PLOT_BOTTOM - (avg / scaleMax) * PLOT_HEIGHT;
  const midY = PLOT_TOP + PLOT_HEIGHT / 2;
  const showAvg = mode === 'daily' && !isSinglePoint && avg > 0 && peak > 0;

  const seriesColor = mode === 'cumulative' ? 'var(--tm-chart-secondary)' : 'var(--tm-chart-primary)';
  const isBarMode = chartStyle === 'bar';

  // Compute centered Voronoi hit zones for line mode inside the plot area so uneven date gaps stay crisp.
  const hitZones = points.map((point, index) => {
    const leftMid = index === 0 ? PLOT_LEFT : (points[index - 1].x + point.x) / 2;
    const rightMid = index === points.length - 1 ? VIEW_WIDTH : (point.x + points[index + 1].x) / 2;
    const rawWidth = Math.max(12, rightMid - leftMid);
    const half = rawWidth / 2;
    const xStart = Math.max(PLOT_LEFT, Math.min(VIEW_WIDTH - rawWidth, point.x - half));
    return {
      leftPct: (xStart / VIEW_WIDTH) * 100,
      widthPct: (rawWidth / VIEW_WIDTH) * 100,
    };
  });

  return (
    <div
      className={
        embedded
          ? 'space-y-2.5'
          : 'mt-4 pt-3.5 border-t border-[var(--tm-border-default)] space-y-2.5'
      }
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--tm-accent-text)] shrink-0">
            <Activity className="w-3.5 h-3.5 text-[var(--tm-accent)]" aria-hidden="true" />
            <span>{embedded ? (isBarMode ? '每日柱状图' : '趋势曲线') : '历史用量 · 全部设备'}</span>
          </span>
          {!embedded && (
            <span className="text-[11px] font-mono-tabular text-[var(--tm-text-secondary)] truncate">
              · {activeRow ? activeRow.date.slice(5) : ''} {formatTrendTokens(selectedValue)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {embedded && (
            <SegmentedControl<'line' | 'bar'>
              size="sm"
              tone="neutral"
              fullWidth={false}
              ariaLabel="图表展示样式"
              value={chartStyle}
              onChange={setChartStyle}
              options={[
                {
                  value: 'line',
                  ariaLabel: '折线图',
                  label: (
                    <span className="inline-flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>折线</span>
                    </span>
                  ),
                  dataAttrs: { 'data-chart-style': 'line' },
                },
                {
                  value: 'bar',
                  ariaLabel: '柱状图',
                  label: (
                    <span className="inline-flex items-center gap-1">
                      <BarChart3 className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>柱状</span>
                    </span>
                  ),
                  dataAttrs: { 'data-chart-style': 'bar' },
                },
              ]}
            />
          )}

          <SegmentedControl<'daily' | 'cumulative'>
            size="sm"
            tone="accent"
            fullWidth={false}
            ariaLabel="历史趋势显示方式"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'daily', label: '每日', dataAttrs: { 'data-chart-mode': 'daily' } },
              { value: 'cumulative', label: '累计', dataAttrs: { 'data-chart-mode': 'cumulative' } },
            ]}
          />
        </div>
      </div>

      {/* Aspect-locked interactive chart frame so SVG text & circle markers stay undistorted */}
      <div className="relative w-full aspect-[320/124] select-none">
        <svg
          className="history-chart w-full h-full overflow-visible block"
          style={{ color: seriesColor }}
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          role="img"
          aria-label={`${label}：${dedupedTrend
            .map((row, index) => `${row.date} ${formatTrendTokens(values[index])} tokens`)
            .join('；')}`}
        >
          <defs>
            <linearGradient id={`history-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal domain gridlines: 100%, 50%, 0% */}
          <path
            d={`M${PLOT_LEFT} ${PLOT_TOP}H${PLOT_RIGHT} M${PLOT_LEFT} ${midY}H${PLOT_RIGHT} M${PLOT_LEFT} ${PLOT_BOTTOM}H${PLOT_RIGHT}`}
            fill="none"
            stroke="var(--tm-chart-grid)"
            strokeWidth="1"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />

          {/* Dedicated left-gutter Y-axis labels (zero overlap with lines or bars) */}
          {peak > 0 && (
            <>
              <text
                x={PLOT_LEFT - 5}
                y={PLOT_TOP + 3}
                textAnchor="end"
                fill="var(--tm-chart-axis)"
                fontSize="8.5"
                fontFamily="var(--font-mono)"
              >
                {MonitorModel.compact(peak)}
              </text>
              <text
                x={PLOT_LEFT - 5}
                y={midY + 3}
                textAnchor="end"
                fill="var(--tm-chart-axis)"
                fillOpacity="0.88"
                fontSize="8.5"
                fontFamily="var(--font-mono)"
              >
                {MonitorModel.compact(Math.round(peak / 2))}
              </text>
            </>
          )}
          <text
            x={PLOT_LEFT - 5}
            y={PLOT_BOTTOM + 3}
            textAnchor="end"
            fill="var(--tm-chart-axis)"
            fillOpacity="0.88"
            fontSize="8.5"
            fontFamily="var(--font-mono)"
          >
            0
          </text>

          {/* Subtle daily average reference line (numeric average is shown in footer below) */}
          {showAvg && (
            <line
              x1={PLOT_LEFT}
              y1={avgY}
              x2={PLOT_RIGHT}
              y2={avgY}
              stroke="currentColor"
              strokeOpacity="0.34"
              strokeWidth="1"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Line + area mode */}
          {!isBarMode && (
            <>
              {area && <path d={area} fill={`url(#history-fill-${gradientId})`} />}

              {activePoint && (
                <line
                  x1={activePoint.x}
                  y1={PLOT_TOP}
                  x2={activePoint.x}
                  y2={PLOT_BOTTOM}
                  stroke="currentColor"
                  strokeOpacity="0.34"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {isSinglePoint ? (
                <line
                  x1={PLOT_LEFT}
                  y1={points[0].y}
                  x2={PLOT_RIGHT}
                  y2={points[0].y}
                  stroke="currentColor"
                  strokeOpacity="0.38"
                  strokeWidth="1.5"
                  strokeDasharray="3 4"
                  vectorEffect="non-scaling-stroke"
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
                const row = dedupedTrend[index];
                return (
                  <g key={row.date}>
                    {isSelected && (
                      <>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="6.5"
                          fill="currentColor"
                          fillOpacity="0.22"
                        />
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="4"
                          fill="var(--tm-bg-surface)"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                      </>
                    )}
                    {!isSelected && (
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={isSinglePoint ? '4' : '2.4'}
                        fill="currentColor"
                      />
                    )}
                  </g>
                );
              })}
            </>
          )}
        </svg>

        {/* Interactive HTML button overlay: ensures native .click(), keyboard focus, and .trend-bar parity */}
        {onSelectDate && !isBarMode && (
          <div
            className="absolute inset-0 pointer-events-none"
            role="group"
            aria-label="每日 Token 用量，轻触查看单日详情"
          >
            {dedupedTrend.map((row, index) => {
              const isSelected = index === resolvedIndex;
              const zone = hitZones[index];
              return (
                <button
                  key={row.date}
                  type="button"
                  onClick={() => onSelectDate(row.date)}
                  data-trend={row.date}
                  aria-pressed={isSelected}
                  aria-label={`${row.date} · ${formatTrendTokens(values[index])} tokens · ${MonitorModel.money(row.cost)}`}
                  title={`${row.date} · ${formatTrendTokens(values[index])}`}
                  style={{
                    left: `${zone.leftPct}%`,
                    width: `${zone.widthPct}%`,
                  }}
                  className="trend-col pointer-events-auto absolute inset-y-0 flex flex-col justify-end items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)]"
                >
                  <span
                    aria-hidden="true"
                    className="trend-bar w-0 h-0 opacity-0 pointer-events-none"
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Bar mode interactive columns aligned precisely inside the SVG plot area */}
        {isBarMode && (
          <div
            className="absolute flex items-end gap-1.5"
            style={{
              left: `${(PLOT_LEFT / VIEW_WIDTH) * 100}%`,
              right: `${((VIEW_WIDTH - PLOT_RIGHT) / VIEW_WIDTH) * 100}%`,
              top: `${(PLOT_TOP / VIEW_HEIGHT) * 100}%`,
              bottom: `${((VIEW_HEIGHT - PLOT_BOTTOM) / VIEW_HEIGHT) * 100}%`,
            }}
            role="group"
            aria-label="每日 Token 用量柱状图，轻触柱体查看单日详情"
          >
            {dedupedTrend.map((row, index) => {
              const val = values[index];
              const pct = val > 0 ? Math.max(4, (val / scaleMax) * 100) : 0;
              const isSelected = index === resolvedIndex;
              return (
                <button
                  key={row.date}
                  type="button"
                  onClick={() => onSelectDate?.(row.date)}
                  data-trend={row.date}
                  aria-pressed={isSelected}
                  aria-label={`${row.date} · ${formatTrendTokens(val)} tokens · ${MonitorModel.money(row.cost)}`}
                  title={`${row.date} · ${formatTrendTokens(val)}`}
                  className="trend-col flex-1 h-full flex flex-col justify-end items-center group rounded-t-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)] min-h-0"
                >
                  <div
                    style={{
                      height: `${pct}%`,
                      backgroundImage: isSelected
                        ? 'linear-gradient(to top, var(--tm-chart-bar-active-start), var(--tm-chart-bar-active-end))'
                        : 'linear-gradient(to top, var(--tm-chart-bar-idle-start), var(--tm-chart-bar-idle-end))',
                    }}
                    className={`trend-bar w-full max-w-[22px] rounded-t-md transition-all duration-150 ${
                      isSelected ? 'ring-1 ring-[var(--tm-border-accent)]' : 'group-hover:opacity-90'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Axis date range + summary footer */}
      <div className="flex justify-between items-center gap-2 text-[11px] text-[var(--tm-text-muted)] tabular-nums">
        <span className="font-mono-tabular shrink-0">{dedupedTrend[0].date.slice(5)}</span>
        <span className="truncate text-center">
          {mode === 'cumulative' ? '累计' : '峰值'}{' '}
          <strong className="font-mono-tabular text-[var(--tm-text-primary)] font-semibold">
            {formatTrendTokens(mode === 'cumulative' ? cumulative : peak)}
          </strong>
          <span className="mx-1.5 opacity-60">·</span>
          日均{' '}
          <strong className="font-mono-tabular text-[var(--tm-text-primary)] font-semibold">
            {formatTrendTokens(avg)}
          </strong>
        </span>
        <span className="font-mono-tabular shrink-0">
          {dedupedTrend[dedupedTrend.length - 1].date.slice(5)}
        </span>
      </div>

      <p className="chart-scope text-[11px] text-[var(--tm-text-muted)] leading-snug">
        {mode === 'cumulative'
          ? '仅累加图中有记录日，不代表全部历史总量；轻触图表查看单日详情。'
          : '最近有记录日的真实读数，缺失日期不补零；轻触图表查看单日详情。'}
      </p>
    </div>
  );
}
