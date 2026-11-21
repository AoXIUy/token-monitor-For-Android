import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Check, Link2, Terminal } from 'lucide-react';
import {
  inlinePlainText,
  parseMarkdown,
  type MarkdownBlock,
  type MarkdownInline,
  type MarkdownTableAlignment,
  type MarkdownTableBlock,
} from '../utils/markdown';
import { CopyButton, DetailsDisclosure } from './ui/Primitives';

export interface MarkdownRendererProps {
  markdown: string;
  variant?: 'compact' | 'reader';
  fontScale?: 'sm' | 'md' | 'lg';
  accent?: 'sky' | 'violet';
  showFrontmatter?: boolean;
  idPrefix?: string;
  className?: string;
  emptyText?: string;
}

type AccentTone = NonNullable<MarkdownRendererProps['accent']>;
type FontScale = NonNullable<MarkdownRendererProps['fontScale']>;

const ACCENT_STYLES: Record<
  AccentTone,
  {
    h2Bar: string;
    blockquote: string;
    inlineCode: string;
    bullet: string;
    orderedIndex: string;
    linkPill: string;
    taskChecked: string;
    tableHeader: string;
  }
> = {
  sky: {
    h2Bar: 'bg-sky-400',
    blockquote: 'border-sky-400/50 bg-sky-500/[0.07]',
    inlineCode: 'bg-sky-400/10 text-sky-200 border-sky-400/20',
    bullet: 'bg-sky-400/85',
    orderedIndex: 'text-sky-300',
    linkPill: 'bg-sky-400/10 text-sky-200 border-sky-400/25',
    taskChecked: 'bg-sky-400/20 border-sky-400/50 text-sky-300',
    tableHeader: 'bg-sky-500/[0.07] text-sky-100',
  },
  violet: {
    h2Bar: 'bg-violet-400',
    blockquote: 'border-violet-400/50 bg-violet-500/[0.07]',
    inlineCode: 'bg-violet-400/10 text-violet-200 border-violet-400/20',
    bullet: 'bg-violet-400/85',
    orderedIndex: 'text-violet-300',
    linkPill: 'bg-violet-400/10 text-violet-200 border-violet-400/25',
    taskChecked: 'bg-violet-400/20 border-violet-400/50 text-violet-300',
    tableHeader: 'bg-violet-500/[0.07] text-violet-100',
  },
};

const SCALE_STYLES: Record<
  FontScale,
  {
    prose: string;
    h1: string;
    h2: string;
    h3: string;
    h4: string;
    tableText: string;
    codeText: string;
  }
> = {
  sm: {
    prose: 'text-[13px] leading-[1.68]',
    h1: 'text-[17px] leading-snug',
    h2: 'text-[15px] leading-snug',
    h3: 'text-[13.5px] leading-snug',
    h4: 'text-[13px] leading-snug',
    tableText: 'text-[11.5px]',
    codeText: 'text-[11.5px]',
  },
  md: {
    prose: 'text-[14px] leading-[1.75]',
    h1: 'text-[19px] leading-snug',
    h2: 'text-[16px] leading-snug',
    h3: 'text-[14.5px] leading-snug',
    h4: 'text-[13.5px] leading-snug',
    tableText: 'text-[12px]',
    codeText: 'text-[12px]',
  },
  lg: {
    prose: 'text-[15.5px] leading-[1.8]',
    h1: 'text-[21px] leading-snug',
    h2: 'text-[17.5px] leading-snug',
    h3: 'text-[16px] leading-snug',
    h4: 'text-[15px] leading-snug',
    tableText: 'text-[13px]',
    codeText: 'text-[13px]',
  },
};

const RE_NUMERIC_CELL =
  /^[+\-~$¥€£]?\s*[\d,]+(?:\.\d+)?(?:\s*(?:%|tokens?|tok\/s|ms|s|m|h|K|M|B))?(?:\s*\([^)]+\))?$|^(?:—|-|N\/A)$/i;
const RE_WIDE_COLUMN_HEADER =
  /观察|备注|说明|摘要|建议|详情|结论|原因|observation|notes?|summary|detail|comment|reason/i;

function cellAlignmentClass(align: MarkdownTableAlignment, isNumeric: boolean): string {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  if (isNumeric) return 'text-right';
  return 'text-left';
}

