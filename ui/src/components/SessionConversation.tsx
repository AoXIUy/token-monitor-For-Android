import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type {
  SessionConversationItemDescriptor,
  SessionConversationState,
  SessionDevice,
} from '../types/monitor';
import { conversationError, groupConversationBlocks } from '../conversationState';
import { formatFullTime, formatShortTime } from '../utils/formatters';
import { MarkdownRenderer } from './MarkdownRenderer';
import {
  CopyButton,
  EmptyState,
  InlineAlert,
  SearchField,
  SectionHeader,
} from './ui/Primitives';

interface Props {
  detailKey: string;
  client?: string;
  owners: SessionDevice[];
  available: boolean;
  conversation: SessionConversationState | null;
  onQuery: (deviceId: string, key: string, cursor?: string) => void;
  onClear: () => void;
}

function eventBadgeStyle(category: SessionConversationItemDescriptor['category']): string {
  switch (category) {
    case 'thinking':
      return 'bg-violet-500/15 text-violet-200 border-violet-400/30';
    case 'tool_call':
      return 'bg-sky-500/15 text-sky-200 border-sky-400/30';
    case 'tool_result':
      return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30';
    case 'context':
      return 'bg-amber-500/15 text-amber-200 border-amber-400/30';
    default:
      return 'bg-white/[0.08] text-slate-200 border-white/15';
  }
}

