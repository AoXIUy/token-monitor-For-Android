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
