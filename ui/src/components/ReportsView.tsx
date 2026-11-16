import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Bot,
  Check,
  Code2,
  Copy,
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
import { clientName, clientTone, copyTextToClipboard, formatExact, formatShortTime, providerName } from '../utils/formatters';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { ReportWindowTab } from './ReportWindowDialog';

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
  const [copied, setCopied] = useState(false);
  const [aiCopied, setAiCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const aiCopyTimerRef = useRef<number | null>(null);

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
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      if (aiCopyTimerRef.current !== null) window.clearTimeout(aiCopyTimerRef.current);
    };
  }, []);

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
  const activeError = reports.detailError || (!report && reports.listError ? reports.listError : '');
  const activeGranularityLabel =
    GRANULARITY_TABS.find((t) => t.id === reports.granularity)?.label || reports.granularity;

  const handleCopyMarkdown = async () => {
    if (!reports.markdown) return;
    const ok = await copyTextToClipboard(reports.markdown);
    if (ok) {
      setCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleCopyAiSummary = async () => {
    if (!reports.aiAnalysis?.summaryMarkdown) return;
    const ok = await copyTextToClipboard(reports.aiAnalysis.summaryMarkdown);
    if (ok) {
      setAiCopied(true);
      if (aiCopyTimerRef.current !== null) window.clearTimeout(aiCopyTimerRef.current);
      aiCopyTimerRef.current = window.setTimeout(() => setAiCopied(false), 1800);
    }
  };

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

  const preferredWindowTab: ReportWindowTab =
    viewMode === 'markdown'
      ? 'rendered'
      : reports.aiAnalysis?.summaryMarkdown
        ? 'ai'
        : 'rendered';

  return (
    <div id="reports-view" className="space-y-3.5">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between gap-2">
        <button
          id="reports-back"
          type="button"
          onClick={onBack}
          className="min-h-[40px] px-3 py-1.5 rounded-full glass-pill-bar hover:border-white/25 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>返回总览</span>
        </button>

        <div className="flex items-center gap-1.5 min-w-0">
          <button
            id="reports-open-window"
            type="button"
            onClick={() => onOpenWindow(preferredWindowTab)}
            className="min-h-[40px] px-3.5 py-1.5 rounded-full bg-gradient-to-r from-violet-500/25 via-sky-500/20 to-emerald-400/15 hover:from-violet-500/35 hover:to-sky-500/30 border border-sky-400/35 inline-flex items-center gap-1.5 text-xs font-semibold text-white shadow-[0_0_20px_rgba(56,189,248,0.16)] transition-all whitespace-nowrap shrink-0"
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
            className="min-h-[40px] px-3 py-1.5 rounded-full glass-pill-bar hover:border-white/25 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
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
              className={`flex-1 min-h-[40px] rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                active
                  ? 'bg-slate-800/95 text-white shadow-sm border border-white/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 期次选择与视图切换 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div
            id="reports-period-chips"
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0"
          >
            {periodChoices.map((choice) => {
              const active = (reports.periodKey || 'current') === choice.key;
              return (
                <button
                  key={choice.key}
                  type="button"
                  data-report-period={choice.key}
                  onClick={() => onSelectPeriodKey(reports.granularity, choice.key)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors border inline-flex items-center gap-1.5 ${
                    active
                      ? 'bg-sky-400/20 text-sky-200 border-sky-400/40'
                      : 'bg-white/[0.04] text-slate-400 border-white/[0.08] hover:text-slate-200'
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

          <div className="inline-flex rounded-xl bg-white/[0.04] border border-white/[0.08] p-0.5 shrink-0">
            <button
              type="button"
              data-report-view-mode="structured"
              aria-pressed={viewMode === 'structured'}
              onClick={() => setViewMode('structured')}
              className={`min-h-[30px] px-2.5 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1 transition-colors ${
                viewMode === 'structured'
                  ? 'bg-sky-400/20 text-sky-200 border border-sky-400/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3 h-3" />
              <span>图表</span>
            </button>
            <button
              type="button"
              data-report-view-mode="markdown"
              aria-pressed={viewMode === 'markdown'}
              onClick={() => setViewMode('markdown')}
              className={`min-h-[30px] px-2.5 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1 transition-colors ${
                viewMode === 'markdown'
                  ? 'bg-sky-400/20 text-sky-200 border border-sky-400/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3 h-3" />
              <span>排版报告</span>
            </button>
          </div>
        </div>

        {/* 归档与 AI 覆盖率摘要条 */}
        <div
          id="reports-archive-summary"
          className="rounded-2xl bg-white/[0.025] border border-white/[0.07] px-3 py-2 flex items-center justify-between gap-2 text-[11px] text-slate-400"
        >
          <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
            <Archive className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="font-mono-tabular truncate">
              {activeGranularityLabel}已归档{' '}
              <strong className="text-slate-200 font-semibold">{matchingArchiveItems.length}</strong> 期 ·{' '}
              AI 已分析{' '}
              <strong className="text-violet-300 font-semibold">{aiReadyArchiveCount}</strong> 期
            </span>
          </span>
          <span className="text-[10px] text-slate-400 shrink-0 inline-flex items-center gap-1">
            <i aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            <span>含 AI 总结</span>
          </span>
        </div>
      </div>

      {/* OpenClaw 微信接入状态 */}
      {reports.integrations?.openclaw?.enabled && (
        <div
          id="reports-openclaw-status"
          className="rounded-2xl bg-emerald-500/10 border border-emerald-400/25 px-3.5 py-2.5 text-xs text-emerald-100 flex items-center justify-between gap-2.5"
        >
          <div className="flex items-start gap-2 min-w-0">
            <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-0.5">
              <p className="font-semibold text-emerald-200 truncate">
                OpenClaw 微信通道已接入 · {reports.integrations.openclaw.channel || 'openclaw-weixin'}
                {reports.integrations.openclaw.pushOnRollover ? '（周期自动推送）' : ''}
              </p>
              {reports.integrations.lastPush && (
                <p className="text-[11px] text-emerald-200/80 font-mono-tabular truncate">
                  {reports.integrations.lastPush.ok
                    ? `最近推送成功 · ${formatShortTime(reports.integrations.lastPush.at)}`
                    : `最近推送失败：${reports.integrations.lastPush.message || reports.integrations.lastPush.error || 'error'}`}
                </p>
              )}
            </div>
          </div>
          {reports.integrations.lastPush && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 border ${
                reports.integrations.lastPush.ok
                  ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30'
                  : 'bg-rose-500/15 text-rose-300 border-rose-400/30'
              }`}
            >
              {reports.integrations.lastPush.ok ? '已触达' : '待排查'}
            </span>
          )}
        </div>
      )}

      {/* 主 Hub 自动报告状态提示 */}
      {reports.config && !reports.config.enabled && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-400/25 p-3 text-xs text-amber-200 flex items-start gap-2 leading-relaxed">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            主 Hub 尚未开启自动定期归档。以下展示即时汇总结果；如需保留长期逐日项目快照与历史周/月归档，请在桌面端 Host 或 Node Hub 开启报告功能。
          </span>
        </div>
      )}

      {/* 错误状态 */}
      {activeError && (
        <div
          id="reports-error"
          role="status"
          className="rounded-2xl bg-rose-500/12 border border-rose-400/30 p-3.5 text-xs text-rose-200 flex items-start gap-2.5 leading-relaxed"
        >
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{reportErrorLabel(activeError)}</span>
        </div>
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
        <section className="glass-panel rounded-3xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-xs font-semibold text-slate-100 truncate">
                标准 Markdown 报告 ({report.reportId})
              </h2>
              <p className="text-[11px] text-slate-400 font-mono-tabular truncate">
                {report.schema} · 支持排版精读与源码复制
              </p>
            </div>
            <button
              id="reports-open-doc-window"
              type="button"
              onClick={() => onOpenWindow('rendered')}
              className="min-h-[32px] px-2.5 py-1 rounded-xl bg-sky-400/15 hover:bg-sky-400/25 border border-sky-400/30 text-[11px] font-semibold text-sky-200 shrink-0 inline-flex items-center gap-1 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>窗口阅读</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex rounded-xl bg-white/[0.04] border border-white/[0.08] p-0.5">
              <button
                id="reports-markdown-rendered-toggle"
                type="button"
                aria-pressed={markdownSubMode === 'rendered'}
                onClick={() => setMarkdownSubMode('rendered')}
                className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                  markdownSubMode === 'rendered'
                    ? 'bg-sky-400/20 text-sky-100 border border-sky-400/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3 h-3" />
                <span>排版阅读</span>
              </button>
              <button
                id="reports-markdown-source-toggle"
                type="button"
                aria-pressed={markdownSubMode === 'source'}
                onClick={() => setMarkdownSubMode('source')}
                className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                  markdownSubMode === 'source'
                    ? 'bg-sky-400/20 text-sky-100 border border-sky-400/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code2 className="w-3 h-3" />
                <span>原始 MD</span>
              </button>
            </div>

            <button
              id="reports-copy-markdown"
              type="button"
              disabled={!reports.markdown}
              onClick={handleCopyMarkdown}
              className="min-h-[30px] px-3 py-1 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[11px] font-semibold text-slate-200 disabled:opacity-40 shrink-0 inline-flex items-center gap-1 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5 text-sky-300" />}
              <span>{copied ? '已复制' : '复制全文'}</span>
            </button>
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
              className="glass-inset rounded-2xl p-3.5 text-[11px] leading-relaxed font-mono-tabular text-slate-200 overflow-x-auto whitespace-pre-wrap break-words max-h-[65vh] select-text"
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
          <section id="reports-summary-card" className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-400/15 text-sky-300 border border-sky-400/25">
                    {activeGranularityLabel}
                  </span>
                  {report.period.isCurrent && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-400/15 text-emerald-300 border border-emerald-400/25">
                      进行中
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.06] text-slate-300">
                    {ATTRIBUTION_SOURCE_LABELS[report.coverage.projectAttributionSource] ||
                      report.coverage.projectAttributionSource}
                  </span>
                </div>
                <h2 className="text-base font-bold text-white tracking-tight">
                  {report.period.label || report.period.key}
                </h2>
                <p className="text-[11px] text-slate-400 font-mono-tabular mt-0.5">
                  {report.period.startDate} ~ {report.period.endDate} · 生成于{' '}
                  {formatShortTime(report.period.generatedAt)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="glass-inset rounded-2xl p-3 space-y-1">
                <p className="text-[11px] text-slate-400">总 Token 消耗</p>
                <p className="text-lg font-bold font-mono-tabular text-white">
                  {MonitorModel.compact(report.summary.totalTokens)}
                </p>
                <p className="text-[10px] font-mono-tabular text-slate-400">
                  {formatExact(report.summary.totalTokens)} tokens
                </p>
              </div>

              <div className="glass-inset rounded-2xl p-3 space-y-1">
                <p className="text-[11px] text-slate-400">已知费用</p>
                <p className="text-lg font-bold font-mono-tabular text-emerald-300">
                  {MonitorModel.money(report.summary.knownCostUsd)}
                </p>
                <p className="text-[10px] text-slate-400">
                  {report.summary.unpricedTokens > 0
                    ? `含未定价 ${MonitorModel.compact(report.summary.unpricedTokens)}`
                    : '全部已定价'}
                </p>
              </div>
            </div>

            {report.summary.comparison && (
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400 truncate">
                  较上期（{report.summary.comparison.previousPeriodKey}）
                </span>
                <div className="flex items-center gap-3 font-mono-tabular shrink-0">
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      (report.summary.comparison.tokenDelta || 0) >= 0
                        ? 'text-sky-300'
                        : 'text-emerald-300'
                    }`}
                  >
                    {(report.summary.comparison.tokenDelta || 0) >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    Token {formatDeltaPct(report.summary.comparison.tokenDeltaPct)}
                  </span>
                  <span className="text-slate-300">
                    费用 {formatDeltaPct(report.summary.comparison.costDeltaPct)}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] py-2.5 px-2">
                <p className="text-[10px] text-slate-400">缓存命中率</p>
                <p className="text-xs font-bold font-mono-tabular text-sky-300 mt-0.5">
                  {report.summary.cacheHitRatePct !== null
                    ? `${report.summary.cacheHitRatePct.toFixed(1)}%`
                    : '—'}
                </p>
              </div>
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] py-2.5 px-2">
                <p className="text-[10px] text-slate-400">平均速率</p>
                <p className="text-xs font-bold font-mono-tabular text-slate-100 mt-0.5">
                  {report.summary.throughput.avgOutputTokensPerSec !== null
                    ? `${report.summary.throughput.avgOutputTokensPerSec.toFixed(1)} tok/s`
                    : '—'}
                </p>
              </div>
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] py-2.5 px-2">
                <p className="text-[10px] text-slate-400">活跃 / 项目</p>
                <p className="text-xs font-bold font-mono-tabular text-slate-100 mt-0.5">
                  {report.summary.activeDays} 天 · {report.summary.projectCount} 项
                </p>
              </div>
            </div>

            {report.summary.peakDay && (
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-0.5">
                <span>
                  峰值日：<span className="font-mono-tabular text-slate-200">{report.summary.peakDay.date}</span>（
                  {MonitorModel.compact(report.summary.peakDay.tokens)} ·{' '}
                  {MonitorModel.money(report.summary.peakDay.costUsd)}）
                </span>
                <span>{formatDurationMs(report.summary.activeTimeMs)}</span>
              </div>
            )}
          </section>

          {/* 1.5 第三方 AI API 智能分析总结 */}
          {(reports.aiAnalysis || reports.integrations?.ai?.enabled) && (
            <section
              id="reports-ai-analysis"
              className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3 border-violet-400/20"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <Bot className="w-4 h-4 text-violet-300 shrink-0" />
                    <h3 className="text-xs font-semibold text-slate-100">第三方 AI 智能分析</h3>
                    {reports.aiAnalysis?.stale && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-400/25">
                        数据已更新
                      </span>
                    )}
                    {reports.aiAnalysis?.tokenUsage && (
                      <span
                        title={`输入 ${formatExact(reports.aiAnalysis.tokenUsage.inputTokens)} · 输出 ${formatExact(reports.aiAnalysis.tokenUsage.outputTokens)}`}
                        className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold font-mono-tabular bg-violet-400/15 text-violet-200 border border-violet-400/25"
                      >
                        {MonitorModel.compact(reports.aiAnalysis.tokenUsage.totalTokens)} tok
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-[11px] text-slate-400 font-mono-tabular truncate min-w-0 flex-1">
                    {reports.aiAnalysis
                      ? `${reports.aiAnalysis.providerLabel || reports.aiAnalysis.protocol} · ${reports.aiAnalysis.model} · ${formatShortTime(reports.aiAnalysis.generatedAt)}`
                      : `${reports.integrations?.ai?.providerLabel || reports.integrations?.ai?.protocol || 'AI'} · ${reports.integrations?.ai?.model || '未配置模型'}`}
                  </p>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      id="reports-open-ai-window"
                      type="button"
                      onClick={() => onOpenWindow('ai')}
                      className="min-h-[30px] px-2.5 py-1 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/35 text-[11px] font-semibold text-violet-100 inline-flex items-center gap-1 transition-colors"
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>窗口精读</span>
                    </button>
                    {reports.aiAnalysis?.summaryMarkdown && (
                      <button
                        id="reports-copy-ai"
                        type="button"
                        onClick={handleCopyAiSummary}
                        className="min-h-[30px] px-2.5 py-1 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[11px] font-semibold text-slate-200 inline-flex items-center gap-1 transition-colors"
                      >
                        {aiCopied ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3 text-violet-300" />}
                        <span>{aiCopied ? '已复制' : '复制分析'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {reports.aiAnalysis?.question && (
                <div className="rounded-2xl bg-violet-500/10 border border-violet-400/25 px-3 py-2 text-[11px] text-violet-100 leading-relaxed">
                  <span className="font-semibold text-violet-300">分析提问：</span>
                  <span>{reports.aiAnalysis.question}</span>
                </div>
              )}

              {reports.aiAnalysis?.summaryMarkdown ? (
                <>
                  <div className="glass-inset rounded-2xl p-3.5">
                    <MarkdownRenderer
                      markdown={reports.aiAnalysis.summaryMarkdown}
                      variant="compact"
                      accent="violet"
                      idPrefix="reports-ai"
                    />
                  </div>
                  <button
                    id="reports-ai-window-cta"
                    type="button"
                    onClick={() => onOpenWindow('ai')}
                    className="w-full min-h-[38px] px-3.5 py-2 rounded-2xl bg-violet-500/12 hover:bg-violet-500/20 border border-violet-400/25 text-[11px] font-semibold text-violet-200 flex items-center justify-between gap-2 transition-colors"
                  >
                    <span className="truncate">在独立报告窗口精读 · 支持大字排版与目录跳转</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                  </button>
                </>
              ) : (
                <p className="text-xs text-slate-400 leading-relaxed">
                  当前周期暂无缓存的 AI 分析结果；可在桌面端设置或 OpenClaw / MCP 对话中触发「AI 智能分析」。
                </p>
              )}
            </section>
          )}

          {/* 1.8 第三方 AI API 与余额快照 */}
          {thirdPartyProviders.length > 0 && (
            <section id="reports-thirdparty-quotas" className="glass-panel rounded-3xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <span>第三方 AI API 与余额快照</span>
                </h3>
                <span className="text-[11px] text-slate-400 font-mono-tabular">
                  {thirdPartyProviders.length} 个账户
                </span>
              </div>
              <div className="space-y-2">
                {thirdPartyProviders.slice(0, 6).map((prov, idx) => {
                  const title = prov.accountLabel || prov.planLabel || prov.accountName || providerName(prov.provider);
                  const currency = prov.balance?.currency || 'USD';
                  const symbol = currency === 'CNY' || currency === 'RMB' ? '¥' : '$';
                  const balAmt = prov.balance?.amount;
                  const monthSpend = prov.balance?.monthSpend;
                  const todaySpend = prov.balance?.todaySpend;
                  return (
                    <div
                      key={`${prov.provider}-${prov.accountKey || title}-${idx}`}
                      className="glass-inset rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-100 truncate">
                          {title}
                          {prov.adapterId ? (
                            <span className="ml-1.5 text-[10px] font-mono-tabular text-sky-300/80">
                              [{prov.adapterId}]
                            </span>
                          ) : null}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono-tabular mt-0.5">
                          {todaySpend !== null && todaySpend !== undefined ? `今日 ${symbol}${todaySpend.toFixed(2)}` : ''}
                          {todaySpend !== null && todaySpend !== undefined && monthSpend !== null && monthSpend !== undefined ? ' · ' : ''}
                          {monthSpend !== null && monthSpend !== undefined ? `本月 ${symbol}${monthSpend.toFixed(2)}` : ''}
                          {prov.stale ? ' · 已过期' : ''}
                        </p>
                      </div>
                      <div className="text-right font-mono-tabular shrink-0">
                        <p className="font-semibold text-emerald-300">
                          {balAmt !== null && balAmt !== undefined ? `${symbol}${balAmt.toFixed(2)}` : prov.status || 'ok'}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {prov.status === 'ok' ? '正常' : prov.status || 'unknown'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 2. 自动化信号 */}
          {report.signals.length > 0 && (
            <section className="glass-panel rounded-3xl p-4 space-y-2.5">
              <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>关键特征信号</span>
              </h3>
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
                      className={`rounded-2xl px-3 py-2.5 text-xs leading-relaxed border flex items-start gap-2 ${
                        isWarn
                          ? 'bg-amber-500/10 border-amber-400/25 text-amber-200'
                          : 'bg-sky-500/10 border-sky-400/20 text-sky-100'
                      }`}
                    >
                      {isWarn ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="w-3.5 h-3.5 text-sky-300 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        {(signal.project || signal.model || hasValuePct) && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {signal.project && (
                              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono-tabular font-semibold bg-white/[0.08] text-white/95 max-w-[190px] truncate">
                                {signal.project}
                              </span>
                            )}
                            {signal.model && (
                              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono-tabular bg-white/[0.07] text-slate-200 max-w-[170px] truncate">
                                {signal.model}
                              </span>
                            )}
                            {hasValuePct && (
                              <span
                                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono-tabular font-semibold ${
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
          <section id="reports-projects-section" className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                <FolderGit2 className="w-4 h-4 text-sky-400" />
                <span>项目使用分析 ({report.projects.length})</span>
              </h3>
              {!report.coverage.projectsComplete && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/25">
                  部分归因
                </span>
              )}
            </div>

            {report.projects.length > 0 ? (
              <div className="space-y-3">
                {report.projects.map((proj, idx) => (
                  <div
                    key={proj.key || proj.label}
                    data-report-project={proj.key || proj.label}
                    className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-3 space-y-2"
                  >
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-mono-tabular text-slate-500 w-4 shrink-0">
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

                    <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden" aria-hidden="true">
                      <div
                        style={{ width: `${Math.max(2, Math.min(100, proj.tokenSharePct))}%` }}
                        className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400"
                      />
                    </div>

                    {(proj.clients.length > 0 || proj.models.length > 0) && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {proj.clients.slice(0, 3).map((c) => (
                          <span
                            key={c.client}
                            className="px-2 py-0.5 rounded-md bg-white/[0.05] text-[10px] text-slate-300 font-mono-tabular"
                          >
                            {clientName(c.client)} {c.sharePct.toFixed(0)}%
                          </span>
                        ))}
                        {proj.models.slice(0, 2).map((m) => (
                          <span
                            key={m.model}
                            className="px-2 py-0.5 rounded-md bg-sky-400/10 text-[10px] text-sky-200 font-mono-tabular truncate max-w-[180px]"
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
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-sky-400" />
              <span>工具与模型效率</span>
            </h3>

            {report.clients.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-medium text-slate-400">AI 编程工具</p>
                {report.clients.map((item) => {
                  const tone = clientTone(item.client);
                  return (
                    <div key={item.client} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <i className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />
                          <span className="font-medium text-slate-100 truncate">
                            {clientName(item.client)}
                          </span>
                          <span className="text-[10px] font-mono-tabular text-slate-400">
                            {item.tokenSharePct.toFixed(1)}%
                          </span>
                          {item.cacheHitRatePct !== null && (
                            <span className="text-[10px] font-mono-tabular text-sky-300/90">
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
                      <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden" aria-hidden="true">
                        <div
                          style={{ width: `${Math.max(1.5, Math.min(100, item.tokenSharePct))}%` }}
                          className={`h-full rounded-full bg-gradient-to-r ${tone.bar}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {report.models.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                <p className="text-[11px] font-medium text-slate-400">主力模型</p>
                <div className="space-y-2">
                  {report.models.slice(0, 8).map((item) => (
                    <div
                      key={item.model}
                      className="flex items-center justify-between gap-2 text-xs rounded-xl bg-white/[0.025] px-3 py-2 border border-white/[0.05]"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-100 truncate font-mono-tabular">
                          {item.model}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono-tabular">
                          占比 {item.tokenSharePct.toFixed(1)}%
                          {item.cacheHitRatePct !== null ? ` · 缓存 ${item.cacheHitRatePct.toFixed(0)}%` : ''}
                          {item.avgOutputTokensPerSec !== null
                            ? ` · ${item.avgOutputTokensPerSec.toFixed(1)} tok/s`
                            : ''}
                        </p>
                      </div>
                      <div className="text-right font-mono-tabular shrink-0">
                        <p className="font-semibold text-slate-100">{MonitorModel.compact(item.tokens)}</p>
                        <p className="text-[10px] text-emerald-300">{MonitorModel.money(item.costUsd)}</p>
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
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-100">逐日用量趋势</h3>
                  <div className="space-y-1.5">
                    {report.timeline.map((row) => {
                      const pct = timelineMaxTokens > 0 ? (row.tokens / timelineMaxTokens) * 100 : 0;
                      return (
                        <div key={row.date} className="flex items-center gap-2 text-[11px] font-mono-tabular">
                          <span className="text-slate-400 w-12 shrink-0">{row.date.slice(5)}</span>
                          <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              style={{ width: `${row.tokens > 0 ? Math.max(2, pct) : 0}%` }}
                              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-300"
                            />
                          </div>
                          <span className="text-slate-200 w-14 text-right shrink-0">
                            {MonitorModel.compact(row.tokens)}
                          </span>
                          <span className="text-emerald-300/90 w-12 text-right shrink-0">
                            {MonitorModel.money(row.costUsd)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {report.devices.length > 0 && (
                <div className={`space-y-2 ${report.timeline.length > 1 ? 'pt-2.5 border-t border-white/[0.06]' : ''}`}>
                  <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                    <Laptop className="w-3.5 h-3.5 text-sky-400" />
                    <span>设备贡献 ({report.devices.length})</span>
                  </h3>
                  <div className="space-y-1.5">
                    {report.devices.map((dev) => (
                      <div
                        key={dev.deviceId}
                        className="flex items-center justify-between gap-2 text-xs rounded-xl bg-white/[0.025] px-3 py-2 border border-white/[0.05]"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-100 truncate">
                            {dev.hostname || dev.deviceId}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono-tabular">
                            {dev.platform || 'unknown'} · 占比 {dev.tokenSharePct.toFixed(1)}%
                            {dev.stale ? ' · 状态过期' : ''}
                          </p>
                        </div>
                        <div className="text-right font-mono-tabular shrink-0">
                          <p className="font-semibold text-slate-100">{MonitorModel.compact(dev.tokens)}</p>
                          <p className="text-[10px] text-emerald-300">{MonitorModel.money(dev.costUsd)}</p>
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
