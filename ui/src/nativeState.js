// @ts-check
import { receiveConversation } from './conversationState.js';

/** @param {unknown} value @returns {value is import('./types/monitor').ConnectionStatus} */
function isConnectionStatus(value) {
  return typeof value === 'string' && ['online', 'offline', 'loading', 'disconnected'].includes(value);
}

/** @returns {import('./types/monitor').MonitorState} */
export function createInitialState() {
  return {
    conversation: null,
    quotaHistory: null, historyError: '',
    appUpdate: { currentVersion: '', latestVersion: '', automatic: true, checking: false, available: false,
      checkedAt: 0, name: '', notes: '', publishedAt: '', size: 0, error: '', promptToken: '',
      download: { phase: 'idle', version: '', downloaded: 0, total: 0, message: '', error: '' } },
    dismissedUpdateVersion: '', dismissedUpdatePrompt: '',
    page: 'overview', period: 'today', device: '', stats: null, subscriptions: null,
    subscriptionError: '', connection: '', allowHttp: false, status: 'disconnected',
    message: '', fetchedAt: 0, foreground: true, statusHealthy: false, detailKey: '',
    notifications: { enabled: false, permission: false, message: '完成提醒未开启' },
    monitorPending: false,
    approvals: {
      enabled: false, permission: false, status: 'off', message: '审批提醒未开启',
      items: [],
    },
    approvalsPending: false,
    connectPending: false, formError: '', connectionEpoch: 0,
    limitsPrefs: { hideUncollected: true, showRemaining: false, hiddenAccountHashes: [] },
  };
}

/**
 * Native messages carry display data only. Credentials never enter this state.
 * @param {import('./types/monitor').MonitorState} state
 * @param {Record<string, unknown>} message
 * @returns {import('./types/monitor').MonitorState}
 */
