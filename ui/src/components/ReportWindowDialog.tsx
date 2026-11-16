import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  Code2,
  Copy,
  FileText,
  ListTree,
  RefreshCw,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import { MonitorModel } from '../model/monitorModel';
import { reportErrorLabel } from '../reportsState';
import type { ReportGranularity, ReportsState } from '../types/monitor';
import { copyTextToClipboard, formatExact, formatShortTime } from '../utils/formatters';
import { parseMarkdown } from '../utils/markdown';
import { MarkdownRenderer } from './MarkdownRenderer';

export type ReportWindowTab = 'ai' | 'rendered' | 'source';

export interface ReportWindowDialogProps {
  open: boolean;
  activeTab: ReportWindowTab;
  onChangeTab: (tab: ReportWindowTab) => void;
  onClose: () => void;
  reports: ReportsState;
}

const GRANULARITY_LABELS: Record<ReportGranularity, string> = {
  daily: '日报',
  weekly: '周报',
  monthly: '月报',
};

const TAB_ITEMS: Array<{
  id: ReportWindowTab;
  label: string;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'ai', label: 'AI 分析', title: 'AI 智能分析', Icon: Bot },
  { id: 'rendered', label: '完整排版', title: '完整分析报告', Icon: BookOpen },
  { id: 'source', label: 'Markdown 源码', title: 'Markdown 源码', Icon: Code2 },
];

