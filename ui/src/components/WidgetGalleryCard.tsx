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
import { formatShortTime, providerName } from '../utils/formatters';

type WidgetKindId = 'compact' | 'today' | 'periods' | 'quota';
type WidgetSizeId = '2x1' | '2x2' | '4x2' | '4x3';

interface WidgetGalleryCardProps {
  stats: MonitorStats | null;
  connected: boolean;
  fetchedAt: number;
}

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
    const hasData = Boolean(stats?.periods?.today) && fetchedAt > 0;
    const today = stats?.periods?.today || null;
    const month = stats?.periods?.month || null;
    const allTime = stats?.periods?.allTime || null;
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
    const cachePct = hasData && components ? Math.min(100, Math.max(0, Number(components.cachePercent))) : null;
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
    const sevenDayStr = hasData && history.sevenDayTokens !== null ? MonitorModel.compact(history.sevenDayTokens) : '—';
    const peakDayStr = hasData && history.peakDayTokens !== null ? MonitorModel.compact(history.peakDayTokens) : '—';

    const clientRows = hasData && today ? MonitorModel.breakdown(today, 'clients').slice(0, 3) : [];
    const topToolsStr =
      clientRows.length > 0
        ? clientRows
            .map((r) => `${providerName(r.id)} ${MonitorModel.compact(r.tokens)}`)
            .join(' · ')
        : '—';

    const providers = stats?.limits?.providers || [];
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
        for (const win of prov.windows || []) {
          const q = MonitorModel.quota(prov, win);
          if (q.percent === null) continue;
          const usedPct = Math.round(q.remaining ? 100 - q.percent : q.percent);
          if (usedPct >= 85) high = true;
          const wKind =
            ({
              session: '会话',
              weekly: '周度',
              daily: '每日',
              monthly: '月度',
              billing: '账期',
              credits: '额度',
            } as Record<string, string>)[win.kind || ''] || '配额';
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
      ? new Date(fetchedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace('/', '-')
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
  }, [stats, connected, fetchedAt]);

  return (
    <section id="widget-gallery" className="glass-panel rounded-3xl p-5 space-y-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-sky-500/12 border border-sky-400/25 flex items-center justify-center text-sky-300 shrink-0">
            <LayoutGrid className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100">桌面微件卡片</h3>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              4 种卡片主题 · 支持 2×1 至 4×3 自由缩放
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-400/25 text-[10px] font-semibold text-sky-300 shrink-0">
          <Maximize2 className="w-3 h-3" />
          <span>自适应尺寸</span>
        </span>
      </div>

      <div
        className="grid grid-cols-2 gap-1.5"
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
              className={`min-h-[44px] px-3 py-2 rounded-2xl border text-left transition-all ${
                active
                  ? 'bg-sky-500/14 border-sky-400/40 text-white shadow-[0_0_16px_rgba(56,189,248,0.12)]'
                  : 'glass-inset text-slate-300 hover:border-white/15'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold truncate">{item.title}</span>
                <span className="text-[10px] font-mono-tabular text-sky-300/90 shrink-0">
                  {item.badge}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-slate-400 flex-1 min-w-[160px] leading-snug">
          {activeMeta.desc}
        </p>
        <div
          className="inline-flex rounded-xl glass-inset p-0.5 shrink-0"
          role="group"
          aria-label="切换微件尺寸"
        >
          {activeMeta.sizes.map((s) => {
            const active = size === s.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSize(s.id)}
                className={`min-h-[30px] px-2.5 rounded-lg text-[10px] font-semibold font-mono-tabular transition-colors ${
                  active
                    ? 'bg-sky-400/20 text-sky-200 border border-sky-400/35'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Simulated Launcher Canvas */}
      <div className="rounded-2xl bg-[#06090D] border border-white/[0.06] p-3.5 flex justify-center">
        {kind === 'compact' && size === '2x1' && (
          <div className="w-full max-w-[230px] rounded-[20px] bg-gradient-to-br from-[#1B3043] via-[#111D29] to-[#101B22] border border-[#385367] px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-lg">
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 truncate">
                {preview.hasData ? `${preview.dateTag} · 今日` : '今日用量'}
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5 font-mono-tabular">
                <span className="text-lg font-bold text-slate-50 leading-none">
                  {preview.todayTokens}
                </span>
                <span className="text-[11px] font-medium text-emerald-300 truncate">
                  {!connected ? '连接 Hub' : preview.todayCost}
                </span>
              </div>
            </div>
            <div
              aria-hidden="true"
              className="w-7 h-7 rounded-xl bg-[#152F43] border border-[#2C536A] flex items-center justify-center text-sky-300 shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
            </div>
          </div>
        )}

        {(kind === 'compact' || kind === 'today' || kind === 'periods') && size === '2x2' && (
          <div className="w-full max-w-[215px] rounded-[22px] bg-gradient-to-br from-[#1B3043] via-[#111D29] to-[#101B22] border border-[#385367] p-3.5 space-y-2 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-sky-200 truncate">
                {preview.hasData ? `${preview.dateTag} · 今日` : '今日用量'}
              </span>
              <span
                aria-hidden="true"
                className="w-6 h-6 rounded-lg bg-[#152F43] border border-[#2C536A] flex items-center justify-center text-sky-300"
              >
                <RefreshCw className="w-3 h-3" />
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 py-1 font-mono-tabular">
              <span className="text-2xl font-bold text-slate-50 leading-none">
                {preview.todayTokens}
              </span>
              <span className="text-[10px] text-slate-400">tokens</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono-tabular">
              <div>
                <div className="text-[10px] text-slate-400">
                  {preview.partialCost ? '费用小计' : '今日费用'}
                </div>
                <div className="text-emerald-300 font-semibold mt-0.5">{preview.todayCost}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">本月</div>
                <div className="text-sky-300 font-semibold mt-0.5">{preview.monthTokens}</div>
              </div>
            </div>
            <div className="text-[9px] text-slate-400 truncate pt-0.5">{preview.footer}</div>
          </div>
        )}

        {(kind === 'today' || kind === 'compact') && (size === '4x2' || size === '4x3') && (
          <div className="w-full rounded-[22px] bg-gradient-to-br from-[#1B3043] via-[#111D29] to-[#101B22] border border-[#385367] p-3.5 space-y-2.5 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold tracking-widest text-sky-200">
                TOKEN MONITOR
              </span>
              <span
                aria-hidden="true"
                className="px-2.5 py-1 rounded-xl bg-[#152F43] border border-[#2C536A] inline-flex items-center gap-1 text-[10px] text-sky-300"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>刷新</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
              <span>{preview.hasData ? `${preview.dateTag} · 今日用量` : '今日用量'}</span>
              {size === '4x3' && preview.inStr !== '—' && (
                <span className="font-mono-tabular">
                  输入 {preview.inStr} · 输出 {preview.outStr}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 py-0.5 font-mono-tabular">
              <span className="text-3xl font-bold text-slate-50 leading-none">
                {preview.todayTokens}
              </span>
              <span className="text-[11px] text-slate-400">tokens</span>
            </div>
            {size === '4x3' && preview.cachePct !== null && (
              <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
                <div
                  style={{ width: `${Math.max(2, preview.cachePct)}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400"
                />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#0C141D] border border-[#233749] px-2.5 py-2 font-mono-tabular">
              <div>
                <div className="text-[10px] text-slate-400 truncate">
                  {preview.partialCost ? '费用小计 · USD' : '费用 · USD'}
                </div>
                <div className="text-xs font-semibold text-slate-100 mt-0.5">{preview.todayCost}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 truncate">缓存占比</div>
                <div className="text-xs font-semibold text-emerald-300 mt-0.5">{preview.cacheStr}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 truncate">近期设备</div>
                <div className="text-xs font-semibold text-sky-300 mt-0.5">{preview.devicesStr}</div>
              </div>
            </div>
            {size === '4x3' && (
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-slate-400 shrink-0">主要工具</span>
                <span className="text-slate-200 font-mono-tabular truncate">
                  {preview.topToolsStr}
                </span>
              </div>
            )}
            <div className="text-[10px] text-slate-400 truncate">{preview.footer}</div>
          </div>
        )}

        {kind === 'periods' && (size === '4x2' || size === '4x3') && (
          <div className="w-full rounded-[22px] bg-gradient-to-br from-[#1B3043] via-[#111D29] to-[#101B22] border border-[#385367] p-3.5 space-y-2.5 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold tracking-wider text-sky-200 flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-sky-400" />
                <span>TOKEN MONITOR · 多周期</span>
              </span>
              <span
                aria-hidden="true"
                className="px-2.5 py-1 rounded-xl bg-[#152F43] border border-[#2C536A] inline-flex items-center gap-1 text-[10px] text-sky-300"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>刷新</span>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 font-mono-tabular">
              <div className="rounded-xl bg-[#0C141D] border border-[#233749] p-2.5">
                <div className="text-[10px] text-sky-200 truncate">
                  {preview.hasData ? `今日 · ${preview.dateTag}` : '今日'}
                </div>
                <div className="text-base font-bold text-slate-50 mt-1">{preview.todayTokens}</div>
                <div className="text-[10px] text-emerald-300 mt-0.5">{preview.todayCost}</div>
              </div>
              <div className="rounded-xl bg-[#0C141D] border border-[#233749] p-2.5">
                <div className="text-[10px] text-slate-400">本月</div>
                <div className="text-base font-bold text-sky-300 mt-1">{preview.monthTokens}</div>
                <div className="text-[10px] text-slate-300 mt-0.5">{preview.monthCost}</div>
              </div>
              <div className="rounded-xl bg-[#0C141D] border border-[#233749] p-2.5">
                <div className="text-[10px] text-slate-400">累计</div>
                <div className="text-base font-bold text-violet-300 mt-1">{preview.allTokens}</div>
                <div className="text-[10px] text-slate-300 mt-0.5">{preview.allCost}</div>
              </div>
            </div>

            {size === '4x3' && (
              <>
                <div className="grid grid-cols-4 gap-1.5 pt-0.5 font-mono-tabular text-[11px]">
                  <div>
                    <div className="text-[9px] text-slate-400">{preview.sevenDayDays > 0 && preview.sevenDayDays < 7 ? '7日小计' : '近 7 日总量'}</div>
                    <div className="text-slate-100 font-semibold mt-0.5" aria-label={`近7日有${preview.sevenDayDays}天读数，缺失日期不补零：${preview.sevenDayStr}`}>{preview.sevenDayStr}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400">14日峰值</div>
                    <div className="text-sky-300 font-semibold mt-0.5">{preview.peakDayStr}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400">缓存占比</div>
                    <div className="text-emerald-300 font-semibold mt-0.5">{preview.cacheStr}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400">近期设备</div>
                    <div className="text-sky-200 font-semibold mt-0.5">{preview.devicesStr}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-slate-400 shrink-0">主要工具</span>
                  <span className="text-slate-200 font-mono-tabular truncate">
                    {preview.topToolsStr}
                  </span>
                </div>
              </>
            )}

            <div className="text-[10px] text-slate-400 truncate">{preview.footer}</div>
          </div>
        )}

        {kind === 'quota' && (
          <div
            className={`w-full ${
              size === '2x2' ? 'max-w-[215px]' : ''
            } rounded-[22px] bg-gradient-to-br from-[#1B3043] via-[#111D29] to-[#101B22] border border-[#385367] p-3.5 space-y-2.5 shadow-lg`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold tracking-wider text-sky-200 flex items-center gap-1.5">
                <Gauge className="w-3 h-3 text-sky-400" />
                <span>{size === '2x2' ? '额度监控' : 'TOKEN MONITOR · 额度'}</span>
              </span>
              {size !== '2x2' && preview.hasData && preview.totalAccounts > 0 && (
                <span
                  className={`text-[10px] font-mono-tabular ${
                    preview.alertAccounts > 0 ? 'text-amber-300' : 'text-emerald-300'
                  }`}
                >
                  正常 {preview.healthyAccounts}/{preview.totalAccounts}
                  {preview.alertAccounts > 0 ? ` · 关注 ${preview.alertAccounts}` : ''}
                </span>
              )}
              <span
                aria-hidden="true"
                className="w-6 h-6 rounded-lg bg-[#152F43] border border-[#2C536A] flex items-center justify-center text-sky-300 shrink-0"
              >
                <RefreshCw className="w-3 h-3" />
              </span>
            </div>

            {size === '2x2' && (
              <div
                className={`text-lg font-bold font-mono-tabular ${
                  preview.hasData && preview.alertAccounts > 0 ? 'text-amber-300' : 'text-slate-50'
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
              <div className="text-xs text-slate-400 py-2">暂无可量化的配额窗口读数</div>
            ) : (
              <div className="space-y-1.5">
                {preview.quotaRows
                  .slice(0, size === '2x2' ? 1 : size === '4x2' ? 2 : 3)
                  .map((qRow, idx) => (
                    <div
                      key={`${qRow.label}-${idx}`}
                      className="rounded-xl bg-[#0C141D] border border-[#233749] px-2.5 py-2 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-100 truncate">{qRow.label}</span>
                        <span
                          className={`font-mono-tabular font-semibold shrink-0 ${
                            qRow.warn ? 'text-amber-300' : 'text-sky-300'
                          }`}
                        >
                          {qRow.pct}% 已用
                        </span>
                      </div>
                      <div
                        className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden"
                        aria-hidden="true"
                      >
                        <div
                          style={{ width: `${Math.max(2, qRow.pct)}%` }}
                          className={`h-full rounded-full ${
                            qRow.warn
                              ? 'bg-gradient-to-r from-amber-400 to-rose-400'
                              : 'bg-gradient-to-r from-sky-400 to-emerald-400'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
              <span className="truncate">{preview.footer}</span>
              {size === '4x3' && (
                <span className="font-mono-tabular text-sky-300 shrink-0">
                  设备 {preview.devicesStr}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="pt-1 border-t border-white/6">
        <button
          type="button"
          onClick={() => setShowGuide((prev) => !prev)}
          aria-expanded={showGuide}
          className="w-full min-h-[38px] flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <span className="inline-flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-sky-400" />
            <span>如何在手机桌面添加并调整尺寸？</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-150 ${
              showGuide ? 'rotate-180 text-sky-400' : ''
            }`}
          />
        </button>
        {showGuide && (
          <div className="text-xs text-slate-400 leading-relaxed mt-1.5 space-y-1.5">
            <p>
              1. 长按 Android 手机主屏幕空白处，轻触「微件 / 小组件」，搜索 <strong className="text-slate-200">Token Monitor</strong>。
            </p>
            <p>
              2. 选择「紧凑速览」「今日用量」「多周期总览」或「额度监控」拖到桌面，长按卡片拖动边框即可切换小、中、大布局。
            </p>
            <p className="text-[11px] text-slate-400/85">
              微件共用系统每 30 分钟后台调度与前台刷新，仅缓存在本机的有界日期摘要，不保存会话标题、设备名或账户邮箱。
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
