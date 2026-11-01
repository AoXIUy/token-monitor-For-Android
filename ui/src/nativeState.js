// @ts-check

/** @param {unknown} value @returns {value is import('./types/monitor').ConnectionStatus} */
function isConnectionStatus(value) {
  return typeof value === 'string' && ['online', 'offline', 'loading', 'disconnected'].includes(value);
}

/** @returns {import('./types/monitor').MonitorState} */
export function createInitialState() {
  return {
    appUpdate: { currentVersion: '', latestVersion: '', automatic: true, checking: false, available: false,
      checkedAt: 0, name: '', notes: '', publishedAt: '', size: 0, error: '' },
    dismissedUpdateVersion: '',
    page: 'overview', period: 'today', device: '', stats: null, subscriptions: null,
    subscriptionError: '', connection: '', allowHttp: false, status: 'disconnected',
    message: '', fetchedAt: 0, foreground: true, statusHealthy: false, detailKey: '',
    notifications: { enabled: false, permission: false, message: '完成提醒未开启' },
    monitorPending: false, connectPending: false, formError: '', connectionEpoch: 0,
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
      } };
    }
    case 'connection': {
      const connection = String(message.url || '');
      return {
        ...createInitialState(), connection, allowHttp: Boolean(message.allowHttp),
        appUpdate: state.appUpdate, dismissedUpdateVersion: state.dismissedUpdateVersion,
        foreground: state.foreground, message: String(message.error || ''),
        page: connection ? 'overview' : 'settings', connectionEpoch: state.connectionEpoch + 1,
      };
    }
    case 'stats':
      return {
        ...state, stats: /** @type {import('./types/monitor').MonitorStats | null} */ (message.data || null),
        fetchedAt: typeof message.fetchedAt === 'number' && Number.isFinite(message.fetchedAt) ? message.fetchedAt : 0,
        statusHealthy: true,
      };
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
    case 'lifecycle': return { ...state, foreground: Boolean(message.foreground) };
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
    case 'formError': return { ...state, formError: String(message.message || '连接参数无效'), connectPending: false };
    default: return state;
  }
}
