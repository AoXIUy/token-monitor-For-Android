import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Bot,
  ChevronDown,
  Code2,
  FileText,
  FolderGit2,
  Info,
  Laptop,
  Layers,
  MessageCircle,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { MonitorModel } from '../model/monitorModel';
import { reportErrorLabel } from '../reportsState';
import type { LimitProvider, ReportGranularity, ReportsState } from '../types/monitor';
import {
  clientName,
  clientTone,
  formatExact,
  formatShortTime,
  limitStatusLabel,
  providerName,
} from '../utils/formatters';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { ReportWindowTab } from './ReportWindowDialog';
import {
  CopyButton,
  InlineAlert,
  ProgressMeter,
  SectionHeader,
  SegmentedControl,
} from './ui/Primitives';

interface ReportsViewProps {
  reports: ReportsState;
  providers?: LimitProvider[];
  connected: boolean;
  foreground: boolean;
  onBack: () => void;
  onSelectGranularity: (granularity: ReportGranularity) => void;
  onSelectPeriodKey: (granularity: ReportGranularity, periodKey: string) => void;
  onRefresh: (granularity: ReportGranularity, periodKey: string) => void;
  onOpenWindow: (tab: ReportWindowTab) => void;
  onCancel: () => void;
}

const GRANULARITY_TABS: Array<{ id: ReportGranularity; label: string }> = [
  { id: 'daily', label: '日报' },
  { id: 'weekly', label: '周报' },
  { id: 'monthly', label: '月报' },
];

const ATTRIBUTION_SOURCE_LABELS: Record<string, string> = {
  'live-period': '实时周期快照',
  'daily-snapshots': '逐日项目快照',
  'session-window': '会话时间窗归因',
  partial: '部分项目归因',
  none: '暂无项目归因',
};

const TIMELINE_COLLAPSED_LIMIT = 10;

