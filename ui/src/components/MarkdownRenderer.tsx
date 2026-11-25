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
    h2Bar: 'bg-[var(--tm-info)]',
    blockquote: 'border-[var(--tm-info-soft-border)] bg-[var(--tm-info-soft-bg)]',
    inlineCode: 'bg-[var(--tm-info-soft-bg)] text-[var(--tm-info-text)] border-[var(--tm-info-soft-border)]',
    bullet: 'bg-[var(--tm-info)]',
    orderedIndex: 'text-[var(--tm-info-text)]',
    linkPill: 'bg-[var(--tm-info-soft-bg)] text-[var(--tm-info-text)] border-[var(--tm-info-soft-border)]',
    taskChecked: 'bg-[var(--tm-info-soft-bg)] border-[var(--tm-info)] text-[var(--tm-info-text)]',
    tableHeader: 'bg-[var(--tm-info-soft-bg)] text-[var(--tm-info-text)]',
  },
  violet: {
    h2Bar: 'bg-[var(--tm-violet)]',
    blockquote: 'border-[var(--tm-violet-soft-border)] bg-[var(--tm-violet-soft-bg)]',
    inlineCode: 'bg-[var(--tm-violet-soft-bg)] text-[var(--tm-violet-text)] border-[var(--tm-violet-soft-border)]',
    bullet: 'bg-[var(--tm-violet)]',
    orderedIndex: 'text-[var(--tm-violet-text)]',
    linkPill: 'bg-[var(--tm-violet-soft-bg)] text-[var(--tm-violet-text)] border-[var(--tm-violet-soft-border)]',
    taskChecked: 'bg-[var(--tm-violet-soft-bg)] border-[var(--tm-violet)] text-[var(--tm-violet-text)]',
    tableHeader: 'bg-[var(--tm-violet-soft-bg)] text-[var(--tm-violet-text)]',
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
          <strong key={key} className="font-semibold text-[var(--tm-text-primary)]">
            {renderInlines(inline.children, theme, key)}
          </strong>
        );
      case 'em':
        return (
          <em key={key} className="italic text-[var(--tm-text-secondary)]">
            {renderInlines(inline.children, theme, key)}
          </em>
        );
      case 'strike':
        return (
          <del key={key} className="line-through text-[var(--tm-text-muted)]">
            {renderInlines(inline.children, theme, key)}
          </del>
        );
      case 'code':
        return (
          <code
            key={key}
            className={`px-1.5 py-0.5 mx-[1px] rounded-md font-mono-tabular text-[0.88em] border break-words [overflow-wrap:anywhere] [-webkit-box-decoration-break:clone] [box-decoration-break:clone] ${theme.inlineCode}`}
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
            className={`inline px-1.5 py-0.5 mx-0.5 rounded-md border align-baseline text-[0.9em] break-words [overflow-wrap:anywhere] [-webkit-box-decoration-break:clone] [box-decoration-break:clone] ${
              inline.safeHref
                ? theme.linkPill
                : 'bg-[var(--tm-bg-control)] border-[var(--tm-border-default)] text-[var(--tm-text-secondary)]'
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
          className="overflow-x-auto rounded-2xl border border-[var(--tm-border-default)] bg-[var(--tm-bg-table)]"
        >
          <table className={`w-full border-collapse text-left ${scale.tableText}`}>
            <thead className={`border-b border-[var(--tm-border-default)] ${theme.tableHeader}`}>
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
            <tbody className="divide-y divide-[var(--tm-border-subtle)]">
              {block.rows.map((row, rowIdx) => (
                <tr key={`${blockKey}-tr-${rowIdx}`} className="hover:bg-[var(--tm-bg-row-hover)]">
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
                            ? 'min-w-[140px] whitespace-normal break-words [overflow-wrap:anywhere] text-[var(--tm-text-secondary)]'
                            : col.isNumeric
                              ? 'font-mono-tabular whitespace-nowrap text-[var(--tm-text-primary)]'
                              : 'max-w-[180px] whitespace-normal break-words [overflow-wrap:anywhere] text-[var(--tm-text-secondary)]'
                        }`}
                      >
                        {cell.length > 0 ? (
                          renderInlines(cell, theme, `${blockKey}-td-${rowIdx}-${colIdx}`)
                        ) : (
                          <span className="text-[var(--tm-text-muted)]">—</span>
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
            className="pointer-events-none absolute inset-y-[1px] right-[1px] w-7 rounded-r-2xl bg-gradient-to-l from-[var(--tm-bg-table)] to-transparent"
          />
        )}
      </div>
      {hasOverflow && (
        <div
          aria-hidden="true"
          className="flex items-center justify-end gap-1 px-1 text-[11px] text-[var(--tm-text-muted)] select-none"
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
          className={`scroll-mt-4 !mt-5 first:!mt-0 font-bold tracking-tight text-[var(--tm-text-primary)] pb-2 border-b border-[var(--tm-border-default)] break-words ${scale.h1}`}
        >
          {content}
        </h1>
      );
    case 2:
      return (
        <h2
          key={key}
          id={headingId}
          className={`scroll-mt-4 !mt-5 first:!mt-0 font-bold tracking-tight text-[var(--tm-text-primary)] flex items-start gap-2 ${scale.h2}`}
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
          className={`scroll-mt-4 !mt-4 first:!mt-0 font-semibold text-[var(--tm-text-primary)] break-words ${scale.h3}`}
        >
          {content}
        </h3>
      );
    case 4:
      return (
        <h4
          key={key}
          id={headingId}
          className={`scroll-mt-4 !mt-3 first:!mt-0 font-semibold text-[var(--tm-text-secondary)] break-words ${scale.h4}`}
        >
          {content}
        </h4>
      );
    case 5:
      return (
        <h5
          key={key}
          id={headingId}
          className="scroll-mt-4 !mt-3 first:!mt-0 text-xs font-semibold uppercase tracking-wide text-[var(--tm-text-secondary)] break-words"
        >
          {content}
        </h5>
      );
    case 6:
      return (
        <h6
          key={key}
          id={headingId}
          className="scroll-mt-4 !mt-3 first:!mt-0 text-[11px] font-semibold uppercase tracking-wider text-[var(--tm-text-muted)] break-words"
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
          <p key={key} className="text-[var(--tm-text-secondary)] break-words">
            {renderInlines(block.inlines, theme, key)}
          </p>
        );

      case 'hr':
        return <hr key={key} className="border-0 border-t border-[var(--tm-border-default)] my-2.5" />;

      case 'blockquote':
        return (
          <blockquote
            key={key}
            className={`rounded-2xl border-l-2 px-3.5 py-2.5 text-[var(--tm-text-secondary)] space-y-2 ${theme.blockquote}`}
          >
            {renderBlocks(block.blocks, theme, scale, idPrefix, key, listDepth)}
          </blockquote>
        );

      case 'code':
        return (
          <div
            key={key}
            className="rounded-2xl glass-inset overflow-hidden border border-[var(--tm-border-default)]"
          >
            <div className="px-3 py-1 border-b border-[var(--tm-border-subtle)] bg-[var(--tm-bg-row)] flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono-tabular uppercase tracking-wider text-[var(--tm-text-muted)] min-w-0 truncate">
                <Terminal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{block.lang || 'code'}</span>
              </span>
              <CopyButton
                text={block.text}
                ariaLabel={`复制 ${block.lang || 'code'} 代码块`}
                label="复制"
                copiedLabel="已复制"
                className="min-h-[40px] px-2.5 py-1 text-[11px]"
              />
            </div>
            <pre
              className={`p-3 overflow-x-auto font-mono-tabular leading-relaxed text-[var(--tm-text-primary)] select-text ${scale.codeText}`}
            >
              <code>{block.text}</code>
            </pre>
          </div>
        );

      case 'list': {
        const listItems = block.items.map((item, itemIdx) => {
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
                      : 'border-[var(--tm-border-strong)] bg-[var(--tm-bg-control)]'
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
                    listDepth > 0 ? 'bg-[var(--tm-text-muted)]' : theme.bullet
                  }`}
                />
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                {item.inlines.length > 0 && (
                  <div
                    className={`break-words ${
                      item.checked
                        ? 'text-[var(--tm-text-muted)] line-through decoration-[var(--tm-border-strong)]'
                        : 'text-[var(--tm-text-secondary)]'
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
        });
        return block.ordered ? (
          <ol key={key} start={block.start !== 1 ? block.start : undefined} className="space-y-1.5">
            {listItems}
          </ol>
        ) : (
          <ul key={key} className="space-y-1.5">
            {listItems}
          </ul>
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
      <p className={`select-text text-xs text-[var(--tm-text-muted)] leading-relaxed ${className}`}>
        {emptyText}
      </p>
    );
  }

  return (
    <div
      className={`select-text text-[var(--tm-text-secondary)] ${scale.prose} ${spacingClass} ${className}`.trim()}
    >
      {hasFrontmatter && (
        <DetailsDisclosure
          className="glass-inset rounded-2xl px-3.5"
          summary={<span className="text-xs font-medium text-[var(--tm-text-secondary)]">文档元数据</span>}
          summaryMeta={
            <span className="text-[11px] tabular-nums text-[var(--tm-text-muted)]">
              {doc.frontmatter.length} 项
            </span>
          }
          bodyClassName="pb-3 pt-1.5 border-t border-[var(--tm-border-subtle)]"
        >
          <dl className="grid grid-cols-2 gap-2">
            {doc.frontmatter.map((entry, idx) => (
              <div
                key={`${entry.key}-${idx}`}
                className="rounded-xl bg-[var(--tm-bg-row)] border border-[var(--tm-border-subtle)] px-2.5 py-1.5 min-w-0"
              >
                <dt className="text-[11px] text-[var(--tm-text-muted)] truncate">{entry.key}</dt>
                <dd className="text-[11px] font-mono-tabular text-[var(--tm-text-primary)] mt-0.5 break-all">
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
