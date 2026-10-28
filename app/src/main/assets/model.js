'use strict';

(function expose(root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(
    node ? require('../../../../src/shared/limits/balanceDisplay') : root.TokenMonitorLimitBalanceDisplay,
    node ? require('../../../../src/shared/sessionLive') : root.TokenMonitorSessionLive,
    node ? require('../../../../src/shared/sessionGroups') : root.TokenMonitorSessionGroups
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MonitorModel = api;
})(typeof window !== 'undefined' ? window : null, function createModel(balance, sessionLive, sessionGroups) {
  const REMOTE_STATUS_MAX_AGE_MS = 30_000;
  function numeric(value) {
    return value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
  }
  function count(value) { return Math.max(0, numeric(value) ?? 0); }
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
  function sessionDetail(stats, key, options = {}) {
    const device = options.deviceId ? (stats?.devices || []).find((row) => row.deviceId === options.deviceId) : null;
    if (options.deviceId && !device) return null;
    const periods = (device || stats)?.periods;
    const preferred = options.period === 'today' ? ['today', 'month'] : ['month', 'today'];
    for (const period of preferred) {
      const rows = periods?.[period]?.sessions;
      if (!rows || !Object.prototype.hasOwnProperty.call(rows, key)) continue;
      const row = { ...rows[key], key };
      const owners = (stats.devices || []).filter((source) => (!device || source.deviceId === device.deviceId)
        && Object.prototype.hasOwnProperty.call(source.periods?.[period]?.sessions || {}, key))
        .map((source) => ({ deviceId: source.deviceId, hostname: source.hostname || source.deviceId,
          stale: source.stale === true, platform: source.osName || source.platform || '',
          updatedAt: source.updatedAt, receivedAt: source.receivedAt, session: source.periods[period].sessions[key] }));
      const parentKey = row.parentSessionId ? `${row.parentClient || row.client}:${row.parentSessionId}` : '';
      const children = Object.entries(rows).filter(([, child]) => child.parentSessionId === row.sessionId
        && (child.parentClient || child.client) === row.client)
        .map(([childKey, child]) => ({ key: childKey, label: child.title || child.projectLabel || child.sessionId || childKey }));
      const duration = numeric(row.timedDurationMs);
      const timedOutput = numeric(row.timedOutputTokens);
      return {
        row, period, owners, children, parentKey,
        models: breakdown({ models: row.models, modelCosts: row.modelCosts }, 'models'),
        providers: Object.entries(row.providers || {}).map(([label, tokens]) => ({ label, tokens: count(tokens) })),
        context: sessionLive.sessionContextWindow(row),
        promptCache: sessionLive.sessionPromptCacheForRow(row, options.now ?? Date.now()),
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
    const sourceId = deviceId || provider.sourceDeviceId || '';
    const device = (stats?.devices || []).find((row) => row.deviceId === sourceId);
    const sourceLabel = sourceId
      ? device?.hostname && device.hostname !== sourceId ? `${device.hostname} · ${sourceId}` : sourceId
      : provider.provider === 'muse' ? '来源设备未知' : '';
    // An organization can share an email with another Claude account. Muse
    // has no portable account identity and must retain its device scope.
    const key = JSON.stringify([
      provider.provider, provider.accountKey || provider.accountEmail || provider.accountName || '',
      provider.profileName || '', provider.workspaceKind || '',
      provider.provider === 'muse' || !provider.accountKey ? sourceId : '',
    ]);
    return { key, sourceLabel };
  }
  function quota(provider, window) {
    if (balance.isCreditsWindow(window)) {
      const currency = balance.creditsCurrency(provider, window);
      const limit = numeric(window.limit);
      const used = numeric(window.used);
      return {
        label: window.label || '账户余额',
        value: money(balance.creditsAmount(provider, window), currency),
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
    return {
      label: window.label || ({ session: '当前会话', weekly: '每周额度', daily: '每日额度', monthly: '每月额度', billing: '账期额度' })[window.kind] || window.kind || '额度',
      value: percent === null ? '暂无读数' : `${Math.round(percent * 10) / 10}% 已用`,
      percent: percent === null || window.showMeter === false ? null : Math.max(0, Math.min(100, percent)),
      remaining: false,
    };
  }
  function daily(stats) {
    return (stats?.historyPreview?.daily || []).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
      .slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
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
  return { numeric, count, compact, money, escape, expired, select, breakdown, sessions, sessionDetail, sessionStatus, limitAccount, quota, daily, components, subscriptionAmount };
});
