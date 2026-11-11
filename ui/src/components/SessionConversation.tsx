import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Layers,
  MessageSquare,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import type {
  SessionConversationItemDescriptor,
  SessionConversationState,
  SessionDevice,
} from '../types/monitor';
import { conversationError, groupConversationBlocks } from '../conversationState';
import { copyTextToClipboard, formatFullTime, formatShortTime } from '../utils/formatters';

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
      return 'bg-violet-500/15 text-violet-300 border-violet-400/25';
    case 'tool_call':
      return 'bg-sky-500/15 text-sky-300 border-sky-400/25';
    case 'tool_result':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/25';
    case 'context':
      return 'bg-amber-500/15 text-amber-300 border-amber-400/25';
    default:
      return 'bg-white/8 text-slate-300 border-white/15';
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
  const [copied, setCopied] = useState('');
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
    conversation?.key === detailKey && conversation.deviceId === target && canRead
      ? conversation
      : null;

  useEffect(() => {
    onClear();
    setCopied('');
    setShowAllEvents(false);
    setOpenEventGroups(new Set());
    setSearchQuery('');
    return onClear;
  }, [detailKey, target, canRead, onClear]);

  const grouped = useMemo(
    () => groupConversationBlocks(current?.messages || [], searchQuery),
    [current?.messages, searchQuery]
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
          .map((b) => b.id)
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

  return (
    <section
      id="session-conversation"
      className="glass-panel rounded-3xl p-5 space-y-3.5 scroll-mt-16"
      data-session-conversation="true"
      aria-busy={current?.loading || false}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-sky-400 shrink-0" />
            <span>对话与上下文</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            默认仅显示对话问答，点击「事件详情」展开工具与上下文
          </p>
        </div>
        <button
          type="button"
          data-read-conversation="true"
          disabled={!canRead || current?.loading}
          onClick={() => onQuery(target, detailKey)}
          className="min-h-[44px] px-3.5 rounded-xl bg-sky-500/12 hover:bg-sky-500/20 border border-sky-400/25 text-sky-300 text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5 shrink-0 transition-colors"
        >
          {current?.loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
          {current?.loading ? '读取中…' : current ? '刷新对话' : '查看对话'}
        </button>
      </div>

      {owners.length > 1 && (
        <label className="block text-xs text-slate-400">
          来源设备
          <select
            aria-label="对话来源设备"
            value={target}
            onChange={(event) => setSelected(event.target.value)}
            className="w-full min-h-[44px] mt-1 px-3 rounded-xl bg-[#111b25] text-slate-200 border border-white/10"
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

      <p className="text-[11px] text-slate-400 leading-relaxed">
        {canRead
          ? `按需从 ${owner?.hostname || target} 读取本机会话，不受统计周期筛选。正文仅用于当前查看。`
          : !available
          ? '连接恢复且应用位于前台时，可查询在线设备的对话。'
          : '这条会话暂无在线来源设备。'}
      </p>

      {current?.error && (
        <p
          role="alert"
          data-conversation-error="true"
          className="text-xs text-amber-300 bg-amber-500/10 border border-amber-400/25 rounded-2xl p-3 leading-relaxed"
        >
          {conversationError(current.error)}
        </p>
      )}

      {current?.incomplete && (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-xl p-2.5">
          日志包含尚未写完或无法识别的记录，当前显示已读取内容。
        </p>
      )}

      {current && !current.loading && !current.error && current.messages.length === 0 && (
        <p className="text-xs text-slate-400 glass-inset rounded-2xl p-4 text-center">
          日志中没有可显示的文字消息。
        </p>
      )}

      {hasMessages && (
        <div className="space-y-2.5 pt-1 border-t border-white/8">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-[11px] font-mono-tabular text-slate-300">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg glass-inset">
                <MessageSquare className="w-3 h-3 text-sky-400" />
                <span>对话 {grouped.dialogueCount}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg glass-inset text-slate-400">
                <Layers className="w-3 h-3 text-amber-400" />
                <span>事件 {grouped.eventCount}</span>
              </span>
            </div>

            {grouped.eventCount > 0 && (
              <button
                type="button"
                data-toggle-conversation-events="true"
                aria-pressed={showAllEvents}
                onClick={handleToggleAllEvents}
                className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors ${
                  showAllEvents
                    ? 'bg-sky-500/18 border-sky-400/40 text-sky-200'
                    : 'glass-inset hover:border-white/20 text-slate-300'
                }`}
              >
                {showAllEvents ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-sky-300" />
                    <span>隐藏事件详情</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-sky-400" />
                    <span>显示全部事件 ({grouped.eventCount})</span>
                  </>
                )}
              </button>
            )}
          </div>

          {(grouped.dialogueCount + grouped.eventCount > 2 || hasSearch) && (
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="search"
                data-conversation-search="true"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索已加载的对话、工具名称或上下文…"
                aria-label="搜索对话与上下文"
                autoComplete="off"
                className="w-full min-h-[38px] pl-9 pr-9 py-1.5 rounded-xl glass-inset text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="清除对话搜索"
                  className="w-8 h-8 flex items-center justify-center absolute right-1 text-slate-400 hover:text-slate-200 rounded-lg"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3" data-conversation-messages="true">
        {hasMessages && hasSearch && grouped.blocks.length === 0 && (
          <p className="text-xs text-slate-400 glass-inset rounded-2xl p-4 text-center">
            当前已加载内容中未找到匹配「{searchQuery.trim()}」的记录。
          </p>
        )}

        {hasMessages &&
          !hasSearch &&
          grouped.dialogueCount === 0 &&
          grouped.eventCount > 0 &&
          !showAllEvents &&
          openEventGroups.size === 0 && (
            <p className="text-xs text-slate-400 bg-white/[0.02] border border-white/8 rounded-2xl p-3 leading-relaxed">
              当前页共有 {grouped.eventCount} 条上下文与工具事件，默认已收起；点击下方「查看事件详情」或右上角「显示全部事件」即可查看。
            </p>
          )}

        {grouped.blocks.map((block) => {
          if (block.type === 'dialogue') {
            const { item, meta } = block;
            const isUser = item.role === 'user';
            const isCopied = copied === item.id;
            return (
              <article
                key={item.id}
                data-message-role={item.role}
                className={`rounded-2xl p-3.5 border [content-visibility:auto] ${
                  isUser
                    ? 'bg-sky-500/[0.08] border-sky-400/20'
                    : 'bg-white/[0.035] border-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${
                        isUser
                          ? 'bg-sky-500/20 text-sky-200'
                          : 'bg-emerald-500/18 text-emerald-200'
                      }`}
                    >
                      {meta.badge}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono-tabular">
                      {item.timestamp ? formatFullTime(item.timestamp) : '时间未提供'}
                      {item.parts > 1
                        ? ` · 已合并 ${item.parts} 段续文`
                        : item.continued
                        ? ' · 续文'
                        : ''}
                    </span>
                  </div>

                  <button
                    type="button"
                    aria-label={`复制${meta.badge}`}
                    onClick={async () => {
                      if (await copyTextToClipboard(item.text)) setCopied(item.id);
                    }}
                    className="min-h-[32px] px-2.5 rounded-lg bg-white/[0.04] hover:bg-sky-500/15 border border-white/[0.08] text-[11px] text-sky-300 flex items-center gap-1 shrink-0 transition-colors"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-300">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>复制</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs leading-6 font-sans text-slate-100 select-text">
                  {item.text}
                </pre>
              </article>
            );
          }

          const groupOpen = showAllEvents || openEventGroups.has(block.id) || hasSearch;
          return (
            <div
              key={block.id}
              data-event-group={block.id}
              className="rounded-2xl border border-white/8 bg-white/[0.015] overflow-hidden"
            >
              <button
                type="button"
                data-event-group-toggle={block.id}
                aria-expanded={groupOpen}
                onClick={() => handleToggleEventGroup(block.id)}
                className="w-full min-h-[42px] px-3.5 py-2 flex items-center justify-between gap-2 text-left hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-wrap text-xs">
                  <span className="inline-flex items-center gap-1 font-medium text-slate-300">
                    {block.counts.tool > 0 ? (
                      <Terminal className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    )}
                    <span>{groupOpen ? '事件详情' : '查看事件详情'}</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono-tabular truncate">
                    {block.counts.total} 条（{block.summaryLabel}）
                  </span>
                </div>

                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-300 shrink-0">
                  <span>{groupOpen ? '收起' : '点击显示'}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-150 ${
                      groupOpen ? 'rotate-180 text-sky-300' : 'text-slate-400'
                    }`}
                  />
                </span>
              </button>

              {groupOpen && (
                <div
                  data-event-group-list={block.id}
                  className="px-3 pb-3 pt-1.5 border-t border-white/8 space-y-2"
                >
                  {block.events.map(({ item, meta }) => {
                    const isCopied = copied === item.id;
                    return (
                      <details
                        key={item.id}
                        data-message-role={item.role}
                        data-event-kind={item.kind}
                        className="group rounded-xl border border-white/10 bg-[#0B1017]/80 p-2.5 [content-visibility:auto]"
                      >
                        <summary className="min-h-[34px] cursor-pointer list-none flex flex-col justify-center gap-1 text-xs text-slate-300">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${eventBadgeStyle(
                                  meta.category
                                )}`}
                              >
                                {meta.badge}
                              </span>
                              {meta.detail && meta.detail !== meta.badge && (
                                <span className="font-mono-tabular text-[11px] text-slate-300 truncate max-w-[180px]">
                                  {meta.detail}
                                </span>
                              )}
                              {item.parts > 1 ? (
                                <span className="text-[10px] text-slate-400">
                                  · 合并 {item.parts} 段
                                </span>
                              ) : item.continued ? (
                                <span className="text-[10px] text-slate-400">· 续文</span>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-slate-400 font-mono-tabular">
                              {item.timestamp && <span>{formatShortTime(item.timestamp)}</span>}
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400 transition-transform duration-150 group-open:rotate-90 group-open:text-sky-400" />
                            </div>
                          </div>

                          <p className="text-[11px] text-slate-400 font-mono-tabular truncate group-open:hidden">
                            {meta.preview}
                          </p>
                        </summary>

                        <div className="mt-2.5 pt-2 border-t border-white/8">
                          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 mb-2">
                            <span>
                              {item.timestamp ? formatFullTime(item.timestamp) : '时间未提供'}
                              {item.parts > 1
                                ? ` · 已合并 ${item.parts} 段续文`
                                : item.continued
                                ? ' · 续文'
                                : ''}
                            </span>
                            <button
                              type="button"
                              aria-label={`复制${meta.badge}`}
                              onClick={async () => {
                                if (await copyTextToClipboard(item.text)) setCopied(item.id);
                              }}
                              className="min-h-[30px] px-2 rounded-lg bg-white/[0.04] hover:bg-sky-500/15 border border-white/[0.08] text-sky-300 flex items-center gap-1"
                            >
                              {isCopied ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-300">已复制</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>复制</span>
                                </>
                              )}
                            </button>
                          </div>

                          <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs leading-5 font-mono-tabular text-slate-200 select-text max-h-80 overflow-y-auto">
                            {item.text}
                          </pre>
                        </div>
                      </details>
                    );
                  })}
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
          disabled={current.loading || Boolean(current.error)}
          onClick={() => onQuery(target, detailKey, current.nextCursor)}
          className="min-h-[44px] w-full rounded-xl bg-white/6 hover:bg-white/10 border border-white/10 text-xs font-semibold text-sky-300 disabled:opacity-40 transition-colors"
        >
          {current.loading ? '正在读取…' : '加载后续对话'}
        </button>
      )}

      {current && !current.loading && !current.error && !current.nextCursor && current.messages.length > 0 && (
        <p className="text-[11px] text-slate-500 text-center">
          已读到当前日志末尾 · 新消息可点击刷新
        </p>
      )}
    </section>
  );
}
