import { useEffect, useState } from 'react';
import { Copy, MessageSquare, RefreshCw } from 'lucide-react';
import type { SessionConversationMessage, SessionConversationState, SessionDevice } from '../types/monitor';
import { conversationError } from '../conversationState';
import { copyTextToClipboard, formatFullTime } from '../utils/formatters';

interface Props {
  detailKey: string;
  client?: string;
  owners: SessionDevice[];
  available: boolean;
  conversation: SessionConversationState | null;
  onQuery: (deviceId: string, key: string, cursor?: string) => void;
  onClear: () => void;
}

const roleLabel = (message: SessionConversationMessage) => message.kind === 'reasoning_summary' ? '已记录的思考摘要'
  : message.role === 'user' ? '你' : message.role === 'assistant' ? '助手' : message.role === 'tool' ? '工具' : '上下文 / 事件';

export function SessionConversation({ detailKey, client, owners, available, conversation, onQuery, onClear }: Props) {
  const [selected, setSelected] = useState('');
  const [copied, setCopied] = useState('');
  const owner = owners.find(source => source.deviceId === selected) || owners.find(source => !source.stale) || owners[0];
  const target = owner?.deviceId || '';
  const supported = client === 'codex' || client === 'antigravity';
  const canRead = supported && available && Boolean(owner && !owner.stale);
  const current = conversation?.key === detailKey && conversation.deviceId === target && canRead ? conversation : null;
  useEffect(() => {
    onClear();
    setCopied('');
    return onClear;
  }, [detailKey, target, canRead, onClear]);
  if (!supported) return null;

  return <section className="glass-panel rounded-3xl p-5 space-y-3" data-session-conversation="true" aria-busy={current?.loading || false}>
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-sky-400" />对话与上下文</h3>
      <button type="button" data-read-conversation="true" disabled={!canRead || current?.loading}
        onClick={() => onQuery(target, detailKey)}
        className="min-h-[44px] px-3 rounded-xl bg-sky-500/10 text-sky-300 text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5">
        {current?.loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
        {current?.loading ? '读取中…' : current ? '刷新对话' : '查看对话'}
      </button>
    </div>
    {owners.length > 1 && <label className="block text-xs text-slate-400">来源设备
      <select aria-label="对话来源设备" value={target} onChange={event => setSelected(event.target.value)}
        className="w-full min-h-[44px] mt-1 px-3 rounded-xl bg-[#111b25] text-slate-200 border border-white/10">
        {owners.map(source => <option key={source.deviceId} value={source.deviceId}>
          {source.hostname} · {source.deviceId}{source.stale ? '（离线）' : ''}
        </option>)}
      </select>
    </label>}
    <p className="text-[11px] text-slate-400 leading-relaxed">
      {canRead ? `按需从 ${owner?.hostname || target} 读取本机会话，不受统计周期筛选。正文仅用于当前查看。`
        : !available ? '连接恢复且应用位于前台时，可查询在线设备的对话。' : '这条会话暂无在线来源设备。'}
    </p>
    {current?.error && <p role="alert" data-conversation-error="true" className="text-xs text-amber-300 leading-relaxed">{conversationError(current.error)}</p>}
    {current?.incomplete && <p className="text-xs text-amber-300">日志包含尚未写完或无法识别的记录，当前显示已读取内容。</p>}
    {current && !current.loading && !current.error && current.messages.length === 0 && <p className="text-xs text-slate-400">日志中没有可显示的文字消息。</p>}
    <div className="space-y-3" data-conversation-messages="true">
      {current?.messages.map(message => {
        const auxiliary = message.role === 'tool' || message.role === 'system' || message.kind === 'reasoning_summary';
        const body = <>
          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 mb-2">
            <span>{message.timestamp ? formatFullTime(message.timestamp) : '时间未提供'}{message.continued ? ' · 续文' : ''}</span>
            <button type="button" aria-label={`复制${roleLabel(message)}`} onClick={async () => {
              if (await copyTextToClipboard(message.text)) setCopied(message.id);
            }} className="min-h-[36px] px-2 text-sky-300 flex items-center gap-1"><Copy className="w-3 h-3" />{copied === message.id ? '已复制' : '复制'}</button>
          </div>
          <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs leading-6 font-sans text-slate-200 select-text">{message.text}</pre>
        </>;
        return auxiliary ? <details key={message.id} data-message-role={message.role} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 [content-visibility:auto]">
          <summary className="min-h-[36px] cursor-pointer text-xs text-slate-400 break-all">{roleLabel(message)} · {message.kind}{message.continued ? ' · 续文' : ''}</summary>{body}
        </details> : <article key={message.id} data-message-role={message.role}
          className={`rounded-2xl p-3.5 border [content-visibility:auto] ${message.role === 'user' ? 'bg-sky-500/[0.07] border-sky-400/15' : 'bg-white/[0.03] border-white/10'}`}>
          <p className={`text-xs font-semibold mb-1 ${message.role === 'user' ? 'text-sky-300' : 'text-emerald-300'}`}>{roleLabel(message)}</p>{body}
        </article>;
      })}
    </div>
    {current?.nextCursor && <button type="button" data-more-conversation="true" disabled={current.loading || Boolean(current.error)}
      onClick={() => onQuery(target, detailKey, current.nextCursor)}
      className="min-h-[44px] w-full rounded-xl bg-white/5 text-xs text-sky-300 disabled:opacity-40">{current.loading ? '正在读取…' : '加载后续对话'}</button>}
    {current && !current.loading && !current.error && !current.nextCursor && current.messages.length > 0
      && <p className="text-[11px] text-slate-500 text-center">已读到当前日志末尾 · 新消息可点击刷新</p>}
  </section>;
}