export const ReportWindowDialog: React.FC<ReportWindowDialogProps> = ({
  open,
  activeTab,
  onChangeTab,
  onClose,
  reports,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [fontScale, setFontScale] = useState<'md' | 'lg'>('md');
  const [copied, setCopied] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState('');

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleBack = () => onCloseRef.current();
    window.addEventListener('tm-close-report-window', handleBack);
    return () => window.removeEventListener('tm-close-report-window', handleBack);
  }, [open]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setCopied(false);
    setActiveHeadingId('');
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [open, activeTab, reports.granularity, reports.periodKey]);

  const activeTabMeta = TAB_ITEMS.find((item) => item.id === activeTab) || TAB_ITEMS[0];
  const aiMarkdown = reports.aiAnalysis?.summaryMarkdown || '';
  const docMarkdown = reports.markdown || '';
  const activeSource = activeTab === 'ai' ? aiMarkdown : docMarkdown;

  const tocHeadings = useMemo(() => {
    if (activeTab === 'source' || !activeSource) return [];
    return parseMarkdown(activeSource).headings.filter((h) => h.depth <= 2);
  }, [activeTab, activeSource]);

  const periodPillText = useMemo(() => {
    const granLabel = GRANULARITY_LABELS[reports.granularity] || reports.granularity;
    const periodText =
      reports.report?.period?.key ||
      (reports.periodKey && reports.periodKey !== 'current' ? reports.periodKey : '') ||
      reports.report?.period?.label ||
      '当期实时';
    return `${granLabel} · ${periodText}`;
  }, [reports.granularity, reports.periodKey, reports.report]);

  const metadataSubtitle = useMemo(() => {
    if (activeTab === 'ai') {
      if (reports.aiAnalysis) {
        const provider = reports.aiAnalysis.providerLabel || reports.aiAnalysis.protocol || 'AI';
        const model = reports.aiAnalysis.model || '未指定模型';
        const time = formatShortTime(reports.aiAnalysis.generatedAt);
        return `${provider} · ${model} · ${time}`;
      }
      if (reports.integrations?.ai) {
        const provider =
          reports.integrations.ai.providerLabel || reports.integrations.ai.protocol || 'AI';
        const model = reports.integrations.ai.model || '未配置模型';
        return `${provider} · ${model}`;
      }
      return '周期 AI 摘要阅读视图';
    }
    if (reports.report) {
      return `${reports.report.period.startDate} ~ ${reports.report.period.endDate} · ${formatShortTime(reports.report.period.generatedAt)}`;
    }
    return '标准报告 Markdown 阅读视图';
  }, [activeTab, reports.aiAnalysis, reports.integrations, reports.report]);

  const handleCopy = async () => {
    if (!activeSource) return;
    const ok = await copyTextToClipboard(activeSource);
    if (ok) {
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleJumpHeading = (headingId: string) => {
    const container = bodyRef.current;
    const target = document.getElementById(`report-win-${headingId}`);
    if (!container || !target) return;
    setActiveHeadingId(headingId);
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = container.scrollTop + (targetRect.top - containerRect.top) - 12;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  const showLoadingSkeleton = reports.detailLoading && !activeSource;
  const showErrorState = Boolean(reports.detailError) && !activeSource && !reports.detailLoading;

  return (
    <dialog
      ref={dialogRef}
      id="report-window-dialog"
      aria-labelledby="report-window-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="report-window-dialog m-auto w-[min(100vw-0.75rem,440px)] h-[min(90dvh,780px)] max-h-[90dvh] rounded-3xl border border-white/15 bg-[#0B111A] text-slate-100 shadow-2xl p-0 overflow-hidden backdrop:bg-black/80 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Sticky Window Header */}
        <div className="shrink-0 px-4 pt-3.5 pb-3 border-b border-white/10 bg-[#0E1622]/95 space-y-2.5">
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${
                    activeTab === 'ai'
                      ? 'bg-violet-500/15 border-violet-400/35 text-violet-300'
                      : 'bg-sky-500/15 border-sky-400/35 text-sky-300'
                  }`}
                >
                  <activeTabMeta.Icon className="w-3.5 h-3.5" />
                </span>
                <h2 id="report-window-title" className="text-sm font-bold text-white tracking-tight">
                  {activeTabMeta.title}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono-tabular bg-white/[0.06] text-slate-200 border border-white/10">
                  {periodPillText}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-400">
                <span className="font-mono-tabular truncate max-w-full">{metadataSubtitle}</span>
                {reports.aiAnalysis?.stale && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-400/25 shrink-0">
                    数据已更新
                  </span>
                )}
                {activeTab === 'ai' && reports.aiAnalysis?.tokenUsage && (
                  <span
                    title={`输入 ${formatExact(reports.aiAnalysis.tokenUsage.inputTokens)} · 输出 ${formatExact(reports.aiAnalysis.tokenUsage.outputTokens)}`}
                    className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold font-mono-tabular bg-violet-400/15 text-violet-200 border border-violet-400/25 shrink-0"
                  >
                    AI {MonitorModel.compact(reports.aiAnalysis.tokenUsage.totalTokens)} tok
                  </span>
                )}
              </div>
            </div>

            <button
              id="report-window-close"
              type="button"
              aria-label="关闭报告窗口"
              onClick={onClose}
              className="min-h-[36px] min-w-[36px] -mr-1 -mt-0.5 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab Switcher */}
          <div
            role="tablist"
            aria-label="报告窗口阅读模式"
            className="glass-inset p-1 rounded-2xl flex gap-1"
          >
            {TAB_ITEMS.map(({ id, label }) => {
              const selected = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  data-report-window-tab={id}
                  aria-selected={selected}
                  onClick={() => onChangeTab(id)}
                  className={`flex-1 min-h-[34px] px-2 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap inline-flex items-center justify-center gap-1.5 ${
                    selected
                      ? id === 'ai'
                        ? 'bg-violet-500/22 text-violet-100 border border-violet-400/35 shadow-sm'
                        : 'bg-sky-500/20 text-sky-100 border border-sky-400/35 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{label}</span>
                  {id === 'ai' && Boolean(aiMarkdown) && (
                    <i
                      aria-hidden="true"
                      className={`w-1.5 h-1.5 rounded-full ${
                        reports.aiAnalysis?.stale ? 'bg-amber-400' : 'bg-violet-400'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Reading Toolbar + Quick-Jump TOC */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div
                role="group"
                aria-label="正文字号"
                className="inline-flex items-center rounded-xl bg-white/[0.04] border border-white/[0.08] p-0.5"
              >
                <span className="pl-2 pr-1 text-[10px] text-slate-400 inline-flex items-center gap-1">
                  <Type className="w-3 h-3" aria-hidden="true" />
                </span>
                {(
                  [
                    ['md', '标准'],
                    ['lg', '大字'],
                  ] as const
                ).map(([scaleId, label]) => {
                  const active = fontScale === scaleId;
                  return (
                    <button
                      key={scaleId}
                      type="button"
                      data-report-font-scale={scaleId}
                      aria-pressed={active}
                      onClick={() => setFontScale(scaleId)}
                      className={`min-h-[28px] px-2.5 rounded-lg text-[10px] font-semibold transition-colors ${
                        active
                          ? 'bg-slate-800 text-white border border-white/10'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <button
                id="report-window-copy"
                type="button"
                disabled={!activeSource}
                onClick={handleCopy}
                className="min-h-[30px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[11px] font-semibold text-slate-200 disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors shrink-0"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-sky-300" />
                )}
                <span>{copied ? '已复制' : activeTab === 'ai' ? '复制分析' : '复制全文'}</span>
              </button>
            </div>

            {tocHeadings.length > 0 && (
              <div
                aria-label="章节快速跳转"
                className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5"
              >
                <ListTree className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                {tocHeadings.map((heading) => {
                  const isCurrent = activeHeadingId === heading.id;
                  return (
                    <button
                      key={heading.id}
                      type="button"
                      data-report-toc-target={heading.id}
                      onClick={() => handleJumpHeading(heading.id)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap shrink-0 border transition-colors max-w-[180px] truncate ${
                        isCurrent
                          ? activeTab === 'ai'
                            ? 'bg-violet-400/20 border-violet-400/40 text-violet-100'
                            : 'bg-sky-400/20 border-sky-400/40 text-sky-100'
                          : 'bg-white/[0.04] border-white/[0.08] text-slate-300 hover:text-white hover:border-white/20'
                      }`}
                    >
                      {heading.text}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Body */}
        <div
          ref={bodyRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 select-text"
        >
          {showLoadingSkeleton ? (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
                <span>正在读取周期报告与 AI 分析内容…</span>
              </div>
              <div className="space-y-2 animate-pulse">
                <div className="h-5 w-2/3 rounded-xl bg-white/[0.06]" />
                <div className="h-3.5 w-full rounded-lg bg-white/[0.04]" />
                <div className="h-3.5 w-5/6 rounded-lg bg-white/[0.04]" />
                <div className="h-24 w-full rounded-2xl bg-white/[0.04] mt-3" />
                <div className="h-3.5 w-4/5 rounded-lg bg-white/[0.04]" />
                <div className="h-3.5 w-3/4 rounded-lg bg-white/[0.04]" />
              </div>
            </div>
          ) : showErrorState ? (
            <div className="rounded-2xl bg-rose-500/12 border border-rose-400/30 p-4 text-xs text-rose-200 flex items-start gap-2.5 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{reportErrorLabel(reports.detailError)}</span>
            </div>
          ) : activeTab === 'ai' ? (
            aiMarkdown ? (
              <div className="space-y-3">
                {reports.aiAnalysis?.question && (
                  <div className="rounded-2xl bg-violet-500/10 border border-violet-400/25 px-3.5 py-2.5 text-xs text-violet-100 leading-relaxed">
                    <span className="font-semibold text-violet-300">分析提问：</span>
                    <span>{reports.aiAnalysis.question}</span>
                  </div>
                )}
                <MarkdownRenderer
                  markdown={aiMarkdown}
                  variant="reader"
                  fontScale={fontScale}
                  accent="violet"
                  idPrefix="report-win"
                />
              </div>
            ) : (
              <div className="glass-inset rounded-2xl p-5 text-center space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-violet-500/15 border border-violet-400/30 flex items-center justify-center text-violet-300 mx-auto">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-100">当前周期暂无 AI 智能分析</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    可在桌面端「报告设置」或 OpenClaw / MCP 对话中触发本周期 AI 深度分析；Android 端仅作只读展示。
                  </p>
                </div>
                {docMarkdown && (
                  <button
                    type="button"
                    onClick={() => onChangeTab('rendered')}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-sky-400/15 hover:bg-sky-400/25 border border-sky-400/30 text-xs font-semibold text-sky-200 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>切换阅读完整排版报告</span>
                  </button>
                )}
              </div>
            )
          ) : activeTab === 'rendered' ? (
            <MarkdownRenderer
              markdown={docMarkdown}
              variant="reader"
              fontScale={fontScale}
              accent="sky"
              showFrontmatter
              idPrefix="report-win"
              emptyText="当前响应未包含 Markdown 文本。"
            />
          ) : (
            <pre
              id="report-window-source-pre"
              className={`glass-inset rounded-2xl p-3.5 leading-relaxed font-mono-tabular text-slate-200 whitespace-pre-wrap break-words select-text ${
                fontScale === 'lg' ? 'text-[12.5px]' : 'text-[11px]'
              }`}
            >
              {docMarkdown || '当前响应未包含 Markdown 文本。'}
            </pre>
          )}
        </div>
      </div>
    </dialog>
  );
};