export function SessionConversation({
  detailKey,
  client,
  owners,
  available,
  conversation,
  onQuery,
  onClear,
}: Props) {
  const [selected, setSelected] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [openEventGroups, setOpenEventGroups] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const owner =
    owners.find((source) => source.deviceId === selected) ||
    owners.find((source) => !source.stale) ||
    owners[0];
  const target = owner?.deviceId || '';
  const supported = client === 'codex' || client === 'antigravity';
  const canRead = supported && available && Boolean(owner && !owner.stale);
  const current =
    conversation?.key === detailKey && conversation.deviceId === target
      ? conversation
      : null;

  useEffect(() => {
    onClear();
    setShowAllEvents(false);
    setOpenEventGroups(new Set());
    setSearchQuery('');
    return onClear;
  }, [detailKey, target, onClear]);

  const grouped = useMemo(
    () => groupConversationBlocks(current?.messages || [], searchQuery),
    [current?.messages, searchQuery],
  );

  if (!supported) return null;

  const hasMessages = Boolean(current && current.messages.length > 0);
  const hasSearch = Boolean(searchQuery.trim());

  const handleToggleEventGroup = (groupId: string) => {
    if (showAllEvents) {
      setShowAllEvents(false);
      const next = new Set(
        grouped.blocks
          .filter((b) => b.type === 'events' && b.id !== groupId)
          .map((b) => b.id),
      );
      setOpenEventGroups(next);
      return;
    }
    setOpenEventGroups((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleToggleAllEvents = () => {
    if (showAllEvents) {
      setShowAllEvents(false);
      setOpenEventGroups(new Set());
    } else {
      setShowAllEvents(true);
    }
  };

  const subtitleText = canRead
    ? `按需从 ${owner?.hostname || target} 读取本机会话（不受周期筛选），默认折叠工具与上下文事件`
    : !available
    ? '连接恢复且应用位于前台时，可查询在线设备的对话'
    : '这条会话暂无在线来源设备';

  return (
    <section
      id="session-conversation"
      className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5 scroll-mt-16"
      data-session-conversation="true"
      aria-busy={current?.loading || false}
    >
      <SectionHeader
        icon={<MessageSquare className="w-4 h-4" />}
        title="对话与上下文"
        subtitle={subtitleText}
        action={
          <button
            type="button"
            data-read-conversation="true"
            disabled={!canRead || current?.loading}
            onClick={() => onQuery(target, detailKey)}
            className="min-h-[44px] px-3.5 rounded-xl bg-sky-500/14 hover:bg-sky-500/22 active:scale-[0.98] border border-sky-400/30 text-sky-200 text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5 shrink-0 transition-all whitespace-nowrap"
          >
            {current?.loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : null}
            <span>{current?.loading ? '读取中…' : current ? '刷新对话' : '查看对话'}</span>
          </button>
        }
      />

      {owners.length > 1 && (
        <label className="block text-xs text-slate-300 space-y-1.5">
          <span>来源设备</span>
          <select
            aria-label="对话来源设备"
            value={target}
            onChange={(event) => setSelected(event.target.value)}
            className="w-full min-h-[44px] px-3 py-2 text-xs glass-select focus:outline-none focus:border-sky-400/60"
          >
            {owners.map((source) => (
              <option key={source.deviceId} value={source.deviceId}>
                {source.hostname} · {source.deviceId}
                {source.stale ? '（离线）' : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      {current?.error && (
        <div data-conversation-error="true">
          <InlineAlert tone="amber" role="alert">
            {conversationError(current.error)}
          </InlineAlert>
        </div>
      )}

      {current?.incomplete && (
        <InlineAlert tone="amber">
          日志包含尚未写完或无法识别的记录，当前显示已读取内容。
        </InlineAlert>
      )}

      {current && !current.loading && !current.error && current.messages.length === 0 && (
        <EmptyState
          compact
          tone="slate"
          title="暂无文字消息"
          description="日志中没有可显示的文字消息。"
        />
      )}

      {hasMessages && (
        <div className="space-y-2.5 pt-3 border-t border-white/8">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-[11px] tabular-nums text-slate-300 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl glass-inset">
                <MessageSquare className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                <span>
                  对话{' '}
                  <strong className="font-mono-tabular text-slate-100">
                    {hasSearch
                      ? `${grouped.matchedDialogueCount}/${grouped.dialogueCount}`
                      : grouped.dialogueCount}
                  </strong>
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl glass-inset text-slate-300">
                <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                <span>
                  事件{' '}
                  <strong className="font-mono-tabular text-slate-100">
                    {hasSearch
                      ? `${grouped.matchedEventCount}/${grouped.eventCount}`
                      : grouped.eventCount}
                  </strong>
                </span>
              </span>
            </div>

            {grouped.eventCount > 0 && (
              <button
                type="button"
                data-toggle-conversation-events="true"
                aria-pressed={showAllEvents}
                onClick={handleToggleAllEvents}
                className={`min-h-[40px] px-3 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition-all active:scale-[0.98] ${
                  showAllEvents
                    ? 'bg-sky-500/18 border-sky-400/40 text-sky-100'
                    : 'glass-inset hover:border-white/20 text-slate-200'
                }`}
              >
                {showAllEvents ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-sky-300 shrink-0" aria-hidden="true" />
                    <span>隐藏事件详情</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                    <span className="tabular-nums">显示全部事件 ({grouped.eventCount})</span>
                  </>
                )}
              </button>
            )}
          </div>

          {(grouped.dialogueCount + grouped.eventCount > 2 || hasSearch) && (
            <SearchField
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="搜索已加载的对话、工具名称或上下文…"
              ariaLabel="搜索对话与上下文"
              clearAriaLabel="清除对话搜索"
              inputProps={{ 'data-conversation-search': 'true' }}
            />
          )}
        </div>
      )}

      <div className="space-y-3" data-conversation-messages="true">
        {hasMessages && hasSearch && grouped.blocks.length === 0 && (
          <EmptyState
            compact
            tone="slate"
            title="未找到匹配记录"
            description={`当前已加载内容中未找到匹配「${searchQuery.trim()}」的记录。`}
          />
        )}

        {hasMessages &&
          !hasSearch &&
          grouped.dialogueCount === 0 &&
          grouped.eventCount > 0 &&
          !showAllEvents &&
          openEventGroups.size === 0 && (
            <InlineAlert tone="sky">
              当前页共有 {grouped.eventCount} 条上下文与工具事件，默认已收起；轻触下方「查看事件详情」或上方「显示全部事件」即可查看。
            </InlineAlert>
          )}

        {grouped.blocks.map((block) => {
          if (block.type === 'dialogue') {
            const { item, meta } = block;
            const isUser = item.role === 'user';
            return (
              <article
                key={item.id}
                data-message-role={item.role}
                className={`rounded-2xl p-3.5 border [content-visibility:auto] ${
                  isUser
                    ? 'ml-3 border-sky-400/25 border-l-2 border-l-sky-400/80 bg-sky-500/[0.08]'
                    : 'border-white/10 border-l-2 border-l-emerald-400/70 bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        isUser
                          ? 'bg-sky-500/20 border-sky-400/30 text-sky-100'
                          : 'bg-emerald-500/16 border-emerald-400/30 text-emerald-200'
                      }`}
                    >
                      {meta.badge}
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      <span className="font-mono-tabular">
                        {item.timestamp ? formatFullTime(item.timestamp) : '时间未提供'}
                      </span>
                      {item.parts > 1
                        ? ` · 已合并 ${item.parts} 段续文`
                        : item.continued
                        ? ' · 续文'
                        : ''}
                    </span>
                  </div>

                  <CopyButton text={item.text} ariaLabel={`复制${meta.badge}`} />
                </div>

                {isUser ? (
                  <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[13px] leading-relaxed text-slate-100 select-text">
                    {item.text}
                  </div>
                ) : (
                  <MarkdownRenderer
                    markdown={item.text}
                    variant="compact"
                    fontScale="sm"
                    accent="sky"
                    className="select-text"
                  />
                )}
              </article>
            );
          }

          const groupOpen = showAllEvents || openEventGroups.has(block.id) || hasSearch;
          return (
            <div
              key={block.id}
              data-event-group={block.id}
              className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden"
            >
              <button
                type="button"
                data-event-group-toggle={block.id}
                aria-expanded={groupOpen}
                onClick={() => handleToggleEventGroup(block.id)}
                className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-200 shrink-0">
                    {block.counts.tool > 0 ? (
                      <Terminal className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" aria-hidden="true" />
                    )}
                    <span>{groupOpen ? '事件详情' : '查看事件详情'}</span>
                  </span>
                  <span className="text-[11px] text-slate-400 tabular-nums truncate min-w-0">
                    {block.counts.total} 条（{block.summaryLabel}）
                  </span>
                </div>

                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-300 shrink-0">
                  <span>{groupOpen ? '收起' : '展开'}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`w-4 h-4 transition-transform duration-150 ${
                      groupOpen ? 'rotate-180 text-sky-300' : 'text-slate-400'
                    }`}
                  />
                </span>
              </button>

              {groupOpen && (
                <div
                  data-event-group-list={block.id}
                  className="px-3 pb-3 pt-2 border-t border-white/8 space-y-2"
                >
                  {block.events.map(({ item, meta }) => (
                    <details
                      key={item.id}
                      data-message-role={item.role}
                      data-event-kind={item.kind}
                      className="group rounded-xl glass-inset p-3 [content-visibility:auto]"
                    >
                      <summary className="list-none [&::-webkit-details-marker]:hidden min-h-[44px] cursor-pointer flex flex-col justify-center gap-1 text-xs text-slate-200">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border shrink-0 ${eventBadgeStyle(
                                meta.category,
                              )}`}
                            >
                              {meta.badge}
                            </span>
                            {meta.detail && meta.detail !== meta.badge && (
                              <span className="font-mono-tabular text-[11px] text-slate-300 truncate min-w-0">
                                {meta.detail}
                              </span>
                            )}
                            {item.parts > 1 ? (
                              <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                                · 合并 {item.parts} 段
                              </span>
                            ) : item.continued ? (
                              <span className="text-[11px] text-slate-400 shrink-0">· 续文</span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-slate-400 font-mono-tabular">
                            {item.timestamp && <span>{formatShortTime(item.timestamp)}</span>}
                            <ChevronRight
                              aria-hidden="true"
                              className="w-4 h-4 text-slate-400 transition-transform duration-150 group-open:rotate-90 group-open:text-sky-400"
                            />
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-400 font-mono-tabular truncate group-open:hidden">
                          {meta.preview}
                        </p>
                      </summary>

                      <div className="mt-2.5 pt-2.5 border-t border-white/8 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 flex-wrap">
                          <span className="tabular-nums">
                            <span className="font-mono-tabular">
                              {item.timestamp ? formatFullTime(item.timestamp) : '时间未提供'}
                            </span>
                            {item.parts > 1
                              ? ` · 已合并 ${item.parts} 段续文`
                              : item.continued
                              ? ' · 续文'
                              : ''}
                          </span>
                          <CopyButton text={item.text} ariaLabel={`复制${meta.badge}`} />
                        </div>

                        <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs leading-5 font-mono-tabular text-slate-200 select-text max-h-80 overflow-y-auto">
                          {item.text}
                        </pre>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {current?.nextCursor && (
        <button
          type="button"
          data-more-conversation="true"
          disabled={!canRead || current.loading || Boolean(current.error)}
          onClick={() => onQuery(target, detailKey, current.nextCursor)}
          className="min-h-[44px] w-full rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] active:scale-[0.99] border border-white/10 text-xs font-semibold text-sky-200 disabled:opacity-40 transition-all"
        >
          {current.loading ? '正在读取…' : '加载后续对话'}
        </button>
      )}

      {current &&
        !current.loading &&
        !current.error &&
        !current.nextCursor &&
        current.messages.length > 0 && (
          <p className="text-[11px] text-slate-400 text-center">
            已读到当前日志末尾 · 新消息可点击刷新
          </p>
        )}
    </section>
  );
}
