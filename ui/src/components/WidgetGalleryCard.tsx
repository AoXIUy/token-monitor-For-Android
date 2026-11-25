import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Gauge,
  Layers,
  LayoutGrid,
  Maximize2,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { MonitorModel } from '../model/monitorModel';
import { MonitorStats } from '../types/monitor';
import { formatShortTime, clientName, providerName } from '../utils/formatters';
import { SectionHeader, SegmentedControl } from './ui/Primitives';

type WidgetKindId = 'compact' | 'today' | 'periods' | 'quota';
type WidgetSizeId = '2x1' | '2x2' | '4x2' | '4x3';

interface WidgetGalleryCardProps {
  stats: MonitorStats | null;
  connected: boolean;
  fetchedAt: number;
  separateQoderClients?: boolean;
}

/* Native Android launcher RemoteViews always render with the fixed dark widget palette. */
const WIDGET_INSET_CLASS = 'rounded-[12px] bg-[#0A1018] border border-[#1D2B3D]';

const WidgetFrame: React.FC<{
  compactBar?: boolean;
  narrow?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ compactBar = false, narrow = false, className = '', children }) => (
  <div
    className={`w-full ${narrow ? 'max-w-[228px]' : ''} ${
      compactBar ? 'max-w-[244px] rounded-[18px] px-3 py-2' : 'rounded-[22px] p-3.5'
    } bg-gradient-to-br from-[#152030] via-[#0F1722] to-[#0B1018] border border-[#26364A] shadow-lg ${className}`}
  >
    {children}
  </div>
);

const WidgetRefreshBadge: React.FC<{
  variant: 'pill' | 'icon';
  size?: 'sm' | 'md';
}> = ({ variant, size = 'md' }) =>
  variant === 'pill' ? (
    <span
      aria-hidden="true"
      className="h-[30px] px-2.5 rounded-[16px] bg-[#132234] border border-[#28415A] inline-flex items-center gap-1 text-[11px] font-medium text-[#7DD3FC] shrink-0 whitespace-nowrap"
    >
      <RefreshCw className="w-3 h-3 shrink-0" />
      <span>刷新</span>
    </span>
  ) : (
    <span
      aria-hidden="true"
      className={`${
        size === 'sm' ? 'w-7 h-7' : 'w-8 h-8'
      } rounded-[11px] bg-[#132234] border border-[#28415A] flex items-center justify-center text-[#7DD3FC] shrink-0`}
    >
      <RefreshCw className="w-3.5 h-3.5" />
    </span>
  );

const WidgetProgressBar: React.FC<{
  percent: number;
  warn?: boolean;
}> = ({ percent, warn = false }) => {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-1.5 w-full rounded-full bg-[#1E293B] overflow-hidden" aria-hidden="true">
      <div
        style={{ width: `${clamped}%` }}
        className={`h-full rounded-full ${
          warn
            ? 'bg-gradient-to-r from-[#FBBF24] to-[#FB7185]'
            : 'bg-gradient-to-r from-[#38BDF8] to-[#34D399]'
        }`}
      />
    </div>
  );
};

const KIND_META: Array<{
  id: WidgetKindId;
  title: string;
  badge: string;
  desc: string;
  sizes: Array<{ id: WidgetSizeId; label: string }>;
  defaultSize: WidgetSizeId;
}> = [
  {
    id: 'compact',
    title: '紧凑速览',
    badge: '2×1 起',
    desc: '桌面单行空位即可放置，拉高切换为今日+本月方卡，拉宽展开完整主卡。',
    sizes: [
      { id: '2x1', label: '2×1 横条' },
      { id: '2x2', label: '2×2 方卡' },
      { id: '4x2', label: '4×2 展开' },
    ],
    defaultSize: '2x1',
  },
  {
    id: 'today',
    title: '今日用量',
    badge: '4×2 主卡',
    desc: '展示今日 Token、费用、缓存占比与上报设备；拉大展开输入输出与主要工具。',
    sizes: [
      { id: '2x2', label: '2×2 紧凑' },
      { id: '4x2', label: '4×2 标准' },
      { id: '4x3', label: '4×3 展开' },
    ],
    defaultSize: '4x2',
  },
  {
    id: 'periods',
    title: '多周期总览',
    badge: '2×2 ~ 4×3',
    desc: '对比今日、本月与累计用量；展开查看近 7 日用量和 14 日峰值，缺失日期时显示小计。',
    sizes: [
      { id: '2x2', label: '2×2 紧凑' },
      { id: '4x2', label: '4×2 三周期' },
      { id: '4x3', label: '4×3 全景' },
    ],
    defaultSize: '4x2',
  },
  {
    id: 'quota',
    title: '额度监控',
    badge: '2×2 ~ 4×3',
    desc: '按占用率高低排序展示 AI 账户配额窗口进度条，超 85% 自动高亮预警。',
    sizes: [
      { id: '2x2', label: '2×2 摘要' },
      { id: '4x2', label: '4×2 双窗口' },
      { id: '4x3', label: '4×3 三窗口' },
    ],
    defaultSize: '4x2',
  },
];

