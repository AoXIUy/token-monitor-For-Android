'use strict';

(function expose(root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(
    node ? require('../../../../src/shared/limits/balanceDisplay') : root.TokenMonitorLimitBalanceDisplay,
    node ? require('../../../../src/shared/sessionLive') : root.TokenMonitorSessionLive,
    node ? require('../../../../src/shared/sessionGroups') : root.TokenMonitorSessionGroups,
    node ? require('../../../../src/shared/deviceKind') : root.TokenMonitorDeviceKind,
    node ? require('../../../../src/shared/limits/windowText') : root.TokenMonitorLimitWindowText,
    node ? require('../../../../src/shared/limits/historyModel') : root.TokenMonitorLimitsHistoryModel,
    node ? require('../../../../src/shared/clientCatalog') : root.TokenMonitorClientCatalog,
    node ? require('../../../../src/shared/limits/windowLabels') : root.TokenMonitorLimitWindowLabels
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MonitorModel = api;
})(typeof window !== 'undefined' ? window : null, function createModel(balance, sessionLive, sessionGroups, deviceKinds, windowText, historyModel, clientCatalog, windowLabels) {
  const REMOTE_STATUS_MAX_AGE_MS = 30_000;
  function numeric(value) {
    return value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
  }
  function count(value) { return Math.max(0, numeric(value) ?? 0); }
  function clientLabel(id) { return clientCatalog?.CLIENT_LABELS[id] || id || '未知工具'; }
  function compact(value) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(count(value));
  }
  function money(value, currency = 'USD') {
    return numeric(value) === null ? '—' : balance.formatMoney(Number(value), currency);
  }
  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function expired(device, period, now = Date.now()) {
    if (period === 'allTime') return false;
    const end = Date.parse(device?.periodWindows?.[period]?.endsAt);
    if (Number.isFinite(end)) return now >= end;
    const updated = Date.parse(device?.updatedAt);
    if (!Number.isFinite(updated)) return false;
    const length = period === 'today' ? 10 : 7;
    return new Date(updated).toISOString().slice(0, length) !== new Date(now).toISOString().slice(0, length);
  }
  function select(stats, deviceId, periodName, now = Date.now()) {
    const device = deviceId ? (stats?.devices || []).find((row) => row.deviceId === deviceId) : null;
    // A removed device is unavailable. Never silently show the fleet's totals.
    if (deviceId && !device) return { period: null, providers: [], device: null, expired: false };
    const isExpired = device && expired(device, periodName, now);
    return {
      period: isExpired ? null : (device || stats)?.periods?.[periodName] || null,
      providers: (device || stats)?.limits?.providers || [],
      device,
      expired: Boolean(isExpired),
    };
  }
  function breakdown(period, kind) {
    if (kind === 'projects') {
      return Object.entries(period?.projects || {}).map(([id, row]) => ({ id, label: row.label || id, tokens: count(row.tokens), cost: numeric(row.costUsd) }))
        .sort((a, b) => b.tokens - a.tokens || a.label.localeCompare(b.label));
    }
    const costs = kind === 'models' ? period?.modelCosts : period?.clientCosts;
    return Object.entries(period?.[kind] || {}).map(([id, tokens]) => ({ id, label: id, tokens: count(tokens), cost: numeric(costs?.[id]) }))
      .sort((a, b) => b.tokens - a.tokens || a.id.localeCompare(b.id));
  }
  function sessions(period, query = '') {
    const search = query.trim().toLocaleLowerCase();
    const rows = Object.entries(period?.sessions || {}).map(([key, row]) => ({ ...row, key,
      parentKey: row.parentSessionId ? `${row.parentClient || row.client}:${row.parentSessionId}` : '' }));
    const matches = row => [row.title, row.sessionId, row.client, row.projectLabel, ...Object.keys(row.models || {})]
      .some(value => String(value || '').toLocaleLowerCase().includes(search));
    // Filter whole families so a matching child never loses its parent or the
    // other accounting members. Pagination is applied by the view afterwards.
    return sessionGroups.sessionFamilies(rows, row => row.sessionKind !== 'background-review' && !sessionLive.isGrokBotSession(row))
      .map(({ parent, members, splitIdentity }) => {
        if (!members.length) return parent;
        const identity = sessionGroups.conversationIdentity(parent);
        const sameConversation = row => sessionGroups.conversationIdentity(row) === identity;
        const main = [parent, ...members].filter(sameConversation).sort(compareSessions);
        const children = members.filter(row => !sameConversation(row)).sort(compareSessions);
        const groupRows = [...main, ...children].map(row => ({ ...row, groupRole: sameConversation(row) ? 'main' : 'subagent' }));
        const group = { ...main[0],
          key: `session-group:subagents:${identity.replace(/^session:/, '')}${splitIdentity ? `:root:${encodeURIComponent(parent.key)}` : ''}`,
          detailKey: main[0].key,
          groupRows,
          subagentCount: new Set(children.map(sessionGroups.conversationIdentity)).size,
          lastUsedAt: [...groupRows].sort(compareSessions)[0].lastUsedAt,
        };
        for (const field of ['totalTokens', 'costUsd', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens',
          'reasoningTokens', 'unclassifiedTokens', 'messageCount', 'timedOutputTokens', 'timedDurationMs']) {
          const values = groupRows.map(row => numeric(row[field]));
          group[field] = values.every(value => value !== null) ? values.reduce((sum, value) => sum + value, 0) : null;
        }
        group.unpricedTokens = groupRows.reduce((sum, row) => sum + count(row.unpricedTokens), 0);
        group.models = {};
        for (const row of groupRows) {
          for (const [model, tokens] of Object.entries(row.models || {})) {
            group.models[model] = count(group.models[model]) + count(tokens);
          }
        }
        return group;
      })
      .filter(row => !search || (row.groupRows || [row]).some(matches))
      .sort(compareSessions);
  }
  function compareSessions(a, b) {
    return (Date.parse(b.lastUsedAt || '') || 0) - (Date.parse(a.lastUsedAt || '') || 0) || a.key.localeCompare(b.key);
  }
  function filterSessionTools(rows, selectedTool = '') {
    const clients = row => (row.groupRows || [row]).map(member => member.client).filter(Boolean);
    const tools = [...new Set(rows.flatMap(clients))].sort();
    const tool = tools.length > 1 && tools.includes(selectedTool) ? selectedTool : '';
    return { tools, tool, rows: tool ? rows.filter(row => clients(row).includes(tool)) : rows };
  }
  function filterSessionStatuses(statuses, filter = 'all') {
    const counts = { running: 0, waiting: 0, ended: 0 };
    const indices = [];
    statuses.forEach((status, index) => {
      if (Object.prototype.hasOwnProperty.call(counts, status.state)) counts[status.state]++;
      if (filter === 'all' || status.state === filter) indices.push(index);
    });
    return { counts, indices };
  }
  function deviceKind(value) { return deviceKinds.normalizeDeviceKind(value); }
  function sessionDevices(row, stats, period, deviceId = '') {
    const keys = (row.groupRows || [row]).map(member => member.key);
    // Provenance is display-only. A shared accounting key may have several
    // owners, and a family may span devices; retain all of them without summing.
    return (stats?.devices || []).filter(device => (!deviceId || device.deviceId === deviceId)
      && keys.some(key => Object.prototype.hasOwnProperty.call(device.periods?.[period]?.sessions || {}, key)))
      .map(device => ({ deviceId: device.deviceId, hostname: device.hostname || device.deviceId,
        platform: device.osName || device.platform || '', deviceKind: deviceKind(device.deviceKind), stale: device.stale === true }));
  }
  function sessionDetail(stats, key, options = {}) {
    const device = options.deviceId ? (stats?.devices || []).find((row) => row.deviceId === options.deviceId) : null;
    if (options.deviceId && !device) return null;
    const periods = (device || stats)?.periods;
    const now = options.now ?? Date.now();
    const preferred = options.period === 'today' ? ['today', 'month'] : ['month', 'today'];
    for (const period of preferred) {
      if (device && expired(device, period, now)) continue;
      const rows = periods?.[period]?.sessions;
      if (!rows || !Object.prototype.hasOwnProperty.call(rows, key)) continue;
      const row = { ...rows[key], key };
      const owners = (stats.devices || []).filter((source) => (!device || source.deviceId === device.deviceId)
        && Object.prototype.hasOwnProperty.call(source.periods?.[period]?.sessions || {}, key))
        .map((source) => ({ deviceId: source.deviceId, hostname: source.hostname || source.deviceId,
          stale: source.stale === true, platform: source.osName || source.platform || '', deviceKind: deviceKind(source.deviceKind),
          updatedAt: source.updatedAt, receivedAt: source.receivedAt, session: source.periods[period].sessions[key] }));
      const parentKey = row.parentSessionId ? `${row.parentClient || row.client}:${row.parentSessionId}` : '';
      const children = Object.entries(rows).filter(([, child]) => child.parentSessionId === row.sessionId
        && (child.parentClient || child.client) === row.client)
        .map(([childKey, child]) => ({ key: childKey, label: child.title || child.projectLabel || child.sessionId || childKey }));
      const duration = numeric(row.timedDurationMs);
      const timedOutput = numeric(row.timedOutputTokens);
      return {
        row, period, owners, children, parentKey,
        models: breakdown({ models: row.models, modelCosts: row.modelCosts }, 'models').map(model => (
          row.modelTokenComponents?.[model.id] ? { ...model, components: row.modelTokenComponents[model.id] } : model
        )),
        providers: Object.entries(row.providers || {}).map(([label, tokens]) => ({ label, tokens: count(tokens) })),
        context: sessionLive.sessionContextWindow(row),
        promptCache: sessionLive.sessionPromptCacheForRow(row, now),
        tokensPerSecond: duration > 0 && timedOutput !== null ? timedOutput / duration * 1000 : null,
      };
    }
    return null;
  }
  function sessionStatus(session, options = {}) {
    if (session.groupRows?.length) {
      const statuses = session.groupRows.map(row => sessionStatus(row, options));
      const reading = statuses.find(status => status.state === 'running')
        || statuses.find(status => status.state === 'waiting')
        || statuses.find(status => status.state !== 'archived') || statuses[0];
      const deadlines = statuses.map(status => status.nextChangeAt).filter(at => at > (options.now ?? Date.now()));
      return { ...reading, nextChangeAt: deadlines.length ? Math.min(...deadlines) : 0 };
    }
    const now = Number(options.now ?? Date.now());
    const unknown = (label, detail) => ({ state: 'unknown', label, detail, source: 'unknown', observedAt: '', nextChangeAt: 0 });
    if (sessionLive.isArchivedSession(session)) {
      return { state: 'archived', label: '已归档', detail: '会话来源已归档或删除', source: 'archive', observedAt: '', nextChangeAt: 0 };
    }
    if (options.foreground === false) return unknown('已暂停', '应用在后台，状态刷新已暂停');
    if (!options.connected) return unknown('状态未知', '未连接到 Hub，无法确认当前状态');
    const fetchedAt = numeric(options.fetchedAt);
    if (!fetchedAt || fetchedAt > now || now - fetchedAt >= REMOTE_STATUS_MAX_AGE_MS) {
      return unknown('状态已过期', '已超过 30 秒未成功读取 Hub');
    }
    const liveExpiry = sessionLive.liveActivityExpiryAt(session, now);
    const last = Date.parse(session.lastUsedAt || '');
    // The aggregate may take live evidence from a different device than its
    // accounting timestamp. Check the owners of the evidence actually shown.
    const owners = (options.stats?.devices || []).filter((device) => {
      if (options.deviceId && device.deviceId !== options.deviceId) return false;
      if (expired(device, options.period, now)) return false;
      const row = device.periods?.[options.period]?.sessions?.[session.key];
      if (!row || sessionLive.isArchivedSession(row)) return false;
      return liveExpiry
        ? row.liveActivity?.state === session.liveActivity.state
          && Date.parse(row.liveActivity?.observedAt || '') === Date.parse(session.liveActivity.observedAt)
        : Date.parse(row.lastUsedAt || '') === last;
    });
    if (!owners.some((device) => device.stale !== true)) {
      return unknown('状态未知', owners.length ? '状态来源设备的上报已过期' : '无法确认此状态的来源设备');
    }
    // The shared desktop rule tolerates future local transcript clocks. A
    // remote viewer cannot verify that clock, so do not infer activity from it.
    if (!liveExpiry && (!Number.isFinite(last) || last > now)) {
      return unknown('状态未知', last > now ? '来源设备时间超前，无法推断当前状态' : '采集端未提供会话活动时间');
    }
    const state = sessionLive.sessionActivityState(session, now);
    const inferred = state === 'running' && !liveExpiry && session.turnEnded !== false;
    const label = ({ running: '运行中', waiting: '等待中', ended: '本轮已结束', idle: '空闲' })[state];
    const source = liveExpiry ? 'native' : inferred ? 'inferred' : 'transcript';
    const next = sessionLive.nextSessionStatusChangeAt([session], now);
    return {
      state, label, source,
      detail: liveExpiry ? '采集端原生状态' : inferred ? '按最近会话活动推断，未确认当前正在运行' : '按会话记录与本轮结束标记判断',
      observedAt: liveExpiry ? session.liveActivity.observedAt : session.lastUsedAt,
      nextChangeAt: Math.min(fetchedAt + REMOTE_STATUS_MAX_AGE_MS, next > now ? next : Infinity),
    };
  }
  function limitAccount(provider, stats, deviceId = '') {
    const museSource = provider.provider === 'muse' ? provider.source === 'web' ? 'web' : 'cli' : '';
    const minimaxSource = provider.provider === 'minimax' ? provider.source || '' : '';
    const sourceId = deviceId || provider.sourceDeviceId || '';
    const device = (stats?.devices || []).find((row) => row.deviceId === sourceId);
    const sourceLabel = sourceId
      ? device?.hostname && device.hostname !== sourceId ? `${device.hostname} · ${sourceId}` : sourceId
      : provider.provider === 'muse' ? '来源设备未知' : '';
    // Claude organizations can share an email. Muse CLI is device-scoped;
    // its independent web reading keeps one identity across winning devices.
    const key = JSON.stringify([
      provider.provider, provider.accountKey || provider.accountEmail || provider.accountName || '',
      provider.profileName || '', provider.workspaceKind || '',
      museSource === 'cli' || (!provider.accountKey && museSource !== 'web') ? sourceId : '',
      museSource,
      provider.adapterId || '', provider.region || '',
      minimaxSource,
    ]);
    const mimoProduct = provider.provider === 'mimo' ? windowLabels?.mimoProductLabel(provider) : '';
    const productLabel = museSource ? museSource === 'web' ? 'Muse (Meta)' : 'Muse Code'
      : mimoProduct ? mimoProduct === 'Console' ? 'MiMo Console' : 'MiMo Desktop'
      : provider.provider === 'minimax' ? minimaxSource === 'oauth' ? 'MiniMax Code'
        : provider.accountLabel === 'Pay-as-you-go' ? 'MiniMax API' : provider.accountLabel === 'Token Plan' ? 'MiniMax Token Plan' : 'MiniMax' : '';
    const regionLabel = provider.provider === 'minimax' ? ({ cn: '中国', en: '国际' })[provider.region] || '' : '';
    return { key, sourceLabel, ...(productLabel ? { productLabel } : {}), ...(regionLabel ? { regionLabel } : {}) };
  }
  function limitGroups(providers, stats, deviceId = '') {
    const groups = new Map();
    const individuals = new Map();
    for (const provider of providers) {
      // A verified API -> Code link groups headings only. Each original row,
      // quota, status, currency and history identity remains independent.
      const code = provider.provider === 'minimax' && provider.source === 'api'
        && provider.accountKey && provider.accountKey !== provider.relatedAccountKey
        && /^sha256:[a-f0-9]{64}$/.test(provider.relatedAccountKey || '')
        && providers.find(row => row.provider === 'minimax' && row.source === 'oauth'
          && row.accountKey === provider.relatedAccountKey && row.region && row.region === provider.region);
      const owner = code || provider;
      let key;
      if (owner.provider === 'minimax' && owner.source === 'oauth' && owner.accountKey) {
        key = JSON.stringify(['minimax-group', owner.region || '', owner.accountKey]);
      } else {
        const identity = limitAccount(provider, stats, deviceId).key;
        const duplicate = individuals.get(identity) || 0;
        individuals.set(identity, duplicate + 1);
        key = JSON.stringify(['card', identity, duplicate]);
      }
      if (!groups.has(key)) groups.set(key, { key, label: owner.accountName || owner.accountEmail || 'MiniMax 账户', providers: [] });
      groups.get(key).providers.push(provider);
    }
    return [...groups.values()].map(group => ({ ...group,
      linked: group.providers.some(row => row.source === 'oauth') && group.providers.some(row => row.source === 'api'),
      providers: group.providers.slice().sort((a, b) => Number(b.source === 'oauth') - Number(a.source === 'oauth')),
    }));
  }
  function limitSpend(provider) {
    if (provider.provider !== 'minimax' || provider.source !== 'api' || provider.accountLabel !== 'Pay-as-you-go') return [];
    const currency = provider.balance?.currency;
    if (!['CNY', 'USD'].includes(currency)) return [];
    const fields = [['todaySpend', '今日'], ['weekSpend', '近7天'], ['monthSpend', '本月'], ['allTimeSpend', '累计']];
    if (!fields.some(([key]) => Object.prototype.hasOwnProperty.call(provider.balance, key))) return [];
    return fields.map(([key, label]) => ({ key, label, value: money(numeric(provider.balance[key]), currency) }));
  }
  function limitBalanceDetails(provider) {
    if (provider.provider !== 'mimo') return [];
    const currency = provider.balance?.currency;
    if (!currency) return [];
    return [['giftBalance', '赠送余额'], ['cashBalance', '现金余额']]
      .filter(([key]) => numeric(provider.balance?.[key]) !== null)
      .map(([key, label]) => ({ key, label, value: money(provider.balance[key], currency) }));
  }
  function quotaTrendBounds(provider, window, now = Date.now()) {
    // Video is an interval count pool. Its wire kind does not prove a weekly
    // duration. Only an explicit duration can establish its cycle start.
    const video = provider.provider === 'minimax' && window.label === 'Video' && !(numeric(window.windowMinutes) > 0);
    return historyModel.trendBounds(video ? { ...window, kind: '' } : window, now, provider.provider);
  }
  function sessionReasoningEffort(row) {
    return sessionLive.isSessionReasoningEffortClient(row?.client) ? sessionLive.normalizeReasoningEffort(row.reasoningEffort) : null;
  }
  function quota(provider, window) {
    if (String(window.detail || '').trim().toLowerCase() === 'unlimited') {
      return { label: window.label || '额度', value: '无限额', percent: null, remaining: false };
    }
    if (balance.isCreditsWindow(window)) {
      if (provider.provider === 'muse' && provider.source === 'web' && window.resetDescription?.endsWith(' tokens left')) {
        return { label: '额外 Tokens', value: `${window.resetDescription.slice(0, -' tokens left'.length)} Tokens`,
          percent: null, remaining: true, description: '' };
      }
      const currency = balance.creditsCurrency(provider, window);
      const limit = numeric(window.limit);
      const used = numeric(window.used);
      const amount = balance.creditsAmount(provider, window);
      return {
        label: window.label || '账户余额',
        value: amount !== null && currency === 'CREDITS' ? `${money(amount, currency)} 积分` : money(amount, currency),
        percent: window.showMeter === false ? null : balance.creditsMeterPercent(provider, window),
        remaining: true,
        ...(limit > 0 ? { detail: `${used === null ? '' : `已用 ${money(used, currency)} / `}总额 ${money(limit, currency)}` } : {}),
      };
    }
    if (window.metric === 'spend' || (!window.metric && window.kind === 'billing' && window.label === 'Usage credits')) {
      return { label: window.label || '已用金额', value: money(window.used, window.currency || provider.balance?.currency), percent: null };
    }
    const used = numeric(window.usedPercent);
    const remaining = numeric(window.remainingPercent);
    const percent = used ?? (remaining === null ? null : 100 - remaining);
    const detail = ['minimax', 'mistral'].includes(provider.provider) ? windowText?.limitWindowText(provider, window, { showLimitUsed: true }).detail : '';
    return {
      label: window.label || ({ session: '当前会话', weekly: '每周额度', daily: '每日额度', monthly: '每月额度', billing: '账期额度' })[window.kind] || window.kind || '额度',
      value: percent === null ? '暂无读数' : `${Math.round(percent * 10) / 10}% 已用`,
      percent: percent === null || window.showMeter === false ? null : Math.max(0, Math.min(100, percent)),
      remaining: false,
      ...(detail ? { detail: provider.provider === 'minimax' ? `${detail} 次` : detail } : {}),
    };
  }
  function limitWindows(provider) {
    const windows = provider.windows || [];
    // Older Hub snapshots can carry a wallet solely on the account. Display
    // the actual amount without inventing a quota denominator or history.
    if (numeric(provider.balance?.amount) === null || windows.some(window => balance.isCreditsWindow(window))) return windows;
    return [...windows, { kind: 'credits', metric: 'credits', label: '账户余额', remaining: numeric(provider.balance.amount),
      currency: provider.balance.currency, showMeter: false }];
  }
  function daily(stats) {
    return (stats?.historyPreview?.daily || []).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
      .slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  }
  function widgetHistory(stats, fetchedAt) {
    const empty = { recentDays: 0, sevenDayDays: 0, sevenDayTokens: null, peakDayTokens: null };
    if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return empty;
    const date = new Date(fetchedAt);
    if (!Number.isFinite(date.getTime())) return empty;
    // Hub day keys are local calendar dates. Use the phone's snapshot date,
    // and UTC arithmetic only to subtract calendar days without DST drift.
    const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const end = Date.parse(`${today}T00:00:00Z`);
    const days = new Map();
    for (const row of stats?.historyPreview?.daily || []) {
      if (!row || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
      const at = Date.parse(`${row.date}T00:00:00Z`);
      if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== row.date
        || at < end - 13 * 86400000 || at > end
        || typeof row.tokens !== 'number' || !Number.isFinite(row.tokens) || row.tokens < 0) continue;
      days.set(row.date, Math.max(days.get(row.date) ?? 0, row.tokens));
    }
    const recent = [...days.entries()];
    const week = recent.filter(([key]) => Date.parse(`${key}T00:00:00Z`) >= end - 6 * 86400000);
    return { recentDays: recent.length, sevenDayDays: week.length,
      sevenDayTokens: week.length ? week.reduce((sum, [, tokens]) => sum + tokens, 0) : null,
      peakDayTokens: recent.length ? Math.max(...recent.map(([, tokens]) => tokens)) : null };
  }
  function components(period) {
    if (period?.capabilities?.tokenComponents !== true) return null;
    const total = count(period.totalTokens);
    const cached = count(period.cacheReadTokens);
    return { cached, output: count(period.outputTokens), cachePercent: total > 0 ? (cached / total * 100).toFixed(1) : '0.0' };
  }
  function subscriptionAmount(row) {
    return row.kind === 'topup'
      ? (row.topUps || []).reduce((sum, entry) => sum + count(entry.amountMinor), 0) / 100
      : numeric(row.amountMinor) === null ? null : row.amountMinor / 100;
  }
  return { numeric, count, clientLabel, compact, money, escape, expired, select, breakdown, sessions, filterSessionTools, filterSessionStatuses, deviceKind, sessionDevices, sessionDetail, sessionStatus, sessionReasoningEffort, limitAccount, limitGroups, limitSpend, limitBalanceDetails, limitWindows, quota, quotaTrendBounds, daily, widgetHistory, components, subscriptionAmount };
});