function extractDomainHint(safeHref: string | null): string | null {
  if (!safeHref) return null;
  try {
    return new URL(safeHref).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

interface ColumnLayout {
  isNumeric: boolean;
  isWideText: boolean;
}

function analyzeTableColumns(block: MarkdownTableBlock): ColumnLayout[] {
  return block.headers.map((headerInlines, colIdx) => {
    const headerText = inlinePlainText(headerInlines).trim();
    const align = block.alignments[colIdx] || 'left';
    const cellTexts = block.rows
      .map((row) => inlinePlainText(row[colIdx] || []).trim())
      .filter((text) => text.length > 0);

    const allNumericValues =
      cellTexts.length > 0 && cellTexts.every((text) => RE_NUMERIC_CELL.test(text));
    const isNumeric = align === 'right' || allNumericValues;

    const maxLen = cellTexts.reduce((max, text) => Math.max(max, text.length), 0);
    const avgLen =
      cellTexts.length > 0
        ? cellTexts.reduce((sum, text) => sum + text.length, 0) / cellTexts.length
        : 0;
    const isWideText =
      !isNumeric &&
      (RE_WIDE_COLUMN_HEADER.test(headerText) ||
        maxLen > 24 ||
        (avgLen > 16 && cellTexts.some((t) => /\s|[\u4e00-\u9fff]/.test(t))));

    return { isNumeric, isWideText };
  });
}

function renderInlines(
  inlines: MarkdownInline[],
  theme: (typeof ACCENT_STYLES)[AccentTone],
  keyPrefix: string,
): React.ReactNode {
  return inlines.map((inline, idx) => {
    const key = `${keyPrefix}-${idx}`;
    switch (inline.type) {
      case 'text':
        return <React.Fragment key={key}>{inline.text}</React.Fragment>;
      case 'break':
        return <br key={key} />;
      case 'strong':
        return (
          <strong key={key} className="font-semibold text-white">
            {renderInlines(inline.children, theme, key)}
          </strong>
        );
      case 'em':
        return (
          <em key={key} className="italic text-slate-300">
            {renderInlines(inline.children, theme, key)}
          </em>
        );
      case 'strike':
        return (
          <del key={key} className="line-through text-slate-400">
            {renderInlines(inline.children, theme, key)}
          </del>
        );
      case 'code':
        return (
          <code
            key={key}
            className={`px-1.5 py-0.5 mx-[1px] rounded-md font-mono-tabular text-[0.88em] border break-words ${theme.inlineCode}`}
          >
            {inline.text}
          </code>
        );
      case 'link': {
        const domain = extractDomainHint(inline.safeHref);
        const labelText = inlinePlainText(inline.label).trim();
        const showDomain = Boolean(domain && !labelText.includes(domain));
        return (
          <span
            key={key}
            data-safe-href={inline.safeHref ?? undefined}
            className={`inline px-1.5 py-0.5 mx-0.5 rounded-md border align-baseline text-[0.9em] break-words [box-decoration-break:clone] ${
              inline.safeHref
                ? theme.linkPill
                : 'bg-white/[0.05] border-white/10 text-slate-300'
            }`}
          >
            <Link2
              className="w-3 h-3 inline-block align-[-0.14em] mr-1 opacity-75"
              aria-hidden="true"
            />
            <span>{renderInlines(inline.label, theme, key)}</span>
            {showDomain && (
              <span className="ml-1 text-[11px] opacity-80 font-mono-tabular break-all">
                ({domain})
              </span>
            )}
          </span>
        );
      }
    }
  });
}

interface MarkdownTableBlockViewProps {
  block: MarkdownTableBlock;
  theme: (typeof ACCENT_STYLES)[AccentTone];
  scale: (typeof SCALE_STYLES)[FontScale];
  blockKey: string;
}

const MarkdownTableBlockView: React.FC<MarkdownTableBlockViewProps> = ({
  block,
  theme,
  scale,
  blockKey,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const columns = useMemo(() => analyzeTableColumns(block), [block]);

  const updateScrollCue = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 2;
    setHasOverflow(overflow);
    setCanScrollRight(overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    updateScrollCue();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateScrollCue());
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScrollCue, block]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={updateScrollCue}
          className="overflow-x-auto rounded-2xl border border-white/[0.09] bg-[#080C12]/80"
        >
          <table className={`w-full border-collapse text-left ${scale.tableText}`}>
            <thead className={`border-b border-white/[0.09] ${theme.tableHeader}`}>
              <tr>
                {block.headers.map((headerCell, colIdx) => {
                  const align = block.alignments[colIdx] || 'left';
                  const col = columns[colIdx] || { isNumeric: false, isWideText: false };
                  return (
                    <th
                      key={`${blockKey}-th-${colIdx}`}
                      scope="col"
                      className={`px-3 py-2 font-semibold whitespace-nowrap ${cellAlignmentClass(
                        align,
                        col.isNumeric,
                      )} ${col.isWideText ? 'min-w-[140px]' : ''}`}
                    >
                      {renderInlines(headerCell, theme, `${blockKey}-th-${colIdx}`)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {block.rows.map((row, rowIdx) => (
                <tr key={`${blockKey}-tr-${rowIdx}`} className="hover:bg-white/[0.02]">
                  {row.map((cell, colIdx) => {
                    const align = block.alignments[colIdx] || 'left';
                    const col = columns[colIdx] || { isNumeric: false, isWideText: false };
                    return (
                      <td
                        key={`${blockKey}-td-${rowIdx}-${colIdx}`}
                        className={`px-3 py-2 align-top ${cellAlignmentClass(
                          align,
                          col.isNumeric,
                        )} ${
                          col.isWideText
                            ? 'min-w-[140px] whitespace-normal break-words text-slate-200'
                            : col.isNumeric
                              ? 'font-mono-tabular whitespace-nowrap text-slate-100'
                              : 'whitespace-nowrap text-slate-200'
                        }`}
                      >
                        {cell.length > 0 ? (
                          renderInlines(cell, theme, `${blockKey}-td-${rowIdx}-${colIdx}`)
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canScrollRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-[1px] right-[1px] w-7 rounded-r-2xl bg-gradient-to-l from-[#080C12]/95 to-transparent"
          />
        )}
      </div>
      {hasOverflow && (
        <div
          aria-hidden="true"
          className="flex items-center justify-end gap-1 px-1 text-[11px] text-slate-400 select-none"
        >
          <ArrowLeftRight className="w-3 h-3 opacity-80" />
          <span>左右滑动查看完整表格</span>
        </div>
      )}
    </div>
  );
};

function renderHeading(
  block: Extract<MarkdownBlock, { type: 'heading' }>,
  theme: (typeof ACCENT_STYLES)[AccentTone],
  scale: (typeof SCALE_STYLES)[FontScale],
  idPrefix: string | undefined,
  key: string,
): React.ReactNode {
  const headingId = idPrefix ? `${idPrefix}-${block.id}` : block.id;
  const content = renderInlines(block.inlines, theme, key);

  switch (block.depth) {
    case 1:
      return (
        <h1
          key={key}
          id={headingId}
          className={`scroll-mt-4 !mt-5 first:!mt-0 font-bold tracking-tight text-white pb-2 border-b border-white/10 break-words ${scale.h1}`}
        >
          {content}
        </h1>
      );
    case 2:
      return (
        <h2
          key={key}
          id={headingId}
          className={`scroll-mt-4 !mt-5 first:!mt-0 font-bold tracking-tight text-white flex items-start gap-2 ${scale.h2}`}
        >
          <span
            aria-hidden="true"
            className={`w-1 h-[1.05em] mt-[0.22em] rounded-full shrink-0 ${theme.h2Bar}`}
          />
          <span className="min-w-0 break-words">{content}</span>
        </h2>
      );
    case 3:
      return (
        <h3
          key={key}
          id={headingId}
          className={`scroll-mt-4 !mt-4 first:!mt-0 font-semibold text-slate-100 break-words ${scale.h3}`}
        >
          {content}
        </h3>
      );
    case 4:
      return (
        <h4
          key={key}
          id={headingId}
          className={`scroll-mt-4 !mt-3 first:!mt-0 font-semibold text-slate-200 break-words ${scale.h4}`}
        >
          {content}
        </h4>
      );
    case 5:
      return (
        <h5
          key={key}
          id={headingId}
          className="scroll-mt-4 !mt-3 first:!mt-0 text-xs font-semibold uppercase tracking-wide text-slate-300 break-words"
        >
          {content}
        </h5>
      );
    case 6:
      return (
        <h6
          key={key}
          id={headingId}
          className="scroll-mt-4 !mt-3 first:!mt-0 text-[11px] font-semibold uppercase tracking-wider text-slate-400 break-words"
        >
          {content}
        </h6>
      );
  }
}

function renderBlocks(
  blocks: MarkdownBlock[],
  theme: (typeof ACCENT_STYLES)[AccentTone],
  scale: (typeof SCALE_STYLES)[FontScale],
  idPrefix: string | undefined,
  keyPrefix: string,
  listDepth = 0,
): React.ReactNode {
  return blocks.map((block, idx) => {
    const key = `${keyPrefix}-${idx}`;
    switch (block.type) {
      case 'heading':
        return renderHeading(block, theme, scale, idPrefix, key);

      case 'paragraph':
        return (
          <p key={key} className="text-slate-200/95 break-words">
            {renderInlines(block.inlines, theme, key)}
          </p>
        );

      case 'hr':
        return <hr key={key} className="border-0 border-t border-white/10 my-2.5" />;

      case 'blockquote':
        return (
          <blockquote
            key={key}
            className={`rounded-2xl border-l-2 px-3.5 py-2.5 text-slate-200 space-y-2 ${theme.blockquote}`}
          >
            {renderBlocks(block.blocks, theme, scale, idPrefix, key, listDepth)}
          </blockquote>
        );

      case 'code':
        return (
          <div
            key={key}
            className="rounded-2xl glass-inset overflow-hidden border border-white/[0.08]"
          >
            <div className="px-3 py-1 border-b border-white/[0.07] bg-white/[0.02] flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono-tabular uppercase tracking-wider text-slate-400 min-w-0 truncate">
                <Terminal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{block.lang || 'code'}</span>
              </span>
              <CopyButton
                text={block.text}
                ariaLabel={`复制 ${block.lang || 'code'} 代码块`}
                label="复制"
                copiedLabel="已复制"
                className="min-h-[36px] px-2.5 py-1 text-[11px]"
              />
            </div>
            <pre
              className={`p-3 overflow-x-auto font-mono-tabular leading-relaxed text-slate-200 select-text ${scale.codeText}`}
            >
              <code>{block.text}</code>
            </pre>
          </div>
        );

      case 'list': {
        const ListTag = block.ordered ? 'ol' : 'ul';
        return (
          <ListTag key={key} className="space-y-1.5">
            {block.items.map((item, itemIdx) => {
              const itemKey = `${key}-item-${itemIdx}`;
              const isTask = item.checked !== null;
              return (
                <li key={itemKey} className="flex items-start gap-2.5">
                  {isTask ? (
                    <span
                      role="img"
                      aria-label={item.checked ? '已完成' : '未完成'}
                      className={`mt-[0.25em] w-4 h-4 rounded-[5px] border inline-flex items-center justify-center shrink-0 ${
                        item.checked
                          ? theme.taskChecked
                          : 'border-white/25 bg-white/[0.03]'
                      }`}
                    >
                      {item.checked ? <Check className="w-2.5 h-2.5" /> : null}
                    </span>
                  ) : block.ordered ? (
                    <span
                      aria-hidden="true"
                      className={`font-mono-tabular text-[0.9em] font-semibold shrink-0 min-w-[1.35em] text-right select-none ${theme.orderedIndex}`}
                    >
                      {block.start + itemIdx}.
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[0.62em] ${
                        listDepth > 0 ? 'bg-slate-400/80' : theme.bullet
                      }`}
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {item.inlines.length > 0 && (
                      <div
                        className={`break-words ${
                          item.checked
                            ? 'text-slate-400 line-through decoration-white/25'
                            : 'text-slate-200/95'
                        }`}
                      >
                        {renderInlines(item.inlines, theme, itemKey)}
                      </div>
                    )}
                    {item.children.length > 0 && (
                      <div className="space-y-1.5">
                        {renderBlocks(
                          item.children,
                          theme,
                          scale,
                          idPrefix,
                          itemKey,
                          listDepth + 1,
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ListTag>
        );
      }

      case 'table':
        return (
          <MarkdownTableBlockView
            key={key}
            block={block}
            theme={theme}
            scale={scale}
            blockKey={key}
          />
        );
    }
  });
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  markdown,
  variant = 'reader',
  fontScale = 'md',
  accent = 'sky',
  showFrontmatter = false,
  idPrefix,
  className = '',
  emptyText,
}) => {
  const doc = useMemo(() => parseMarkdown(markdown), [markdown]);
  const theme = ACCENT_STYLES[accent] || ACCENT_STYLES.sky;
  const scale = SCALE_STYLES[fontScale] || SCALE_STYLES.md;
  const spacingClass = variant === 'compact' ? 'space-y-2.5' : 'space-y-3.5';

  const hasFrontmatter = showFrontmatter && doc.frontmatter.length > 0;
  const hasContent = hasFrontmatter || doc.blocks.length > 0;

  if (!hasContent) {
    if (!emptyText) return null;
    return (
      <p className={`select-text text-xs text-slate-400 leading-relaxed ${className}`}>
        {emptyText}
      </p>
    );
  }

  return (
    <div
      className={`select-text text-slate-200 ${scale.prose} ${spacingClass} ${className}`.trim()}
    >
      {hasFrontmatter && (
        <DetailsDisclosure
          className="glass-inset rounded-2xl px-3.5"
          summary={<span className="text-xs font-medium text-slate-300">文档元数据</span>}
          summaryMeta={
            <span className="text-[11px] tabular-nums text-slate-400">
              {doc.frontmatter.length} 项
            </span>
          }
          bodyClassName="pb-3 pt-1.5 border-t border-white/[0.06]"
        >
          <dl className="grid grid-cols-2 gap-2">
            {doc.frontmatter.map((entry, idx) => (
              <div
                key={`${entry.key}-${idx}`}
                className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-2.5 py-1.5 min-w-0"
              >
                <dt className="text-[11px] text-slate-400 truncate">{entry.key}</dt>
                <dd className="text-[11px] font-mono-tabular text-slate-100 mt-0.5 break-all">
                  {entry.value || '—'}
                </dd>
              </div>
            ))}
          </dl>
        </DetailsDisclosure>
      )}

      {renderBlocks(doc.blocks, theme, scale, idPrefix, 'md')}
    </div>
  );
};