export const WidgetGalleryCard: React.FC<WidgetGalleryCardProps> = ({
  stats,
  connected,
  fetchedAt,
  separateQoderClients = false,
}) => {
  const [kind, setKind] = useState<WidgetKindId>('today');
  const [size, setSize] = useState<WidgetSizeId>('4x2');
  const [showGuide, setShowGuide] = useState(false);

  const activeMeta = KIND_META.find((item) => item.id === kind) || KIND_META[1];

  useEffect(() => {
    if (!activeMeta.sizes.some((s) => s.id === size)) {
      setSize(activeMeta.defaultSize);
    }
  }, [activeMeta, size]);

  const preview = useMemo(() => {
    const today = stats?.periods?.today || null;
    const month = stats?.periods?.month || null;
    const allTime = stats?.periods?.allTime || null;
    const providers = stats?.limits?.providers || [];
    const hasData =
      fetchedAt > 0 &&
      Boolean(today || month || allTime || providers.length > 0);
    const devices = stats?.devices || [];
    const activeDevices = devices.filter((d) => !d.stale).length;

    const components = today ? MonitorModel.components(today) : null;
    const todayTokens =
      hasData && today && MonitorModel.numeric(today.totalTokens) !== null
        ? MonitorModel.compact(today.totalTokens)
        : '—';
    const todayCost = hasData && today ? MonitorModel.money(today.costUsd) : '—';
    const partialCost = Boolean(today && MonitorModel.count(today.unpricedTokens) > 0);
    const cacheStr = hasData && components ? `${components.cachePercent}%` : '—';
    const cachePct =
      hasData && components ? Math.min(100, Math.max(0, Number(components.cachePercent))) : null;
    const inStr =
      hasData && components && today ? MonitorModel.compact(today.inputTokens) : '—';
    const outStr = hasData && components ? MonitorModel.compact(components.output) : '—';
    const devicesStr = hasData ? `${activeDevices} / ${devices.length}` : '—';

    const monthTokens =
      hasData && month && MonitorModel.numeric(month.totalTokens) !== null
        ? MonitorModel.compact(month.totalTokens)
        : '—';
    const monthCost = hasData && month ? MonitorModel.money(month.costUsd) : '—';

    const allTokens =
      hasData && allTime && MonitorModel.numeric(allTime.totalTokens) !== null
        ? MonitorModel.compact(allTime.totalTokens)
        : '—';
    const allCost = hasData && allTime ? MonitorModel.money(allTime.costUsd) : '—';

    const history = MonitorModel.widgetHistory(stats, fetchedAt);
    const sevenDayStr =
      hasData && history.sevenDayTokens !== null
        ? MonitorModel.compact(history.sevenDayTokens)
        : '—';
    const peakDayStr =
      hasData && history.peakDayTokens !== null
        ? MonitorModel.compact(history.peakDayTokens)
        : '—';

    const clientRows =
      hasData && today
        ? MonitorModel.breakdown(today, 'clients', { separateQoderClients }).slice(0, 3)
        : [];
    const topToolsStr =
      clientRows.length > 0
        ? clientRows.map((r) => `${clientName(r.id)} ${MonitorModel.compact(r.tokens)}`).join(' · ')
        : '—';

    let healthyAccounts = 0;
    let alertAccounts = 0;
    const quotaRows: Array<{ label: string; pct: number; warn: boolean }> = [];

    if (hasData) {
      for (const prov of providers) {
        const ok = prov.status === 'ok' && !prov.stale;
        if (ok) healthyAccounts++;
        let high = false;
        const pLabel =
          MonitorModel.limitAccount(prov, stats, '').productLabel || providerName(prov.provider);
        for (const win of MonitorModel.limitWindows(prov)) {
          const q = MonitorModel.quota(prov, win);
          if (q.percent === null) continue;
          const usedPct = Math.round(q.remaining ? 100 - q.percent : q.percent);
          if (usedPct >= 85) high = true;
          const wKind =
            (
              {
                session: '会话',
                weekly: '周度',
                daily: '每日',
                monthly: '月度',
                billing: '账期',
                credits: '额度',
              } as Record<string, string>
            )[win.kind || ''] || '配额';
          quotaRows.push({
            label: `${pLabel} · ${wKind}`,
            pct: Math.max(0, Math.min(100, usedPct)),
            warn: usedPct >= 85 || !ok,
          });
        }
        if (!ok || high) alertAccounts++;
      }
      quotaRows.sort((a, b) => b.pct - a.pct);
    }

    const dateTag = hasData
      ? new Date(fetchedAt)
          .toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
          .replace('/', '-')
      : '';
    const footer = !connected
      ? '轻触卡片，连接 Hub'
      : hasData
        ? `上次读取 · ${formatShortTime(fetchedAt)}`
        : '等待首次读取 · 可轻触刷新';

    return {
      hasData,
      dateTag,
      footer,
      todayTokens,
      todayCost,
      partialCost,
      cacheStr,
      cachePct,
      inStr,
      outStr,
      devicesStr,
      monthTokens,
      monthCost,
      allTokens,
      allCost,
      sevenDayStr,
      sevenDayDays: history.sevenDayDays,
      peakDayStr,
      topToolsStr,
      totalAccounts: providers.length,
      healthyAccounts,
      alertAccounts,
      quotaRows: quotaRows.slice(0, 3),
    };
  }, [stats, connected, fetchedAt, separateQoderClients]);

  const compact2x1CostText = !connected
    ? '连接 Hub'
    : !preview.hasData
      ? '等待读取'
      : preview.todayCost;
  const compact2x1CostClass =
    !connected || !preview.hasData || preview.todayCost === '—'
      ? 'text-[#94A3B8]'
      : 'text-[#6EE7B7]';

  return (
    <section id="widget-gallery" className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5">
      <SectionHeader
        headingLevel="h2"
        icon={
          <span className="w-9 h-9 rounded-xl bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] flex items-center justify-center text-[var(--tm-accent-text)]">
            <LayoutGrid className="w-4 h-4" />
          </span>
        }
        title="桌面微件卡片"
        subtitle="4 种卡片样式 · 支持 2×1 至 4×3 自由缩放"
        action={
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-[11px] font-semibold text-[var(--tm-accent-text)] shrink-0 whitespace-nowrap">
            <Maximize2 className="w-3 h-3" aria-hidden="true" />
            <span>自适应</span>
          </span>
        }
      />

      <div
        className="grid grid-cols-2 gap-2"
        role="group"
        aria-label="选择桌面微件种类预览"
      >
        {KIND_META.map((item) => {
          const active = item.id === kind;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setKind(item.id);
                setSize(item.defaultSize);
              }}
              className={`min-h-[50px] px-3 py-2 rounded-2xl border text-left transition-all active:scale-[0.98] flex flex-col justify-center gap-0.5 min-w-0 ${
                active
                  ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-text-primary)]'
                  : 'glass-inset text-[var(--tm-text-secondary)] hover:border-[var(--tm-border-strong)]'
              }`}
            >
              <span className="text-xs font-semibold truncate w-full">{item.title}</span>
              <span className="text-[11px] font-mono-tabular text-[var(--tm-accent-text)] truncate w-full">
                {item.badge}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5">
        <p className="text-xs text-[var(--tm-text-muted)] leading-relaxed">{activeMeta.desc}</p>
        <SegmentedControl<WidgetSizeId>
          ariaLabel="切换微件尺寸"
          size="md"
          tone="accent"
          fullWidth
          value={size}
          onChange={setSize}
          options={activeMeta.sizes.map((s) => ({
            value: s.id,
            label: s.label,
          }))}
        />
      </div>

      {/* Simulated Launcher Canvas — 100% synced with Android RemoteViews dark palette & layouts */}
      <div className="rounded-2xl bg-[#090E16] border border-[var(--tm-border-default)] p-3.5 space-y-2.5">
        <div className="flex justify-center">
          {kind === 'compact' && size === '2x1' && (
            <WidgetFrame compactBar className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-[#94A3B8] truncate tabular-nums">
                  {preview.hasData ? `${preview.dateTag} · 今日` : '今日用量'}
                </div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-lg font-bold font-mono-tabular text-[#F8FAFC] leading-none shrink-0">
                    {preview.todayTokens}
                  </span>
                  <span
                    className={`text-[11px] font-medium tabular-nums truncate ${compact2x1CostClass}`}
                  >
                    {compact2x1CostText}
                  </span>
                </div>
              </div>
              <WidgetRefreshBadge variant="icon" size="md" />
            </WidgetFrame>
          )}

          {(kind === 'compact' || kind === 'today' || kind === 'periods') && size === '2x2' && (
            <WidgetFrame narrow className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[#BAE6FD] truncate tabular-nums">
                  {preview.hasData ? `${preview.dateTag} · 今日` : '今日用量'}
                </span>
                <WidgetRefreshBadge variant="icon" size="sm" />
              </div>
              <div className="flex items-baseline gap-1.5 py-1">
                <span className="text-2xl font-bold font-mono-tabular text-[#F8FAFC] leading-none">
                  {preview.todayTokens}
                </span>
                <span className="text-[11px] text-[#94A3B8]">tokens</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="min-w-0">
                  <div className="text-[11px] text-[#94A3B8] truncate">
                    {preview.partialCost ? '费用小计' : '今日费用'}
                  </div>
                  <div className="text-[#6EE7B7] font-semibold font-mono-tabular mt-0.5 truncate">
                    {preview.todayCost}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-[#94A3B8] truncate">本月</div>
                  <div className="text-[#7DD3FC] font-semibold font-mono-tabular mt-0.5 truncate">
                    {preview.monthTokens}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-[#94A3B8] truncate pt-0.5 tabular-nums">
                {preview.footer}
              </div>
            </WidgetFrame>
          )}

          {(kind === 'today' || kind === 'compact') && (size === '4x2' || size === '4x3') && (
            <WidgetFrame className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold tracking-widest text-[#BAE6FD] truncate">
                  TOKEN MONITOR
                </span>
                <WidgetRefreshBadge variant="pill" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-[#94A3B8] tabular-nums">
                <span>{preview.hasData ? `${preview.dateTag} · 今日用量` : '今日用量'}</span>
                {size === '4x3' && preview.inStr !== '—' && (
                  <span>
                    输入 {preview.inStr} · 输出 {preview.outStr}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2 py-0.5">
                <span className="text-3xl font-bold font-mono-tabular text-[#F8FAFC] leading-none">
                  {preview.todayTokens}
                </span>
                <span className="text-[11px] text-[#94A3B8]">tokens</span>
              </div>
              {size === '4x3' && preview.cachePct !== null && (
                <WidgetProgressBar percent={preview.cachePct} />
              )}
              <div className={`grid grid-cols-3 gap-2 px-2.5 py-2 ${WIDGET_INSET_CLASS}`}>
                <div className="min-w-0">
                  <div className="text-[11px] text-[#94A3B8] truncate">
                    {preview.partialCost ? '费用小计' : '费用 · USD'}
                  </div>
                  <div className="text-xs font-semibold font-mono-tabular text-[#F1F5F9] mt-0.5 truncate">
                    {preview.todayCost}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-[#94A3B8] truncate">缓存占比</div>
                  <div className="text-xs font-semibold font-mono-tabular text-[#6EE7B7] mt-0.5 truncate">
                    {preview.cacheStr}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-[#94A3B8] truncate">近期设备</div>
                  <div className="text-xs font-semibold font-mono-tabular text-[#7DD3FC] mt-0.5 truncate">
                    {preview.devicesStr}
                  </div>
                </div>
              </div>
              {size === '4x3' && (
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-[#94A3B8] shrink-0">主要工具</span>
                  <span className="text-[#E2E8F0] tabular-nums truncate">
                    {preview.topToolsStr}
                  </span>
                </div>
              )}
              <div className="text-[11px] text-[#94A3B8] truncate tabular-nums">{preview.footer}</div>
            </WidgetFrame>
          )}

          {kind === 'periods' && (size === '4x2' || size === '4x3') && (
            <WidgetFrame className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold tracking-wider text-[#BAE6FD] flex items-center gap-1.5 min-w-0 truncate">
                  <Layers className="w-3.5 h-3.5 text-[#7DD3FC] shrink-0" aria-hidden="true" />
                  <span className="truncate">TOKEN MONITOR · 多周期</span>
                </span>
                <WidgetRefreshBadge variant="pill" />
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <div className={`${WIDGET_INSET_CLASS} p-2.5 min-w-0`}>
                  <div className="text-[11px] text-[#BAE6FD] truncate tabular-nums">
                    {preview.hasData ? `今日 · ${preview.dateTag}` : '今日'}
                  </div>
                  <div className="text-base font-bold font-mono-tabular text-[#F8FAFC] mt-1 truncate">
                    {preview.todayTokens}
                  </div>
                  <div className="text-[11px] font-mono-tabular text-[#6EE7B7] mt-0.5 truncate">
                    {preview.todayCost}
                  </div>
                </div>
                <div className={`${WIDGET_INSET_CLASS} p-2.5 min-w-0`}>
                  <div className="text-[11px] text-[#94A3B8] truncate">本月</div>
                  <div className="text-base font-bold font-mono-tabular text-[#7DD3FC] mt-1 truncate">
                    {preview.monthTokens}
                  </div>
                  <div className="text-[11px] font-mono-tabular text-[#CBD5E1] mt-0.5 truncate">
                    {preview.monthCost}
                  </div>
                </div>
                <div className={`${WIDGET_INSET_CLASS} p-2.5 min-w-0`}>
                  <div className="text-[11px] text-[#94A3B8] truncate">累计</div>
                  <div className="text-base font-bold font-mono-tabular text-[#C4B5FD] mt-1 truncate">
                    {preview.allTokens}
                  </div>
                  <div className="text-[11px] font-mono-tabular text-[#CBD5E1] mt-0.5 truncate">
                    {preview.allCost}
                  </div>
                </div>
              </div>

              {size === '4x3' && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5 text-xs">
                    <div className="min-w-0">
                      <div className="text-[11px] text-[#94A3B8] truncate">
                        {preview.sevenDayDays > 0 && preview.sevenDayDays < 7
                          ? '7日小计'
                          : '近 7 日总量'}
                      </div>
                      <div
                        className="text-[#F1F5F9] font-semibold font-mono-tabular mt-0.5 truncate"
                        aria-label={`近7日有${preview.sevenDayDays}天读数，缺失日期不补零：${preview.sevenDayStr}`}
                      >
                        {preview.sevenDayStr}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-[#94A3B8] truncate">14日峰值</div>
                      <div className="text-[#7DD3FC] font-semibold font-mono-tabular mt-0.5 truncate">
                        {preview.peakDayStr}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-[#94A3B8] truncate">缓存占比</div>
                      <div className="text-[#6EE7B7] font-semibold font-mono-tabular mt-0.5 truncate">
                        {preview.cacheStr}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-[#94A3B8] truncate">近期设备</div>
                      <div className="text-[#BAE6FD] font-semibold font-mono-tabular mt-0.5 truncate">
                        {preview.devicesStr}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-[#94A3B8] shrink-0">主要工具</span>
                    <span className="text-[#E2E8F0] tabular-nums truncate">
                      {preview.topToolsStr}
                    </span>
                  </div>
                </>
              )}

              <div className="text-[11px] text-[#94A3B8] truncate tabular-nums">{preview.footer}</div>
            </WidgetFrame>
          )}

          {kind === 'quota' && (
            <WidgetFrame narrow={size === '2x2'} className="space-y-2.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold tracking-wider text-[#BAE6FD] inline-flex items-center gap-1.5 min-w-0 truncate">
                    <Gauge className="w-3.5 h-3.5 text-[#7DD3FC] shrink-0" aria-hidden="true" />
                    <span className="truncate">{size === '2x2' ? '额度监控' : 'TOKEN MONITOR · 额度'}</span>
                  </span>
                  <WidgetRefreshBadge variant={size === '2x2' ? 'icon' : 'pill'} size="sm" />
                </div>
                {size !== '2x2' && preview.hasData && preview.totalAccounts > 0 && (
                  <div
                    className={`text-[11px] tabular-nums truncate ${
                      preview.alertAccounts > 0 ? 'text-[#FBBF24]' : 'text-[#6EE7B7]'
                    }`}
                  >
                    正常 {preview.healthyAccounts}/{preview.totalAccounts}
                    {preview.alertAccounts > 0 ? ` · 关注 ${preview.alertAccounts}` : ''}
                  </div>
                )}
              </div>

              {size === '2x2' && (
                <div
                  className={`text-lg font-bold tabular-nums ${
                    preview.hasData && preview.alertAccounts > 0 ? 'text-[#FBBF24]' : 'text-[#F8FAFC]'
                  }`}
                >
                  {!preview.hasData
                    ? '—'
                    : preview.totalAccounts === 0
                      ? '未配置账户'
                      : preview.alertAccounts > 0
                        ? `${preview.alertAccounts} 项需关注`
                        : `${preview.healthyAccounts} 账户正常`}
                </div>
              )}

              {!preview.hasData || preview.quotaRows.length === 0 ? (
                <div className="text-xs text-[#94A3B8] py-2">暂无可量化的配额窗口读数</div>
              ) : (
                <div className="space-y-1.5">
                  {preview.quotaRows
                    .slice(0, size === '2x2' ? 1 : size === '4x2' ? 2 : 3)
                    .map((qRow, idx) => (
                      <div
                        key={`${qRow.label}-${idx}`}
                        className={
                          size === '2x2'
                            ? 'space-y-1.5 pt-0.5'
                            : `${WIDGET_INSET_CLASS} px-2.5 py-2 space-y-1.5`
                        }
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span
                            className={`truncate ${
                              size === '2x2' ? 'text-[#CBD5E1]' : 'text-[#F1F5F9]'
                            }`}
                          >
                            {qRow.label}
                          </span>
                          <span
                            className={`tabular-nums font-semibold shrink-0 ${
                              qRow.warn ? 'text-[#FBBF24]' : 'text-[#7DD3FC]'
                            }`}
                          >
                            {qRow.pct}% 已用
                          </span>
                        </div>
                        <WidgetProgressBar percent={qRow.pct} warn={qRow.warn} />
                      </div>
                    ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 text-[11px] text-[#94A3B8]">
                <span className="truncate tabular-nums">{preview.footer}</span>
                {size === '4x3' && (
                  <span className="tabular-nums text-[#7DD3FC] shrink-0">
                    设备 {preview.devicesStr}
                  </span>
                )}
              </div>
            </WidgetFrame>
          )}
        </div>
        <p className="text-[11px] text-[#8B9BB4] text-center">
          预览样式对应安卓桌面暗色微件
        </p>
      </div>

      <div className="pt-1 border-t border-[var(--tm-border-subtle)]">
        <button
          type="button"
          onClick={() => setShowGuide((prev) => !prev)}
          aria-expanded={showGuide}
          className="w-full min-h-[44px] flex items-center justify-between text-xs text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] transition-colors"
        >
          <span className="inline-flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-[var(--tm-accent-text)] shrink-0" aria-hidden="true" />
            <span>如何在手机桌面添加并调整尺寸？</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`w-4 h-4 text-[var(--tm-text-muted)] transition-transform duration-150 shrink-0 ${
              showGuide ? 'rotate-180 text-[var(--tm-accent-text)]' : ''
            }`}
          />
        </button>
        {showGuide && (
          <div className="text-xs text-[var(--tm-text-muted)] leading-relaxed mt-1.5 space-y-1.5">
            <p>
              1. 长按 Android 手机主屏幕空白处，轻触「微件 / 小组件」，搜索{' '}
              <strong className="text-[var(--tm-text-primary)]">Token Monitor</strong>。
            </p>
            <p>
              2. 选择「紧凑速览」「今日用量」「多周期总览」或「额度监控」拖到桌面，长按卡片拖动边框即可切换小、中、大布局。
            </p>
            <p className="text-[11.5px] text-[var(--tm-text-muted)]">
              微件共用系统每 30 分钟后台调度与前台刷新，仅缓存在本机的有界日期摘要，不保存会话标题、设备名或账户邮箱。
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