function formatDeltaPct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function formatDurationMs(ms: number): string {
  if (!ms || ms <= 0) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} 分钟`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours} 小时 ${remMins} 分` : `${hours} 小时`;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  reports,
  providers = [],
  connected,
  foreground,
  onBack,
  onSelectGranularity,
  onSelectPeriodKey,
  onRefresh,
  onOpenWindow,
  onCancel,
}) => {
  const [viewMode, setViewMode] = useState<'structured' | 'markdown'>('structured');
  const [markdownSubMode, setMarkdownSubMode] = useState<'rendered' | 'source'>('rendered');
  const [showAllTimeline, setShowAllTimeline] = useState(false);

  useEffect(() => {
    if (!foreground) return;
    onRefresh(reports.granularity, reports.periodKey || 'current');
    return () => {
      onCancel();
    };
    // Trigger on entry / connection / foreground changes via explicit callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foreground, connected]);

  useEffect(() => {
    setShowAllTimeline(false);
  }, [reports.granularity, reports.periodKey]);

  const matchingArchiveItems = useMemo(
    () => reports.items.filter((item) => item.granularity === reports.granularity),
    [reports.items, reports.granularity],
  );

  const aiReadyArchiveCount = useMemo(
    () => matchingArchiveItems.filter((item) => item.hasAiAnalysis).length,
    [matchingArchiveItems],
  );

  const periodChoices = useMemo(() => {
    const choices: Array<{
      key: string;
      label: string;
      isCurrentOption?: boolean;
      hasAiAnalysis?: boolean;
    }> = [{ key: 'current', label: '当期实时', isCurrentOption: true }];
    const seen = new Set<string>(['current']);
    for (const item of matchingArchiveItems) {
      if (seen.has(item.periodKey)) continue;
      seen.add(item.periodKey);
      choices.push({
        key: item.periodKey,
        label: item.periodKey,
        hasAiAnalysis: Boolean(item.hasAiAnalysis),
      });
    }
    return choices;
  }, [matchingArchiveItems]);

  const report = reports.report;
  const isLoading = reports.detailLoading || reports.listLoading;
  const activeError =
    reports.detailError || (!report && reports.listError ? reports.listError : '');
  const activeGranularityLabel =
    GRANULARITY_TABS.find((t) => t.id === reports.granularity)?.label || reports.granularity;

  const thirdPartyProviders = useMemo(
    () =>
      providers.filter(
        (p) =>
          p.provider === 'thirdparty' ||
          (p.balance && p.balance.amount !== null && p.balance.amount !== undefined),
      ),
    [providers],
  );

  const timelineMaxTokens = useMemo(() => {
    if (!report?.timeline?.length) return 0;
    return Math.max(1, ...report.timeline.map((row) => row.tokens));
  }, [report]);

  const timelineRows = useMemo(() => {
    if (!report?.timeline?.length) return [];
    if (showAllTimeline || report.timeline.length <= TIMELINE_COLLAPSED_LIMIT) {
      return report.timeline;
    }
    return report.timeline.slice(-TIMELINE_COLLAPSED_LIMIT);
  }, [report, showAllTimeline]);

  const preferredWindowTab: ReportWindowTab =
    viewMode === 'markdown'
      ? 'rendered'
      : reports.aiAnalysis?.summaryMarkdown
        ? 'ai'
        : 'rendered';

  return (
    <div id="reports-view" className="space-y-3.5">
      {/* 顶部操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          id="reports-back"
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-3.5 py-2 rounded-full glass-pill-bar hover:border-white/25 active:scale-[0.98] inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 transition-all whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>返回总览</span>
        </button>

        <div className="flex items-center gap-2 min-w-0 flex-wrap justify-end">
          <button
            id="reports-open-window"
            type="button"
            onClick={() => onOpenWindow(preferredWindowTab)}
            className="min-h-[44px] px-3.5 py-2 rounded-full bg-sky-500/15 hover:bg-sky-500/24 active:scale-[0.98] border border-sky-400/35 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-100 transition-all whitespace-nowrap shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-300" />
            <span>报告窗口</span>
          </button>

          <button
            id="reports-refresh"
            type="button"
            disabled={isLoading}
            onClick={() => onRefresh(reports.granularity, reports.periodKey || 'current')}
            aria-label="刷新分析报告"
            className="min-h-[44px] px-3.5 py-2 rounded-full glass-pill-bar hover:border-white/25 active:scale-[0.98] inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 disabled:opacity-45 transition-all whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* 日/周/月分段切换 */}
      <div
        id="reports-granularity-tabs"
        role="tablist"
        aria-label="报告周期类型"
        className="glass-inset p-1 rounded-2xl flex gap-1"
      >
        {GRANULARITY_TABS.map((tab) => {
          const active = reports.granularity === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-report-granularity={tab.id}
              aria-selected={active}
              onClick={() => onSelectGranularity(tab.id)}
              className={`flex-1 min-h-[40px] rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap active:scale-[0.98] ${
                active
                  ? 'bg-slate-800/95 text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] border border-white/12'
                  : 'border border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 独立全宽可滚动期次选择条 + 归档/视图模式行 */}
      <div className="space-y-2">
        <div className="relative">
          <div
            id="reports-period-chips"
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 pr-5"
          >
            {periodChoices.map((choice) => {
              const active = (reports.periodKey || 'current') === choice.key;
              return (
                <button
                  key={choice.key}
                  type="button"
                  data-report-period={choice.key}
                  aria-pressed={active}
                  onClick={() => onSelectPeriodKey(reports.granularity, choice.key)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all active:scale-[0.98] border inline-flex items-center gap-1.5 tabular-nums ${
                    active
                      ? 'bg-sky-400/20 text-sky-100 border-sky-400/40'
                      : 'bg-white/[0.04] text-slate-300 border-white/[0.08] hover:text-white'
                  }`}
                >
                  {choice.hasAiAnalysis && (
                    <i
                      aria-hidden="true"
                      title="包含 AI 智能分析"
                      className="w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.8)] shrink-0"
                    />
                  )}
                  <span>{choice.label}</span>
                </button>
              );
            })}
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#090C10] to-transparent"
          />
        </div>

        {/* 归档覆盖率摘要与图表/排版切换 */}
        <div
          id="reports-archive-summary"
          className="rounded-2xl bg-white/[0.03] border border-white/[0.08] px-3 py-2 flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap text-[11px] text-slate-300 tabular-nums">
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <Archive className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {activeGranularityLabel}归档{' '}
                <strong className="text-slate-100 font-semibold">
                  {matchingArchiveItems.length}
                </strong>{' '}
                期 · AI{' '}
                <strong className="text-violet-300 font-semibold">{aiReadyArchiveCount}</strong> 期
              </span>
            </span>
            <span className="text-[11px] text-slate-400 shrink-0 inline-flex items-center gap-1">
              <i aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              <span>含 AI 总结</span>
            </span>
          </div>

          <SegmentedControl<'structured' | 'markdown'>
            ariaLabel="切换图表或排版报告视图"
            size="md"
            tone="accent"
            fullWidth={false}
            value={viewMode}
            onChange={setViewMode}
            className="shrink-0"
            options={[
              {
                value: 'structured',
                label: (
                  <span className="inline-flex items-center gap-1 px-1">
                    <BarChart3 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>图表</span>
                  </span>
                ),
                dataAttrs: { 'data-report-view-mode': 'structured' },
              },
              {
                value: 'markdown',
                label: (
                  <span className="inline-flex items-center gap-1 px-1">
                    <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>排版报告</span>
                  </span>
                ),
                dataAttrs: { 'data-report-view-mode': 'markdown' },
              },
            ]}
          />
        </div>
      </div>

      {/* OpenClaw 微信接入状态 */}
      {reports.integrations?.openclaw?.enabled && (
        <InlineAlert
          id="reports-openclaw-status"
          tone="emerald"
          icon={<MessageCircle className="w-4 h-4" />}
          action={
            reports.integrations.lastPush ? (
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 border ${
                  reports.integrations.lastPush.ok
                    ? 'bg-emerald-400/15 text-emerald-200 border-emerald-400/30'
                    : 'bg-rose-500/15 text-rose-200 border-rose-400/30'
                }`}
              >
                {reports.integrations.lastPush.ok ? '已触达' : '待排查'}
              </span>
            ) : undefined
          }
        >
          <p className="font-semibold text-emerald-100 break-words">
            OpenClaw 微信通道已接入 · {reports.integrations.openclaw.channel || 'openclaw-weixin'}
            {reports.integrations.openclaw.pushOnRollover ? '（周期自动推送）' : ''}
          </p>
          {reports.integrations.lastPush && (
            <p className="text-[11px] text-emerald-200/85 tabular-nums mt-0.5 break-words">
              {reports.integrations.lastPush.ok
                ? `最近推送成功 · ${formatShortTime(reports.integrations.lastPush.at)}`
                : `最近推送失败：${reports.integrations.lastPush.message || reports.integrations.lastPush.error || 'error'}`}
            </p>
          )}
        </InlineAlert>
      )}

      {/* 主 Hub 自动报告状态提示 */}
      {reports.config && !reports.config.enabled && (
        <InlineAlert tone="amber" icon={<Info className="w-4 h-4" />}>
          主 Hub 尚未开启自动定期归档。以下展示即时汇总结果；如需保留长期逐日项目快照与历史周/月归档，请在桌面端 Host 或 Node Hub 开启报告功能。
        </InlineAlert>
      )}

      {/* 错误状态 */}
      {activeError && (
        <InlineAlert id="reports-error" tone="rose" role="status">
          {reportErrorLabel(activeError)}
        </InlineAlert>
      )}

      {/* 加载骨架 */}
      {!report && isLoading && (
        <div className="glass-panel rounded-3xl p-8 text-center space-y-2.5">
          <RefreshCw className="w-6 h-6 text-sky-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-300">正在向主 Hub 读取标准分析报告…</p>
        </div>
      )}

      {/* 排版报告 / Markdown 模式 */}
      {report && viewMode === 'markdown' && (
        <section className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5">
          <SectionHeader
            headingLevel="h2"
            icon={<FileText className="w-4 h-4" />}
            title={`标准 Markdown 报告 (${report.reportId})`}
            subtitle={`${report.schema} · 支持排版精读与源码复制`}
            action={
              <button
                id="reports-open-doc-window"
                type="button"
                onClick={() => onOpenWindow('rendered')}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-sky-400/15 hover:bg-sky-400/25 active:scale-[0.98] border border-sky-400/30 text-xs font-semibold text-sky-200 shrink-0 inline-flex items-center gap-1.5 transition-all"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>精读</span>
              </button>
            }
          />

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex rounded-xl glass-inset p-0.5 gap-0.5">
              <button
                id="reports-markdown-rendered-toggle"
                type="button"
                aria-pressed={markdownSubMode === 'rendered'}
                onClick={() => setMarkdownSubMode('rendered')}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.98] ${
                  markdownSubMode === 'rendered'
                    ? 'bg-sky-400/20 text-sky-100 border border-sky-400/35'
                    : 'border border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>排版阅读</span>
              </button>
              <button
                id="reports-markdown-source-toggle"
                type="button"
                aria-pressed={markdownSubMode === 'source'}
                onClick={() => setMarkdownSubMode('source')}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.98] ${
                  markdownSubMode === 'source'
                    ? 'bg-sky-400/20 text-sky-100 border border-sky-400/35'
                    : 'border border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>原始 MD</span>
              </button>
            </div>

            <CopyButton
              id="reports-copy-markdown"
              text={reports.markdown}
              ariaLabel="复制报告 Markdown 全文"
              label="复制全文"
              copiedLabel="已复制"
              className="min-h-[38px] px-3 text-xs"
            />
          </div>

          {markdownSubMode === 'rendered' ? (
            <div id="reports-markdown-rendered" className="glass-inset rounded-2xl p-3.5 sm:p-4">
              <MarkdownRenderer
                markdown={reports.markdown}
                variant="reader"
                showFrontmatter
                accent="sky"
                idPrefix="reports-doc"
                emptyText="当前响应未包含 Markdown 文本。"
              />
            </div>
          ) : (
            <pre
              id="reports-markdown-pre"
              className="glass-inset rounded-2xl p-3.5 text-[11.5px] leading-relaxed font-mono-tabular text-slate-200 overflow-x-auto whitespace-pre-wrap break-words max-h-[65vh] select-text"
            >
              {reports.markdown || '当前响应未包含 Markdown 文本。'}
            </pre>
          )}
        </section>
      )}

      {/* 结构化图表分析模式 */}
      {report && viewMode === 'structured' && (
        <div className="space-y-3.5">
          {/* 1. 核心总览 */}
          <section
            id="reports-summary-card"
            className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-400/15 text-sky-200 border border-sky-400/25">
                  {activeGranularityLabel}
                </span>
                {report.period.isCurrent && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-400/15 text-emerald-200 border border-emerald-400/25">
                    进行中
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.06] text-slate-300">
                  {ATTRIBUTION_SOURCE_LABELS[report.coverage.projectAttributionSource] ||
                    report.coverage.projectAttributionSource}
                </span>
              </div>
              <h2 className="text-base font-bold text-white tracking-tight break-words">
                {report.period.label || report.period.key}
              </h2>
              <p className="text-[11px] text-slate-400 tabular-nums break-words">
                {report.period.startDate} ~ {report.period.endDate} · 生成于{' '}
                {formatShortTime(report.period.generatedAt)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="glass-inset rounded-2xl p-3 space-y-1 min-w-0">
                <p className="text-[11px] text-slate-400">总 Token 消耗</p>
                <p className="text-lg font-bold font-mono-tabular text-white truncate">
                  {MonitorModel.compact(report.summary.totalTokens)}
                </p>
                <p className="text-[11px] tabular-nums text-slate-400 truncate">
                  {formatExact(report.summary.totalTokens)} tokens
                </p>
              </div>

              <div className="glass-inset rounded-2xl p-3 space-y-1 min-w-0">
                <p className="text-[11px] text-slate-400">已知费用</p>
                <p className="text-lg font-bold font-mono-tabular text-emerald-300 truncate">
                  {MonitorModel.money(report.summary.knownCostUsd)}
                </p>
                <p className="text-[11px] tabular-nums text-slate-400 truncate">
                  {report.summary.unpricedTokens > 0
                    ? `含未定价 ${MonitorModel.compact(report.summary.unpricedTokens)}`
                    : '全部已定价'}
                </p>
              </div>
            </div>

            {report.summary.comparison && (
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs">
                <span className="text-slate-400 min-w-0 break-words">
                  较上期（{report.summary.comparison.previousPeriodKey}）
                </span>
                <div className="flex items-center gap-3 tabular-nums flex-wrap shrink-0">
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      (report.summary.comparison.tokenDelta || 0) >= 0
                        ? 'text-sky-300'
                        : 'text-emerald-300'
                    }`}
                  >
                    {(report.summary.comparison.tokenDelta || 0) >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                    )}
                    Token {formatDeltaPct(report.summary.comparison.tokenDeltaPct)}
                  </span>
                  <span className="text-slate-200">
                    费用 {formatDeltaPct(report.summary.comparison.costDeltaPct)}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] py-2.5 px-2 min-w-0">
                <p className="text-[11px] text-slate-400 truncate">缓存命中率</p>
                <p className="text-xs font-bold font-mono-tabular text-sky-300 mt-0.5 truncate">
                  {report.summary.cacheHitRatePct !== null
                    ? `${report.summary.cacheHitRatePct.toFixed(1)}%`
                    : '—'}
                </p>
              </div>
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] py-2.5 px-2 min-w-0">
                <p className="text-[11px] text-slate-400 truncate">平均速率</p>
                <p className="text-xs font-bold tabular-nums text-slate-100 mt-0.5 truncate">
                  {report.summary.throughput.avgOutputTokensPerSec !== null
                    ? `${report.summary.throughput.avgOutputTokensPerSec.toFixed(1)} tok/s`
                    : '—'}
                </p>
              </div>
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] py-2.5 px-2 min-w-0">
                <p className="text-[11px] text-slate-400 truncate">活跃 / 项目</p>
                <p className="text-xs font-bold tabular-nums text-slate-100 mt-0.5 truncate">
                  {report.summary.activeDays} 天 · {report.summary.projectCount} 项
                </p>
              </div>
            </div>

            {report.summary.peakDay && (
              <div className="text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-0.5 tabular-nums">
                <span className="min-w-0 break-words">
                  峰值日：
                  <span className="font-mono-tabular text-slate-200">
                    {report.summary.peakDay.date}
                  </span>
                  （{MonitorModel.compact(report.summary.peakDay.tokens)} ·{' '}
                  {MonitorModel.money(report.summary.peakDay.costUsd)}）
                </span>
                <span className="shrink-0 text-slate-300">
                  {formatDurationMs(report.summary.activeTimeMs)}
                </span>
              </div>
            )}
          </section>

          {/* 1.5 第三方 AI API 智能分析总结 */}
          {(reports.aiAnalysis || reports.integrations?.ai?.enabled) && (
            <section
              id="reports-ai-analysis"
              className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3 border-violet-400/20"
            >
              <SectionHeader
                icon={<Bot className="w-4 h-4 text-violet-300" />}
                title="第三方 AI 智能分析"
                subtitle={
                  reports.aiAnalysis
                    ? `${reports.aiAnalysis.providerLabel || reports.aiAnalysis.protocol} · ${reports.aiAnalysis.model} · ${formatShortTime(reports.aiAnalysis.generatedAt)}`
                    : `${reports.integrations?.ai?.providerLabel || reports.integrations?.ai?.protocol || 'AI'} · ${reports.integrations?.ai?.model || '未配置模型'}`
                }
                badge={
                  <>
                    {reports.aiAnalysis?.stale && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-400/25">
                        数据已更新
                      </span>
                    )}
                    {reports.aiAnalysis?.tokenUsage && (
                      <span
                        title={`输入 ${formatExact(reports.aiAnalysis.tokenUsage.inputTokens)} · 输出 ${formatExact(reports.aiAnalysis.tokenUsage.outputTokens)}`}
                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums bg-violet-400/15 text-violet-200 border border-violet-400/25"
                      >
                        {MonitorModel.compact(reports.aiAnalysis.tokenUsage.totalTokens)} tok
                      </span>
                    )}
                  </>
                }
              />

              <div className="flex items-center justify-end gap-2 flex-wrap">
                <button
                  id="reports-open-ai-window"
                  type="button"
                  onClick={() => onOpenWindow('ai')}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 active:scale-[0.98] border border-violet-400/35 text-xs font-semibold text-violet-100 inline-flex items-center gap-1.5 transition-all"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>精读</span>
                </button>
                {reports.aiAnalysis?.summaryMarkdown && (
                  <CopyButton
                    id="reports-copy-ai"
                    text={reports.aiAnalysis.summaryMarkdown}
                    ariaLabel="复制 AI 智能分析"
                    label="复制分析"
                    copiedLabel="已复制"
                    className="min-h-[38px] px-3 text-xs"
                  />
                )}
              </div>

              {reports.aiAnalysis?.question && (
                <div className="rounded-2xl bg-violet-500/10 border border-violet-400/25 px-3 py-2 text-xs text-violet-100 leading-relaxed">
                  <span className="font-semibold text-violet-300">分析提问：</span>
                  <span>{reports.aiAnalysis.question}</span>
                </div>
              )}

              {reports.aiAnalysis?.summaryMarkdown ? (
                <div className="glass-inset rounded-2xl p-3.5">
                  <MarkdownRenderer
                    markdown={reports.aiAnalysis.summaryMarkdown}
                    variant="compact"
                    fontScale="sm"
                    accent="violet"
                    idPrefix="reports-ai"
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-400 leading-relaxed">
                  当前周期暂无缓存的 AI 分析结果；可在桌面端设置或 OpenClaw / MCP 对话中触发「AI 智能分析」。
                </p>
              )}
            </section>
          )}

          {/* 1.8 第三方 AI API 与余额快照 */}
          {thirdPartyProviders.length > 0 && (
            <section
              id="reports-thirdparty-quotas"
              className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3"
            >
              <SectionHeader
                icon={<Wallet className="w-4 h-4 text-emerald-400" />}
                title="第三方 AI API 与余额快照"
                action={
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {thirdPartyProviders.length} 个账户
                  </span>
                }
              />
              <div className="space-y-2">
                {thirdPartyProviders.slice(0, 6).map((prov, idx) => {
                  const title =
                    prov.accountLabel ||
                    prov.planLabel ||
                    prov.accountName ||
                    providerName(prov.provider);
                  const currency = prov.balance?.currency || 'USD';
                  const balAmt = prov.balance?.amount;
                  const monthSpend = prov.balance?.monthSpend;
                  const todaySpend = prov.balance?.todaySpend;
                  const statusText = limitStatusLabel(prov);
                  const spendParts: string[] = [];
                  if (todaySpend !== null && todaySpend !== undefined) {
                    spendParts.push(`今日 ${MonitorModel.money(todaySpend, currency)}`);
                  }
                  if (monthSpend !== null && monthSpend !== undefined) {
                    spendParts.push(`本月 ${MonitorModel.money(monthSpend, currency)}`);
                  }
                  if (prov.stale) {
                    spendParts.push('已过期');
                  }
                  return (
                    <div
                      key={`${prov.provider}-${prov.accountKey || title}-${idx}`}
                      className="glass-inset rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-100 truncate">
                          {title}
                          {prov.adapterId ? (
                            <span className="ml-1.5 text-[11px] font-mono-tabular text-sky-300/90">
                              [{prov.adapterId}]
                            </span>
                          ) : null}
                        </p>
                        {spendParts.length > 0 && (
                          <p className="text-[11px] text-slate-400 tabular-nums mt-0.5 truncate">
                            {spendParts.join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold font-mono-tabular text-emerald-300">
                          {balAmt !== null && balAmt !== undefined
                            ? MonitorModel.money(balAmt, currency)
                            : statusText}
                        </p>
                        <p className="text-[11px] text-slate-400">{statusText}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 2. 自动化信号 */}
          {report.signals.length > 0 && (
            <section className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3">
              <SectionHeader
                icon={<Sparkles className="w-4 h-4 text-amber-300" />}
                title="关键特征信号"
              />
              <div className="space-y-2">
                {report.signals.map((signal, idx) => {
                  const isWarn = signal.severity === 'warning' || signal.severity === 'alert';
                  const hasValuePct =
                    signal.valuePct !== undefined &&
                    signal.valuePct !== null &&
                    Number.isFinite(signal.valuePct);
                  return (
                    <div
                      key={`${signal.code}-${idx}`}
                      className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed border flex items-start gap-2.5 ${
                        isWarn
                          ? 'bg-amber-500/10 border-amber-400/25 text-amber-100'
                          : 'bg-sky-500/10 border-sky-400/20 text-sky-100'
                      }`}
                    >
                      {isWarn ? (
                        <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        {(signal.project || signal.model || hasValuePct) && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {signal.project && (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono-tabular font-semibold bg-white/[0.08] text-white/95 max-w-[190px] truncate">
                                {signal.project}
                              </span>
                            )}
                            {signal.model && (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono-tabular bg-white/[0.07] text-slate-200 max-w-[170px] truncate">
                                {signal.model}
                              </span>
                            )}
                            {hasValuePct && (
                              <span
                                className={`px-2 py-0.5 rounded-md text-[11px] font-mono-tabular font-semibold ${
                                  isWarn
                                    ? 'bg-amber-400/20 text-amber-100'
                                    : 'bg-sky-400/20 text-sky-100'
                                }`}
                              >
                                {signal.valuePct! > 0 && signal.code.includes('delta')
                                  ? `+${signal.valuePct!.toFixed(1)}%`
                                  : `${signal.valuePct!.toFixed(1)}%`}
                              </span>
                            )}
                          </div>
                        )}
                        <p className="break-words">{signal.summary}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 3. 项目使用深度分析 */}
          <section
            id="reports-projects-section"
            className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3"
          >
            <SectionHeader
              icon={<FolderGit2 className="w-4 h-4" />}
              title={`项目使用分析 (${report.projects.length})`}
              action={
                !report.coverage.projectsComplete ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/25">
                    部分归因
                  </span>
                ) : undefined
              }
            />

            {report.projects.length > 0 ? (
              <div className="space-y-3">
                {report.projects.map((proj, idx) => (
                  <div
                    key={proj.key || proj.label}
                    data-report-project={proj.key || proj.label}
                    className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-3 space-y-2"
                  >
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="text-[11px] font-mono-tabular text-slate-400 w-5 shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="font-semibold text-slate-100 truncate">{proj.label}</span>
                        <span className="text-[11px] font-mono-tabular text-sky-300 shrink-0">
                          {proj.tokenSharePct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 font-mono-tabular shrink-0">
                        <span className="font-semibold text-slate-100">
                          {MonitorModel.compact(proj.tokens)}
                        </span>
                        <span className="text-[11px] text-emerald-300">
                          {MonitorModel.money(proj.costUsd)}
                        </span>
                      </div>
                    </div>

                    <ProgressMeter
                      percent={proj.tokenSharePct}
                      tone="custom"
                      barClassName="bg-gradient-to-r from-sky-400 to-emerald-400"
                    />

                    {(proj.clients.length > 0 || proj.models.length > 0) && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {proj.clients.slice(0, 3).map((c) => (
                          <span
                            key={c.client}
                            className="px-2 py-0.5 rounded-md bg-white/[0.05] text-[11px] text-slate-300 tabular-nums"
                          >
                            {clientName(c.client)} {c.sharePct.toFixed(0)}%
                          </span>
                        ))}
                        {proj.models.slice(0, 2).map((m) => (
                          <span
                            key={m.model}
                            className="px-2 py-0.5 rounded-md bg-sky-400/10 text-[11px] text-sky-200 font-mono-tabular truncate max-w-[180px]"
                          >
                            {m.model}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs text-slate-400 py-4">
                本周期暂无已归因的项目用量明细
              </p>
            )}
          </section>

          {/* 4. 工具与模型效率 */}
          <section className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5">
            <SectionHeader icon={<Layers className="w-4 h-4" />} title="工具与模型效率" />

            {report.clients.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-[11px] font-medium text-slate-400">AI 编程工具</p>
                {report.clients.map((item) => {
                  const tone = clientTone(item.client);
                  return (
                    <div key={item.client} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <i
                            className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`}
                            aria-hidden="true"
                          />
                          <span className="font-medium text-slate-100 truncate min-w-0">
                            {clientName(item.client)}
                          </span>
                          <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0 whitespace-nowrap">
                            {item.tokenSharePct.toFixed(1)}%
                          </span>
                          {item.cacheHitRatePct !== null && (
                            <span className="text-[11px] tabular-nums text-sky-300 shrink-0 whitespace-nowrap">
                              缓存 {item.cacheHitRatePct.toFixed(0)}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-2 font-mono-tabular shrink-0">
                          <span className="font-semibold text-slate-100">
                            {MonitorModel.compact(item.tokens)}
                          </span>
                          <span className="text-[11px] text-emerald-300">
                            {MonitorModel.money(item.costUsd)}
                          </span>
                        </div>
                      </div>
                      <ProgressMeter
                        percent={item.tokenSharePct}
                        tone="custom"
                        heightClass="h-1"
                        barClassName={`bg-gradient-to-r ${tone.bar}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {report.models.length > 0 && (
              <div className="space-y-2 pt-2.5 border-t border-white/[0.06]">
                <p className="text-[11px] font-medium text-slate-400">主力模型</p>
                <div className="space-y-2">
                  {report.models.slice(0, 8).map((item) => (
                    <div
                      key={item.model}
                      className="flex items-center justify-between gap-2.5 text-xs rounded-xl bg-white/[0.025] px-3 py-2 border border-white/[0.05]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-100 truncate font-mono-tabular">
                          {item.model}
                        </p>
                        <p className="text-[11px] text-slate-400 tabular-nums truncate mt-0.5">
                          占比 {item.tokenSharePct.toFixed(1)}%
                          {item.cacheHitRatePct !== null
                            ? ` · 缓存 ${item.cacheHitRatePct.toFixed(0)}%`
                            : ''}
                          {item.avgOutputTokensPerSec !== null
                            ? ` · ${item.avgOutputTokensPerSec.toFixed(1)} tok/s`
                            : ''}
                        </p>
                      </div>
                      <div className="text-right font-mono-tabular shrink-0">
                        <p className="font-semibold text-slate-100">
                          {MonitorModel.compact(item.tokens)}
                        </p>
                        <p className="text-[11px] text-emerald-300">
                          {MonitorModel.money(item.costUsd)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 5. 时间趋势与设备贡献 */}
          {(report.timeline.length > 1 || report.devices.length > 0) && (
            <section className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5">
              {report.timeline.length > 1 && (
                <div className="space-y-2.5">
                  <SectionHeader
                    title="逐日用量趋势"
                    action={
                      report.timeline.length > TIMELINE_COLLAPSED_LIMIT ? (
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {showAllTimeline
                            ? `全部 ${report.timeline.length} 天`
                            : `近 ${TIMELINE_COLLAPSED_LIMIT} / ${report.timeline.length} 天`}
                        </span>
                      ) : undefined
                    }
                  />
                  <div className="space-y-1.5">
                    {timelineRows.map((row) => {
                      const pct = timelineMaxTokens > 0 ? (row.tokens / timelineMaxTokens) * 100 : 0;
                      return (
                        <div
                          key={row.date}
                          className="flex items-center gap-2 text-[11px] font-mono-tabular"
                        >
                          <span className="text-slate-400 w-11 shrink-0">{row.date.slice(5)}</span>
                          <div className="flex-1 min-w-[36px]">
                            <ProgressMeter
                              percent={row.tokens > 0 ? pct : 0}
                              tone="sky"
                              heightClass="h-2"
                            />
                          </div>
                          <span className="text-slate-200 min-w-[52px] text-right shrink-0 whitespace-nowrap">
                            {MonitorModel.compact(row.tokens)}
                          </span>
                          <span className="text-emerald-300 min-w-[56px] text-right shrink-0 whitespace-nowrap">
                            {MonitorModel.money(row.costUsd)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {report.timeline.length > TIMELINE_COLLAPSED_LIMIT && (
                    <button
                      type="button"
                      aria-expanded={showAllTimeline}
                      onClick={() => setShowAllTimeline((prev) => !prev)}
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.99] border border-white/[0.08] text-xs font-medium text-slate-200 inline-flex items-center justify-center gap-1.5 transition-all"
                    >
                      <span>
                        {showAllTimeline
                          ? `收起至最近 ${TIMELINE_COLLAPSED_LIMIT} 天`
                          : `展开全部 ${report.timeline.length} 天`}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
                          showAllTimeline ? 'rotate-180 text-sky-300' : ''
                        }`}
                      />
                    </button>
                  )}
                </div>
              )}

              {report.devices.length > 0 && (
                <div
                  className={`space-y-2.5 ${
                    report.timeline.length > 1 ? 'pt-3 border-t border-white/[0.06]' : ''
                  }`}
                >
                  <SectionHeader
                    icon={<Laptop className="w-4 h-4" />}
                    title={`设备贡献 (${report.devices.length})`}
                  />
                  <div className="space-y-1.5">
                    {report.devices.map((dev) => (
                      <div
                        key={dev.deviceId}
                        className="flex items-center justify-between gap-2.5 text-xs rounded-xl bg-white/[0.025] px-3 py-2 border border-white/[0.05]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-100 truncate">
                            {dev.hostname || dev.deviceId}
                          </p>
                          <p className="text-[11px] text-slate-400 tabular-nums truncate mt-0.5">
                            {dev.platform || 'unknown'} · 占比 {dev.tokenSharePct.toFixed(1)}%
                            {dev.stale ? ' · 状态过期' : ''}
                          </p>
                        </div>
                        <div className="text-right font-mono-tabular shrink-0">
                          <p className="font-semibold text-slate-100">
                            {MonitorModel.compact(dev.tokens)}
                          </p>
                          <p className="text-[11px] text-emerald-300">
                            {MonitorModel.money(dev.costUsd)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};
