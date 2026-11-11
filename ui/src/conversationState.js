// @ts-check

/** @param {import('./types/monitor').SessionConversationState | null} previous
 * @param {{deviceId: string, key: string, cursor: string, requestId: string}} query
 * @returns {import('./types/monitor').SessionConversationState} */
export function beginConversation(previous, query) {
  const append = Boolean(query.cursor && previous && previous.deviceId === query.deviceId
    && previous.key === query.key && previous.nextCursor === query.cursor);
  const retained = append ? previous : null;
  return { ...query, messages: retained?.messages || [], revision: retained?.revision || '',
    nextCursor: retained?.nextCursor || '', incomplete: retained?.incomplete || false, loading: true, error: '' };
}

/** @param {import('./types/monitor').SessionConversationState | null} current
 * @param {Record<string, unknown>} message
 * @returns {import('./types/monitor').SessionConversationState | null} */
export function receiveConversation(current, message) {
  if (!current || !current.loading || message.deviceId !== current.deviceId || message.key !== current.key
    || message.cursor !== current.cursor || message.requestId !== current.requestId) return current;
  /** @type {any} */
  const page = message.page;
  if (page && typeof page.error === 'string') return { ...current, loading: false, error: page.error.slice(0, 80) };
  if (!page || !Array.isArray(page.messages) || page.messages.length > 40 || typeof page.revision !== 'string' || !/^[a-f0-9]{24}$/.test(page.revision)
    || typeof page.nextCursor !== 'string' || (page.nextCursor && (!/^[a-f0-9]{24}:[0-9]{1,7}$/.test(page.nextCursor)
      || page.nextCursor.split(':')[0] !== page.revision || Number(page.nextCursor.split(':')[1]) <= Number(current.cursor.split(':')[1] || 0)))
    || (current.cursor && current.revision !== page.revision)) return { ...current, loading: false, error: 'invalid_response' };
  /** @type {import('./types/monitor').SessionConversationMessage[]} */
  const messages = [];
  for (const item of page.messages) {
    if (!item || !['user', 'assistant', 'tool', 'system'].includes(item.role) || typeof item.id !== 'string' || item.id.length > 100
      || typeof item.text !== 'string' || item.text.length > 12000 || typeof item.timestamp !== 'string' || item.timestamp.length > 40
      || typeof item.kind !== 'string' || item.kind.length > 80) return { ...current, loading: false, error: 'invalid_response' };
    messages.push({ id: item.id, role: item.role, text: item.text, timestamp: item.timestamp, kind: item.kind, continued: item.continued === true });
  }
  return { ...current, messages: [...current.messages, ...messages], revision: page.revision,
    nextCursor: page.nextCursor, incomplete: current.incomplete || page.incomplete === true, loading: false, error: '' };
}

/** @param {string} error */
export function conversationError(error) {
  /** @type {Record<string, string>} */
  const labels = {
    disabled: 'Hub 尚未开启对话查询，请按部署说明开启后重试。',
    device_offline: '来源设备离线，或尚未开启对话查询。请在该设备启动支持此功能的采集端。',
    reader_busy: '来源设备正在处理其他查询，请稍后重试。',
    not_found: '来源设备已不再提供这条会话，请刷新会话列表。',
    source_unavailable: '来源设备未找到可读对话。Antigravity 需要本机导出的对话日志，Codex 需要保留 rollout 日志。',
    source_changed: '对话已更新，请点击刷新重新读取，避免混合不同版本的内容。',
    file_too_large: '此对话超过单次读取的 64 MiB 上限，请在来源设备查看。',
    query_timeout: '来源设备查询超时，请确认设备在线后重试。',
    unsupported_hub: '当前 Hub 不支持对话查询，请更新到支持此功能的 Node Hub。',
    unsupported_app: '当前 APK 原生接口不支持对话查询，请升级应用。',
    preview_unavailable: '浏览器预览不连接来源设备，请在 APK 中查看对话。',
    unauthorized: '认证失败，请检查 Hub secret。',
  };
  return labels[error] || '对话读取失败，请检查网络并重试。';
}

/** @param {Pick<import('./types/monitor').SessionConversationMessage, 'role' | 'kind'>} message */
export function isConversationEvent(message) {
  if (!message) return true;
  return message.role === 'tool' || message.role === 'system' || message.kind !== 'message';
}

/** @param {string} id */
function baseMessageId(id) {
  const text = String(id || '');
  const dot = text.lastIndexOf('.');
  return dot > 0 && /^\d+$/.test(text.slice(dot + 1)) ? text.slice(0, dot) : text;
}

/** @param {import('./types/monitor').SessionConversationMessage[]} messages
 * @returns {import('./types/monitor').SessionConversationItem[]} */
export function mergeConversationContinuations(messages) {
  /** @type {import('./types/monitor').SessionConversationItem[]} */
  const merged = [];
  for (const item of messages || []) {
    if (!item) continue;
    const prev = merged[merged.length - 1];
    if (
      item.continued === true &&
      prev &&
      prev.role === item.role &&
      prev.kind === item.kind &&
      baseMessageId(prev.id) === baseMessageId(item.id)
    ) {
      prev.text = `${prev.text}${item.text}`;
      prev.parts += 1;
      continue;
    }
    merged.push({ ...item, parts: 1 });
  }
  return merged;
}