export function receiveNativeMessage(state, message) {
  switch (message.type) {
    case 'conversation':
      if (state.page !== 'sessionDetail' || state.detailKey !== message.key) return state;
      return { ...state, conversation: receiveConversation(state.conversation, message) };
    case 'appUpdate': {
      /** @param {string} key @param {number} limit */
      const text = (key, limit) => typeof message[key] === 'string' ? String(message[key]).slice(0, limit) : '';
      const latestVersion = text('latestVersion', 64);
      return { ...state, appUpdate: {
        currentVersion: text('currentVersion', 64) || state.appUpdate.currentVersion,
        latestVersion, automatic: typeof message.automatic === 'boolean' ? message.automatic : state.appUpdate.automatic,
        checking: message.checking === true, available: message.available === true && Boolean(latestVersion),
        checkedAt: typeof message.checkedAt === 'number' && Number.isFinite(message.checkedAt) && message.checkedAt > 0 ? message.checkedAt : 0,
        size: typeof message.size === 'number' && Number.isFinite(message.size) && message.size > 0 ? message.size : 0,
        name: text('name', 160), notes: text('notes', 12000), publishedAt: text('publishedAt', 40), error: text('error', 300),
        promptToken: text('promptToken', 80), download: state.appUpdate.download,
      } };
    }
    case 'appUpdateDownload': {
      const phases = ['idle', 'downloading', 'verifying', 'ready', 'permission', 'installing', 'error', 'cancelled'];
      if (typeof message.phase !== 'string' || !phases.includes(message.phase)) return state;
      /** @param {string} key @param {number} limit */
      const text = (key, limit) => typeof message[key] === 'string' ? String(message[key]).slice(0, limit) : '';
      /** @param {unknown} value */
      const bytes = value => typeof value === 'number' && Number.isFinite(value) ? Math.floor(Math.max(0, Math.min(128 * 1024 * 1024, value))) : 0;
      const total = bytes(message.total);
      return { ...state,
        dismissedUpdatePrompt: message.phase === 'installing' ? state.appUpdate.promptToken : state.dismissedUpdatePrompt,
        appUpdate: { ...state.appUpdate, download: {
          phase: /** @type {import('./types/monitor').UpdateDownloadState['phase']} */ (message.phase),
          version: text('version', 64), total, downloaded: Math.min(total, bytes(message.downloaded)),
          message: text('message', 300), error: text('error', 300),
        } },
      };
    }
    case 'connection': {
      const connection = String(message.url || '');
      return {
        ...createInitialState(), connection, allowHttp: Boolean(message.allowHttp),
        appUpdate: state.appUpdate, dismissedUpdateVersion: state.dismissedUpdateVersion, dismissedUpdatePrompt: state.dismissedUpdatePrompt,
        limitsPrefs: state.limitsPrefs,
        foreground: state.foreground, message: String(message.error || ''),
        page: connection ? 'overview' : 'settings', connectionEpoch: state.connectionEpoch + 1,
      };
    }
    case 'limitsPrefs': {
      const hashes = Array.isArray(message.hiddenAccountHashes)
        ? Array.from(new Set(message.hiddenAccountHashes.filter(item => typeof item === 'string' && /^[a-f0-9]{64}$/.test(item)))).slice(0, 256)
        : state.limitsPrefs.hiddenAccountHashes;
      return {
        ...state,
        limitsPrefs: {
          hideUncollected: typeof message.hideUncollected === 'boolean' ? message.hideUncollected : state.limitsPrefs.hideUncollected,
          showRemaining: typeof message.showRemaining === 'boolean' ? message.showRemaining : state.limitsPrefs.showRemaining,
          hiddenAccountHashes: hashes,
        },
      };
    }
    case 'stats':
      return {
        ...state, stats: /** @type {import('./types/monitor').MonitorStats | null} */ (message.data || null),
        fetchedAt: typeof message.fetchedAt === 'number' && Number.isFinite(message.fetchedAt) ? message.fetchedAt : 0,
        statusHealthy: true,
        historyError: typeof message.historyError === 'string' ? message.historyError.slice(0, 300) : '',
      };
    case 'quotaHistory': {
      if (typeof message.key !== 'string' || !/^[a-f0-9]{64}$/.test(message.key)) return state;
      const providers = [state.stats?.limits?.providers || [], ...(state.stats?.devices || []).map(device => device.limits?.providers || [])].flat();
      if (!providers.some(provider => provider.androidHistoryKey === message.key)) return state;
      return { ...state, quotaHistory: /** @type {import('./types/monitor').QuotaHistoryPayload} */ ({
        key: message.key, now: typeof message.now === 'number' ? message.now : 0,
        windows: Array.isArray(message.windows) ? message.windows : [], persistent: message.persistent === true,
        error: typeof message.error === 'string' ? message.error.slice(0, 300) : '',
      }) };
    }
    case 'subscriptions': return {
      ...state, subscriptions: /** @type {import('./types/monitor').SubscriptionsPayload | null} */ (message.data || null), subscriptionError: '',
    };
    case 'subscriptionError': return { ...state, subscriptionError: String(message.message || '读取订阅失败') };
    case 'status': {
      if (!isConnectionStatus(message.state)) return state;
      return {
        ...state, status: message.state,
        statusHealthy: ['offline', 'disconnected'].includes(message.state) ? false : state.statusHealthy,
        message: message.state === 'offline' ? String(message.message || '无法连接 Hub') : '',
      };
    }
    case 'lifecycle': return { ...state, foreground: Boolean(message.foreground), conversation: message.foreground ? state.conversation : null };
    case 'notifications':
      return {
        ...state, monitorPending: false,
        notifications: {
          enabled: Boolean(message.enabled), permission: Boolean(message.permission),
          message: String(message.message || '完成提醒未开启'),
          lastReadAt: typeof message.lastReadAt === 'string' || typeof message.lastReadAt === 'number' ? message.lastReadAt : undefined,
        },
      };
    case 'openSession':
      return { ...state, page: 'sessionDetail', device: '', period: 'month', detailKey: String(message.key || ''), statusHealthy: false };
    case 'openApprovalAlerts':
      return { ...state, page: 'overview' };
    case 'approvalAlerts': {
      const enabled = Boolean(message.enabled);
      const rawItems = enabled && Array.isArray(message.items) ? message.items : [];
      /** @type {import('./types/monitor').ApprovalItem[]} */
      const items = [];
      /** @type {Set<string>} */
      const seenIds = new Set();
      for (const raw of rawItems) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const entry = /** @type {Record<string, unknown>} */ (raw);
        const id = typeof entry.id === 'string' ? entry.id.trim().toLowerCase().slice(0, 100) : '';
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        items.push({
          id,
          deviceId: typeof entry.deviceId === 'string' ? entry.deviceId.slice(0, 128) : '',
          deviceName: typeof entry.deviceName === 'string' ? entry.deviceName.slice(0, 128) : '',
          client: typeof entry.client === 'string' ? entry.client.slice(0, 40) : '',
          sessionId: typeof entry.sessionId === 'string' ? entry.sessionId.slice(0, 128) : '',
          tool: typeof entry.tool === 'string' ? entry.tool.slice(0, 80) : '',
          command: typeof entry.command === 'string' ? entry.command.slice(0, 2000) : '',
          description: typeof entry.description === 'string' ? entry.description.slice(0, 500) : '',
          projectLabel: typeof entry.projectLabel === 'string' ? entry.projectLabel.slice(0, 200) : '',
          createdAt: typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt) ? entry.createdAt : 0,
          expiresAt: typeof entry.expiresAt === 'number' && Number.isFinite(entry.expiresAt) ? entry.expiresAt : 0,
        });
      }
      return {
        ...state,
        approvalsPending: false,
        approvals: {
          enabled,
          permission: Boolean(message.permission),
          status: typeof message.status === 'string' ? message.status : (enabled ? 'ok' : 'off'),
          message: typeof message.message === 'string' ? message.message.slice(0, 300) : (enabled ? '审批提醒在线' : '审批提醒未开启'),
          items,
        },
      };
    }
    case 'formError': return { ...state, formError: String(message.message || '连接参数无效'), connectPending: false };
    default: return state;
  }
}
