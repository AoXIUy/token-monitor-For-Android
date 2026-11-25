import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bot,
  ChevronDown,
  Code2,
  FileText,
  ListTree,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { MonitorModel } from '../model/monitorModel';
import { reportErrorLabel } from '../reportsState';
import type { ReportGranularity, ReportsState } from '../types/monitor';
import { formatExact, formatShortTime } from '../utils/formatters';
import { parseMarkdown } from '../utils/markdown';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CopyButton, EmptyState, InlineAlert } from './ui/Primitives';

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
  const tocDetailsRef = useRef<HTMLDetailsElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [fontScale, setFontScale] = useState<'md' | 'lg'>('md');
  const [activeHeadingId, setActiveHeadingId] = useState('');
  const [scrollPct, setScrollPct] = useState(0);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open && el.isConnected) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleBack = () => onCloseRef.current();
    window.addEventListener('tm-close-report-window', handleBack);
    return () => window.removeEventListener('tm-close-report-window', handleBack);
  }, [open]);

  useEffect(() => {
    setActiveHeadingId('');
    setScrollPct(0);
    if (tocDetailsRef.current) {
      tocDetailsRef.current.open = false;
    }
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [open, activeTab, reports.granularity, reports.periodKey]);

  const handleBodyScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 4) {
      setScrollPct(0);
      return;
    }
    setScrollPct(Math.max(0, Math.min(100, (el.scrollTop / maxScroll) * 100)));
  }, []);

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

  const handleJumpHeading = (headingId: string) => {
    setActiveHeadingId(headingId);
    if (tocDetailsRef.current) {
      tocDetailsRef.current.open = false;
    }
    window.requestAnimationFrame(() => {
      const container = bodyRef.current;
      const target = document.getElementById(`report-win-${headingId}`);
      if (!container || !target) return;
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const top = container.scrollTop + (targetRect.top - containerRect.top) - 12;
      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      container.scrollTo({
        top: Math.max(0, top),
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    });
  };

  const showLoadingSkeleton = reports.detailLoading && !activeSource;
  const showErrorState = Boolean(reports.detailError) && !activeSource && !reports.detailLoading;
  const showInlineErrorBanner =
    Boolean(reports.detailError) && Boolean(activeSource) && !reports.detailLoading;

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
      className="report-window-dialog tm-dialog m-auto w-[calc(100%-0.5rem)] max-w-[540px] h-[94dvh] max-h-[94dvh] rounded-3xl p-0 overflow-hidden"
    >
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Compact 2-Row Sticky Window Header */}
        <div className="shrink-0 px-3.5 pt-3 pb-2.5 border-b border-[var(--tm-border-default)] bg-[var(--tm-bg-dialog-header)] space-y-2">
          {/* Row 1: Title/Period + Font Scale Toggle + Copy + 44x44 Close */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span
                className={`w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 ${
                  activeTab === 'ai'
                    ? 'bg-[var(--tm-violet-soft-bg)] border-[var(--tm-violet-soft-border)] text-[var(--tm-violet-text)]'
                    : 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]'
                }`}
                aria-hidden="true"
              >
                <activeTabMeta.Icon className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="report-window-title"
                  className="text-sm font-bold text-[var(--tm-text-primary)] tracking-tight truncate leading-tight"
                >
                  {activeTabMeta.title}
                </h2>
                <p className="text-[11px] text-[var(--tm-text-muted)] tabular-nums truncate mt-0.5">
                  {periodPillText}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                data-report-font-scale="lg"
                aria-pressed={fontScale === 'lg'}
                aria-label={fontScale === 'lg' ? '切换为标准字号' : '切换为大字号'}
                onClick={() => setFontScale((prev) => (prev === 'lg' ? 'md' : 'lg'))}
                className={`min-h-[44px] min-w-[44px] px-2 rounded-xl border text-xs font-bold font-mono-tabular transition-all active:scale-95 inline-flex items-center justify-center ${
                  fontScale === 'lg'
                    ? activeTab === 'ai'
                      ? 'bg-[var(--tm-violet-soft-bg)] border-[var(--tm-violet-soft-border)] text-[var(--tm-violet-text)]'
                      : 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]'
                    : 'bg-[var(--tm-bg-control)] border-[var(--tm-border-default)] text-[var(--tm-text-secondary)] hover:bg-[var(--tm-bg-control-hover)]'
                }`}
              >
                {fontScale === 'lg' ? 'A-' : 'A+'}
              </button>

              <CopyButton
                id="report-window-copy"
                text={activeSource}
                ariaLabel={activeTab === 'ai' ? '复制 AI 智能分析' : '复制报告全文'}
                label="复制"
                copiedLabel="已复制"
                className="min-h-[44px] px-2.5 text-xs"
              />

              <button
                id="report-window-close"
                type="button"
                aria-label="关闭报告窗口"
                onClick={onClose}
                className="w-11 h-11 -mr-1 rounded-full flex items-center justify-center text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] hover:bg-[var(--tm-bg-control-hover)] active:scale-95 transition-all shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Row 2: 3-Tab Switcher */}
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
                  className={`flex-1 min-h-[44px] px-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap inline-flex items-center justify-center gap-1.5 active:scale-[0.98] ${
                    selected
                      ? id === 'ai'
                        ? 'bg-[var(--tm-violet-soft-bg)] text-[var(--tm-violet-text)] border border-[var(--tm-violet-soft-border)] shadow-sm'
                        : 'bg-[var(--tm-accent-soft-bg)] text-[var(--tm-accent-text)] border border-[var(--tm-accent-soft-border)] shadow-sm'
                      : 'border border-transparent text-[var(--tm-text-muted)] hover:text-[var(--tm-text-secondary)]'
                  }`}
                >
                  <span className="truncate">{label}</span>
                  {id === 'ai' && Boolean(aiMarkdown) && (
                    <i
                      aria-hidden="true"
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        reports.aiAnalysis?.stale ? 'bg-[var(--tm-warning)]' : 'bg-[var(--tm-violet)]'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Subtle Sticky Reading Progress Hairline */}
        <div
          aria-hidden="true"
          className="h-[2px] w-full bg-[var(--tm-track-bg)] shrink-0 overflow-hidden"
        >
          <div
            style={{ width: `${scrollPct}%` }}
            className={`h-full transition-[width] duration-75 ${
              activeTab === 'ai' ? 'bg-[var(--tm-violet)]' : 'bg-[var(--tm-accent)]'
            }`}
          />
        </div>

        {/* Scrollable Body */}
        <div
          ref={bodyRef}
          onScroll={handleBodyScroll}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3.5 select-text space-y-3"
        >
          {/* Context Metadata Strip (inside scroll body to maximize reading viewport) */}
          <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] text-[var(--tm-text-muted)] pb-2 border-b border-[var(--tm-border-subtle)]">
            <span className="tabular-nums break-words [overflow-wrap:anywhere]">{metadataSubtitle}</span>
            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              {activeTab === 'ai' && reports.aiAnalysis?.stale && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--tm-warning-soft-bg)] text-[var(--tm-warning-text)] border border-[var(--tm-warning-soft-border)]">
                  数据已更新
                </span>
              )}
              {activeTab === 'ai' && reports.aiAnalysis?.tokenUsage && (
                <span
                  title={`输入 ${formatExact(reports.aiAnalysis.tokenUsage.inputTokens)} · 输出 ${formatExact(reports.aiAnalysis.tokenUsage.outputTokens)}`}
                  className="px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums bg-[var(--tm-violet-soft-bg)] text-[var(--tm-violet-text)] border border-[var(--tm-violet-soft-border)]"
                >
                  AI {MonitorModel.compact(reports.aiAnalysis.tokenUsage.totalTokens)} tok
                </span>
              )}
            </div>
          </div>

          {/* Collapsible TOC Drawer at top of scrollable body */}
          {!showLoadingSkeleton && !showErrorState && tocHeadings.length > 0 && (
            <details
              ref={tocDetailsRef}
              className="group glass-inset rounded-2xl px-3.5"
            >
              <summary className="list-none [&::-webkit-details-marker]:hidden min-h-[44px] py-2 flex items-center justify-between gap-2 text-xs font-medium text-[var(--tm-text-primary)] select-none">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <ListTree
                    className={`w-4 h-4 shrink-0 ${
                      activeTab === 'ai' ? 'text-[var(--tm-violet-text)]' : 'text-[var(--tm-accent-text)]'
                    }`}
                    aria-hidden="true"
                  />
                  <span>目录</span>
                </span>
                <span className="inline-flex items-center gap-1.5 shrink-0 text-[11px] text-[var(--tm-text-muted)] tabular-nums">
                  <span>{tocHeadings.length} 节</span>
                  <ChevronDown
                    aria-hidden="true"
                    className="w-4 h-4 text-[var(--tm-text-muted)] transition-transform duration-150 group-open:rotate-180 group-open:text-[var(--tm-accent-text)]"
                  />
                </span>
              </summary>
              <div
                aria-label="章节快速跳转"
                className="pb-3 pt-2 border-t border-[var(--tm-border-subtle)] flex flex-wrap gap-1.5"
              >
                {tocHeadings.map((heading) => {
                  const isCurrent = activeHeadingId === heading.id;
                  return (
                    <button
                      key={heading.id}
                      type="button"
                      data-report-toc-target={heading.id}
                      onClick={() => handleJumpHeading(heading.id)}
                      className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors text-left max-w-full truncate active:scale-[0.98] ${
                        isCurrent
                          ? activeTab === 'ai'
                            ? 'bg-[var(--tm-violet-soft-bg)] border-[var(--tm-violet-soft-border)] text-[var(--tm-violet-text)]'
                            : 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]'
                          : 'bg-[var(--tm-bg-control)] border-[var(--tm-border-default)] text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] hover:border-[var(--tm-border-strong)]'
                      }`}
                    >
                      {heading.text}
                    </button>
                  );
                })}
              </div>
            </details>
          )}

          {showLoadingSkeleton ? (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-xs text-[var(--tm-text-secondary)]">
                <RefreshCw className="w-4 h-4 text-[var(--tm-accent)] animate-spin shrink-0" />
                <span>正在读取周期报告与 AI 分析内容…</span>
              </div>
              <div className="space-y-2 animate-pulse">
                <div className="h-5 w-2/3 rounded-xl bg-[var(--tm-bg-control-hover)]" />
                <div className="h-3.5 w-full rounded-lg bg-[var(--tm-bg-control)]" />
                <div className="h-3.5 w-5/6 rounded-lg bg-[var(--tm-bg-control)]" />
                <div className="h-24 w-full rounded-2xl bg-[var(--tm-bg-control)] mt-3" />
                <div className="h-3.5 w-4/5 rounded-lg bg-[var(--tm-bg-control)]" />
                <div className="h-3.5 w-3/4 rounded-lg bg-[var(--tm-bg-control)]" />
              </div>
            </div>
          ) : showErrorState ? (
            <InlineAlert id="report-window-error" tone="rose" role="status">
              {reportErrorLabel(reports.detailError)}
            </InlineAlert>
          ) : (
            <>
              {showInlineErrorBanner && (
                <InlineAlert id="report-window-error" tone="rose" role="status">
                  {reportErrorLabel(reports.detailError)}
                </InlineAlert>
              )}
              {activeTab === 'ai' ? (
                aiMarkdown ? (
                  <div className="space-y-3">
                    {reports.aiAnalysis?.question && (
                      <div className="rounded-2xl bg-[var(--tm-violet-soft-bg)] border border-[var(--tm-violet-soft-border)] px-3.5 py-2.5 text-xs text-[var(--tm-text-primary)] leading-relaxed">
                        <span className="font-semibold text-[var(--tm-violet-text)]">分析提问：</span>
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
                  <EmptyState
                    compact
                    tone="violet"
                    icon={<Sparkles className="w-5 h-5" />}
                    title="当前周期暂无 AI 智能分析"
                    description="可在桌面端「报告设置」或 OpenClaw / MCP 对话中触发本周期 AI 深度分析；Android 端仅作只读展示。"
                    action={
                      docMarkdown ? (
                        <button
                          type="button"
                          onClick={() => onChangeTab('rendered')}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--tm-accent-soft-bg)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.98] border border-[var(--tm-accent-soft-border)] text-xs font-semibold text-[var(--tm-accent-text)] inline-flex items-center gap-1.5 transition-all"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>切换阅读完整排版报告</span>
                        </button>
                      ) : undefined
                    }
                  />
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
                  className={`glass-inset rounded-2xl p-3.5 leading-relaxed font-mono-tabular text-[var(--tm-text-primary)] whitespace-pre-wrap break-words select-text ${
                    fontScale === 'lg' ? 'text-[12.5px]' : 'text-[11.5px]'
                  }`}
                >
                  {docMarkdown || '当前响应未包含 Markdown 文本。'}
                </pre>
              )}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
};