/** @param {string} text */
function previewText(text, maxLength = 72) {
  const collapsed = String(text || '').replace(/\s+/g, ' ').trim();
  if (!collapsed) return '（空内容）';
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength)}…` : collapsed;
}

/** @param {import('./types/monitor').SessionConversationMessage} message
 * @returns {import('./types/monitor').SessionConversationItemDescriptor} */
export function describeConversationItem(message) {
  const isEvent = isConversationEvent(message);
  const preview = previewText(message?.text || '');
  if (!isEvent) {
    const isUser = message.role === 'user';
    return {
      isEvent: false,
      category: isUser ? 'user' : 'assistant',
      badge: isUser ? '你' : '助手',
      title: isUser ? '你' : '助手',
      detail: '',
      preview,
    };
  }
  const kind = String(message?.kind || '').trim();
  if (kind === 'reasoning_summary') {
    return {
      isEvent: true,
      category: 'thinking',
      badge: '思考摘要',
      title: '已记录的思考摘要',
      detail: 'reasoning_summary',
      preview,
    };
  }
  if (message?.role === 'system' || kind === 'context' || kind === 'compaction') {
    const isCompaction = kind === 'compaction';
    return {
      isEvent: true,
      category: 'context',
      badge: isCompaction ? '上下文压缩' : '系统上下文',
      title: isCompaction ? '上下文压缩摘要' : '上下文 / 事件',
      detail: kind || 'system',
      preview,
    };
  }
  if (message?.role === 'tool') {
    const isResult = kind === 'tool_result';
    return {
      isEvent: true,
      category: isResult ? 'tool_result' : 'tool_call',
      badge: isResult ? '工具输出' : '工具调用',
      title: isResult ? '工具输出 · tool_result' : `工具调用 · ${kind || 'tool'}`,
      detail: kind || 'tool',
      preview,
    };
  }
  return {
    isEvent: true,
    category: 'event',
    badge: '事件记录',
    title: `上下文 / 事件 · ${kind || message?.role || 'event'}`,
    detail: kind || message?.role || 'event',
    preview,
  };
}

/** @param {import('./types/monitor').SessionConversationEventCounts} counts */
function formatEventSummaryLabel(counts) {
  const parts = [];
  if (counts.thinking > 0) parts.push(`思考 ${counts.thinking}`);
  if (counts.tool > 0) parts.push(`工具 ${counts.tool}`);
  if (counts.context > 0) parts.push(`上下文 ${counts.context}`);
  return parts.length ? parts.join(' · ') : `事件 ${counts.total}`;
}

/** @param {import('./types/monitor').SessionConversationMessage[]} messages
 * @param {string} [query]
 * @returns {import('./types/monitor').SessionConversationGroupedView} */
export function groupConversationBlocks(messages, query = '') {
  const merged = mergeConversationContinuations(messages);
  const needle = String(query || '').trim().toLocaleLowerCase();
  let dialogueCount = 0;
  let eventCount = 0;
  let matchedDialogueCount = 0;
  let matchedEventCount = 0;
  /** @type {import('./types/monitor').SessionConversationBlock[]} */
  const blocks = [];

  for (const item of merged) {
    const meta = describeConversationItem(item);
    if (meta.isEvent) eventCount += 1;
    else dialogueCount += 1;

    if (needle) {
      const haystack = `${item.text}\n${item.kind}\n${meta.badge}\n${meta.title}\n${item.role}`.toLocaleLowerCase();
      if (!haystack.includes(needle)) continue;
    }

    if (meta.isEvent) {
      matchedEventCount += 1;
      const last = blocks[blocks.length - 1];
      const isThinking = meta.category === 'thinking';
      const isTool = meta.category === 'tool_call' || meta.category === 'tool_result';
      if (last && last.type === 'events') {
        last.events.push({ item, meta });
        last.counts.total += 1;
        if (isThinking) last.counts.thinking += 1;
        else if (isTool) last.counts.tool += 1;
        else last.counts.context += 1;
        last.summaryLabel = formatEventSummaryLabel(last.counts);
      } else {
        /** @type {import('./types/monitor').SessionConversationEventCounts} */
        const counts = {
          total: 1,
          thinking: isThinking ? 1 : 0,
          tool: isTool ? 1 : 0,
          context: !isThinking && !isTool ? 1 : 0,
        };
        blocks.push({
          type: 'events',
          id: `events-${item.id}`,
          events: [{ item, meta }],
          counts,
          summaryLabel: formatEventSummaryLabel(counts),
        });
      }
    } else {
      matchedDialogueCount += 1;
      blocks.push({
        type: 'dialogue',
        id: `dialogue-${item.id}`,
        item,
        meta,
      });
    }
  }

  return {
    blocks,
    dialogueCount,
    eventCount,
    matchedDialogueCount,
    matchedEventCount,
  };
}
