import type {
  AppUpdateState,
  ApprovalsState,
  HubReportConfig,
  LimitAccountPresentationMap,
  MonitorStats,
  NotificationState,
  QuotaHistoryPayload,
  ReportAiAnalysis,
  ReportGranularity,
  ReportIntegrationsStatus,
  ReportListItem,
  SubscriptionsPayload,
  UsageReportData,
} from '../types/monitor';

export function createDemoPayload(nowMs: number = Date.now()): {
  connectionUrl: string;
  stats: MonitorStats;
  limitAccountPresentation: LimitAccountPresentationMap;
  subscriptions: SubscriptionsPayload;
  notifications: NotificationState;
  approvals: Pick<ApprovalsState, 'enabled' | 'permission' | 'status' | 'message' | 'items'>;
  appUpdate: AppUpdateState;
  quotaHistory: QuotaHistoryPayload;
} {
  const nowIso = new Date(nowMs).toISOString();
  const fiveMinsAgo = new Date(nowMs - 5 * 60 * 1000).toISOString();
  const twelveMinsAgo = new Date(nowMs - 12 * 60 * 1000).toISOString();
  const fortyMinsAgo = new Date(nowMs - 40 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(nowMs - 2 * 3600 * 1000).toISOString();
  const inThreeHours = new Date(nowMs + 3 * 3600 * 1000).toISOString();
  const inFourDays = new Date(nowMs + 4 * 24 * 3600 * 1000).toISOString();
  const inTwelveMins = new Date(nowMs + 12 * 60 * 1000).toISOString();
  const tomorrowStart = new Date(nowMs + 14 * 3600 * 1000).toISOString();
  const nextMonthStart = new Date(nowMs + 18 * 24 * 3600 * 1000).toISOString();

  const dailyHistory = Array.from({ length: 14 }, (_, idx) => {
    const dayMs = nowMs - (13 - idx) * 24 * 3600 * 1000;
    const dateStr = new Date(dayMs).toISOString().slice(0, 10);
    const wave = [1420000, 1890000, 1650000, 2340000, 2780000, 1950000, 1120000, 2560000, 3120000, 2890000, 3450000, 2980000, 3760000, 4285600];
    const tokens = wave[idx] || 2000000;
    const cost = Number((tokens * 0.0000038).toFixed(2));
    return { date: dateStr, tokens, cost };
  });

  const todaySessions: NonNullable<MonitorStats['periods']>['today'] = {
    totalTokens: 4285600,
    inputTokens: 925600,
    outputTokens: 318400,
    cacheReadTokens: 2841600,
    cacheWriteTokens: 200000,
    unpricedTokens: 42000,
    costUsd: 16.42,
    capabilities: { tokenComponents: true },
    clients: {
      claude: 1940000,
      antigravity: 1265600,
      codex: 680000,
      cursor: 400000,
    },
    clientCosts: {
      claude: 7.85,
      antigravity: 4.92,
      codex: 2.45,
      cursor: 1.20,
    },
    models: {
      'claude-sonnet-4-20250514': 1860000,
      'claude-opus-4-1-20250805': 80000,
      'gemini-2.5-pro': 1265600,
      'gpt-5': 680000,
      'deepseek-r1': 400000,
    },
    modelCosts: {
      'claude-sonnet-4-20250514': 7.53,
      'claude-opus-4-1-20250805': 0.32,
      'gemini-2.5-pro': 4.92,
      'gpt-5': 2.45,
      'deepseek-r1': 1.20,
    },
    projects: {
      'token-monitor-android': { label: 'token-monitor-android', tokens: 1850000, costUsd: 7.12 },
      'hub-telemetry-collector': { label: 'hub-telemetry-collector', tokens: 1425600, costUsd: 5.48 },
      'distributed-inference-gateway': { label: 'distributed-inference-gateway', tokens: 1010000, costUsd: 3.82 },
    },
    sessions: {
      'claude:sess-android-ui-audit': {
        client: 'claude',
        sessionId: 'sess-android-ui-audit',
        nativeSessionId: 'claude-code-88f2a9c1',
        sessionKind: 'interactive',
        title: '审计前端架构，修复并升级优化 UI/UX 与遥测视图',
        projectLabel: 'token-monitor-android',
        startedAt: fortyMinsAgo,
        lastUsedAt: nowIso,
        turnEnded: false,
        totalTokens: 1485200,
        inputTokens: 285200,
        outputTokens: 94000,
        cacheReadTokens: 1026000,
        cacheWriteTokens: 80000,
        reasoningTokens: 24500,
        timedOutputTokens: 91200,
        timedDurationMs: 1185000,
        costUsd: 5.94,
        messageCount: 38,
        latestModel: 'claude-opus-4-1-20250805',
        contextTokens: 148000,
        contextWindow: 200000,
        promptCacheExpiresAt: inTwelveMins,
        models: { 'claude-sonnet-4-20250514': 1405200, 'claude-opus-4-1-20250805': 80000 },
        modelCosts: { 'claude-sonnet-4-20250514': 5.62, 'claude-opus-4-1-20250805': 0.32 },
        providers: { anthropic: 1485200 },
        liveActivity: {
          state: 'running',
          observedAt: nowIso,
        },
      },
      'antigravity:sess-multi-agent-main': {
        client: 'antigravity',
        sessionId: 'sess-multi-agent-main',
        title: '多设备同步协议与子代理并行回归验证',
        projectLabel: 'hub-telemetry-collector',
        startedAt: twoHoursAgo,
        lastUsedAt: fiveMinsAgo,
        turnEnded: false,
        totalTokens: 965600,
        inputTokens: 215600,
        outputTokens: 82000,
        cacheReadTokens: 618000,
        cacheWriteTokens: 50000,
        reasoningTokens: 32000,
        timedOutputTokens: 80000,
        timedDurationMs: 920000,
        costUsd: 3.78,
        messageCount: 29,
        contextTokens: 310000,
        contextWindow: 1000000,
        models: { 'gemini-2.5-pro': 965600 },
        modelCosts: { 'gemini-2.5-pro': 3.78 },
        providers: { google: 965600 },
        liveActivity: {
          state: 'waiting',
          observedAt: fiveMinsAgo,
        },
      },
      'antigravity:sess-subagent-schema': {
        client: 'antigravity',
        sessionId: 'sess-subagent-schema',
        parentClient: 'antigravity',
        parentSessionId: 'sess-multi-agent-main',
        title: '子代理 1 · 校验 QuotaWindow 账单与百分比边界',
        projectLabel: 'hub-telemetry-collector',
        startedAt: fortyMinsAgo,
        lastUsedAt: twelveMinsAgo,
        turnEnded: true,
        totalTokens: 180000,
        inputTokens: 48000,
        outputTokens: 22000,
        cacheReadTokens: 110000,
        costUsd: 0.68,
        messageCount: 11,
        models: { 'gemini-2.5-pro': 180000 },
        modelCosts: { 'gemini-2.5-pro': 0.68 },
        liveActivity: {
          state: 'idle',
          observedAt: twelveMinsAgo,
        },
      },
      'antigravity:sess-subagent-webview': {
        client: 'antigravity',
        sessionId: 'sess-subagent-webview',
        parentClient: 'antigravity',
        parentSessionId: 'sess-multi-agent-main',
        title: '子代理 2 · 验证 LocalContentClient 离线白名单策略',
        projectLabel: 'hub-telemetry-collector',
        startedAt: fortyMinsAgo,
        lastUsedAt: fiveMinsAgo,
        turnEnded: true,
        totalTokens: 120000,
        inputTokens: 32000,
        outputTokens: 18000,
        cacheReadTokens: 70000,
        costUsd: 0.46,
        messageCount: 8,
        models: { 'gemini-2.5-pro': 120000 },
        modelCosts: { 'gemini-2.5-pro': 0.46 },
        liveActivity: {
          state: 'idle',
          observedAt: fiveMinsAgo,
        },
      },
      'codex:sess-gateway-perf': {
        client: 'codex',
        sessionId: 'sess-gateway-perf',
        title: '优化流式 Token 速率采样与完成检测去重',
        projectLabel: 'distributed-inference-gateway',
        startedAt: twoHoursAgo,
        lastUsedAt: twelveMinsAgo,
        turnEnded: true,
        totalTokens: 680000,
        inputTokens: 160000,
        outputTokens: 68400,
        cacheReadTokens: 411600,
        cacheWriteTokens: 40000,
        reasoningTokens: 41000,
        unpricedTokens: 42000,
        timedOutputTokens: 68400,
        timedDurationMs: 810000,
        costUsd: 2.45,
        messageCount: 22,
        contextTokens: 86000,
        contextWindow: 128000,
        models: { 'gpt-5': 680000 },
        modelCosts: { 'gpt-5': 2.45 },
        providers: { openai: 680000 },
        liveActivity: {
          state: 'idle',
          observedAt: twelveMinsAgo,
        },
      },
      'cursor:sess-kotlin-widget': {
        client: 'cursor',
        sessionId: 'sess-kotlin-widget',
        title: '桌面微件 RemoteViews 跨日快照与刷新调度',
        projectLabel: 'token-monitor-android',
        startedAt: twoHoursAgo,
        lastUsedAt: fortyMinsAgo,
        turnEnded: true,
        totalTokens: 400000,
        inputTokens: 110000,
        outputTokens: 34000,
        cacheReadTokens: 256000,
        costUsd: 1.20,
        messageCount: 16,
        contextTokens: 54000,
        contextWindow: 128000,
        models: { 'deepseek-r1': 400000 },
        modelCosts: { 'deepseek-r1': 1.20 },
        liveActivity: {
          state: 'idle',
          observedAt: fortyMinsAgo,
        },
      },
    },
  };

  const monthPeriod: NonNullable<MonitorStats['periods']>['month'] = {
    totalTokens: 38420000,
    inputTokens: 8240000,
    outputTokens: 2980000,
    cacheReadTokens: 25400000,
    cacheWriteTokens: 1800000,
    unpricedTokens: 180000,
    costUsd: 142.80,
    capabilities: { tokenComponents: true },
    clients: {
      claude: 18200000,
      antigravity: 10420000,
      codex: 6100000,
      cursor: 3700000,
    },
    clientCosts: {
      claude: 72.40,
      antigravity: 39.10,
      codex: 21.50,
      cursor: 9.80,
    },
    models: {
      'claude-sonnet-4-20250514': 18200000,
      'gemini-2.5-pro': 10420000,
      'gpt-5': 6100000,
      'deepseek-r1': 3700000,
    },
    modelCosts: {
      'claude-sonnet-4-20250514': 72.40,
      'gemini-2.5-pro': 39.10,
      'gpt-5': 21.50,
      'deepseek-r1': 9.80,
    },
    projects: {
      'token-monitor-android': { label: 'token-monitor-android', tokens: 16400000, costUsd: 64.20 },
      'hub-telemetry-collector': { label: 'hub-telemetry-collector', tokens: 12820000, costUsd: 48.10 },
      'distributed-inference-gateway': { label: 'distributed-inference-gateway', tokens: 9200000, costUsd: 30.50 },
    },
    sessions: todaySessions.sessions,
  };

  const allTimePeriod: NonNullable<MonitorStats['periods']>['allTime'] = {
    totalTokens: 196840000,
    inputTokens: 41200000,
    outputTokens: 15840000,
    cacheReadTokens: 131400000,
    cacheWriteTokens: 8400000,
    costUsd: 718.50,
    capabilities: { tokenComponents: true },
    clients: {
      claude: 94200000,
      antigravity: 52640000,
      codex: 31500000,
      cursor: 18500000,
    },
    clientCosts: {
      claude: 368.20,
      antigravity: 194.80,
      codex: 108.40,
      cursor: 47.10,
    },
    models: {
      'claude-sonnet-4-20250514': 94200000,
      'gemini-2.5-pro': 52640000,
      'gpt-5': 31500000,
      'deepseek-r1': 18500000,
    },
    modelCosts: {
      'claude-sonnet-4-20250514': 368.20,
      'gemini-2.5-pro': 194.80,
      'gpt-5': 108.40,
      'deepseek-r1': 47.10,
    },
    projects: {
      'token-monitor-android': { label: 'token-monitor-android', tokens: 82400000, costUsd: 312.50 },
      'hub-telemetry-collector': { label: 'hub-telemetry-collector', tokens: 68440000, costUsd: 254.00 },
      'distributed-inference-gateway': { label: 'distributed-inference-gateway', tokens: 46000000, costUsd: 152.00 },
    },
  };

  const providers: NonNullable<MonitorStats['limits']>['providers'] = [
    {
      provider: 'hark', accountKey: 'sha256:demo-hark-session', source: 'web', sourceDeviceId: 'mbp-m4-max',
      planLabel: 'Hark Pro', status: 'ok', updatedAt: nowIso,
      windows: [
        { kind: 'daily', label: 'Daily', used: 1200, limit: 10000, remaining: 8800, usedPercent: 12, resetsAt: tomorrowStart },
        { kind: 'billing', label: 'Monthly', used: 20000, limit: 100000, remaining: 80000, usedPercent: 20, resetsAt: nextMonthStart },
        { kind: 'billing', label: 'Top-up', metric: 'spend', used: 1.25, currency: 'USD', showMeter: false },
      ],
    },
    {
      provider: 'qoder', accountKey: 'sha256:demo-qoder-account', source: 'web', sourceDeviceId: 'linux-ws-01',
      planLabel: 'Pro', status: 'ok', updatedAt: nowIso,
      windows: [
        { kind: 'billing', label: 'Credits', used: 20, limit: 100, remaining: 80, usedPercent: 20, resetsAt: inFourDays },
        { kind: 'billing', label: 'Team credits', used: 10, limit: 50, remaining: 40, usedPercent: 20, resetsAt: nextMonthStart },
      ],
    },
    {
      provider: 'mistral', source: 'web', sourceDeviceId: 'mbp-m4-max', planLabel: 'Pro', status: 'ok', updatedAt: nowIso,
      windows: [
        { kind: 'billing', label: 'Included API', used: 25, limit: 100, remaining: 75, usedPercent: 25, currency: 'USD', resetsAt: nextMonthStart },
        { kind: 'billing', label: 'Included Vibe Code', usedPercent: 68, resetsAt: nextMonthStart },
        { kind: 'billing', metric: 'credits', label: 'Balance', remaining: 12, currency: 'USD', showMeter: false },
      ],
    },
    {
      provider: 'mimo', accountKey: 'sha256:demo-mimo-console', accountLabel: 'Console', sourceDeviceId: 'linux-ws-01', status: 'ok', updatedAt: nowIso,
      balance: { amount: 30, currency: 'CNY', giftBalance: 0, cashBalance: 30 },
      windows: [],
    },
    {
      provider: 'minimax', accountKey: `sha256:${'a'.repeat(64)}`, source: 'oauth', region: 'cn',
      accountLabel: 'MiniMax Code', planLabel: 'Starter', sourceDeviceId: 'mbp-m4-max', status: 'ok', updatedAt: nowIso,
      windows: [
        { kind: 'billing', metric: 'credits', label: 'Credits', remaining: 4624, currency: 'CREDITS' },
        { kind: 'session', label: '5h', windowMinutes: 300, detail: 'unlimited', showMeter: false },
        { kind: 'weekly', label: 'Weekly', usedPercent: 15, windowMinutes: 10080, resetsAt: inFourDays },
        { kind: 'weekly', label: 'Video', used: 3, limit: 20, remaining: 17, usedPercent: 15, resetsAt: inThreeHours },
      ],
    },
    {
      provider: 'minimax', accountKey: `sha256:${'b'.repeat(64)}`, relatedAccountKey: `sha256:${'a'.repeat(64)}`,
      source: 'api', region: 'cn', accountLabel: 'Pay-as-you-go', sourceDeviceId: 'mbp-m4-max', status: 'ok', updatedAt: nowIso,
      balance: { amount: 14.97, currency: 'CNY', todaySpend: 0, weekSpend: null, monthSpend: 5.66, allTimeSpend: 89.2 },
      windows: [{ kind: 'billing', metric: 'credits', label: 'Balance', remaining: 14.97, currency: 'CNY' }],
    },
    {
      provider: 'minimax', accountKey: `sha256:${'c'.repeat(64)}`, source: 'api', region: 'en',
      accountLabel: 'Token Plan', sourceDeviceId: 'linux-ws-01', status: 'ok', updatedAt: nowIso,
      windows: [{ kind: 'session', label: '5h', usedPercent: 35, windowMinutes: 300, resetsAt: inThreeHours }],
    },
    {
      provider: 'opendesign', accountKey: 'sha256:demo-design-workspace', androidHistoryKey: 'd'.repeat(64),
      accountName: 'Design workspace', planLabel: 'Pro', source: 'web', sourceDeviceId: 'mbp-m4-max', status: 'ok', updatedAt: nowIso,
      windows: [
        { kind: 'session', label: '5 小时额度', windowMinutes: 300, usedPercent: 24, used: 24, limit: 100, resetsAt: inThreeHours },
        { kind: 'weekly', label: '每周额度', windowMinutes: 10080, usedPercent: 56, used: 56, limit: 100, resetsAt: inFourDays },
      ],
    },
    {
      provider: 'claude',
      accountKey: 'sha256:claude-max-team',
      accountName: 'Core Engineering',
      accountEmail: 'eng@tokenmonitor.dev',
      planLabel: 'Max 20x Plan',
      sourceDeviceId: 'mbp-m4-max',
      status: 'ok',
      stale: false,
      updatedAt: nowIso,
      windows: [
        {
          kind: 'session',
          label: '5小时会话窗口',
          usedPercent: 42,
          resetsAt: inThreeHours,
          boundaryKind: 'reset',
        },
        {
          kind: 'weekly',
          label: '7天滚动配额',
          usedPercent: 68,
          resetsAt: inFourDays,
          boundaryKind: 'reset',
        },
      ],
    },
    {
      provider: 'codex',
      accountKey: 'sha256:openai-pro',
      accountName: 'OpenAI Workspace',
      accountEmail: 'dev@tokenmonitor.dev',
      planLabel: 'ChatGPT Pro / Codex',
      sourceDeviceId: 'linux-ws-01',
      status: 'ok',
      stale: false,
      updatedAt: fiveMinsAgo,
      windows: [
        {
          kind: 'session',
          label: '实时并发配额',
          usedPercent: 28,
          resetsAt: inThreeHours,
          boundaryKind: 'reset',
        },
        {
          kind: 'monthly',
          label: '月度 API 预算',
          metric: 'spend',
          used: 84.5,
          limit: 120,
          usedPercent: 70.4,
          currency: 'USD',
          resetsAt: nextMonthStart,
          boundaryKind: 'reset',
        },
      ],
    },
    {
      provider: 'cursor',
      accountKey: 'sha256:cursor-business',
      accountName: 'Cursor Business',
      accountEmail: 'eng@tokenmonitor.dev',
      planLabel: 'Fast Requests (500/mo)',
      sourceDeviceId: 'mbp-m4-max',
      status: 'ok',
      stale: false,
      updatedAt: twelveMinsAgo,
      windows: [
        {
          kind: 'monthly',
          label: '快速请求配额 (Fast Requests)',
          used: 440,
          limit: 500,
          usedPercent: 88,
          resetsAt: nextMonthStart,
          boundaryKind: 'reset',
        },
      ],
    },
    {
      provider: 'ollama',
      accountKey: 'sha256:ollama-cloud',
      accountName: 'Cloud Inference Wallet',
      sourceDeviceId: 'linux-ws-01',
      status: 'ok',
      stale: false,
      updatedAt: fiveMinsAgo,
      windows: [
        {
          kind: 'billing',
          metric: 'credits',
          label: 'Included credits',
          remaining: 52.5,
          used: 7.5,
          limit: 60,
          usedPercent: 12.5,
          showMeter: true,
          currency: 'USD',
        },
        {
          kind: 'billing',
          metric: 'credits',
          label: 'Credit balance',
          remaining: 18.25,
          currency: 'USD',
          showMeter: false,
          resetDescription: 'Refills to $30 in 3 weeks.',
        },
      ],
    },
    {
      provider: 'alibaba',
      accountKey: 'sha256:demo-alibaba-personal',
      region: 'cn-personal',
      source: 'cli',
      sourceDeviceId: 'mbp-m4-max',
      status: 'ok',
      updatedAt: nowIso,
      windows: [
        { kind: 'session', label: '5 小时额度', windowMinutes: 300, usedPercent: 18, resetsAt: inThreeHours },
        { kind: 'weekly', label: '每周额度', windowMinutes: 10080, usedPercent: 32, resetsAt: inFourDays },
      ],
    },
    {
      provider: 'deepseek',
      accountKey: 'sha256:demo-deepseek-api',
      accountName: 'DeepSeek Platform',
      source: 'api',
      sourceDeviceId: 'mbp-m4-max',
      status: 'ok',
      updatedAt: nowIso,
      balance: {
        amount: 68.4,
        currency: 'CNY',
        monthSpend: 14.2,
        searchSpend: 1.25,
        fetchSpend: 0.45,
      },
      windows: [
        {
          kind: 'billing',
          metric: 'credits',
          label: '账户余额',
          remaining: 68.4,
          currency: 'CNY',
          showMeter: false,
        },
      ],
    },
    {
      provider: 'deepseek',
      accountKey: 'sha256:demo-deepseek-personal',
      source: 'api',
      sourceDeviceId: 'linux-ws-01',
      status: 'ok',
      updatedAt: fiveMinsAgo,
      balance: {
        amount: 24.5,
        currency: 'CNY',
        monthSpend: 5.1,
      },
      windows: [
        {
          kind: 'billing',
          metric: 'credits',
          label: '账户余额',
          remaining: 24.5,
          currency: 'CNY',
          showMeter: false,
        },
      ],
    },
    {
      provider: 'cline',
      accountKey: 'sha256:demo-cline-unconfigured',
      source: 'local',
      sourceDeviceId: 'thinkpad-x1',
      status: 'notConfigured',
      windows: [],
    },
    {
      provider: 'trae',
      accountKey: 'sha256:demo-trae-disabled',
      source: 'web',
      sourceDeviceId: 'linux-ws-01',
      status: 'disabled',
      windows: [],
    },
    {
      provider: 'thirdparty',
      adapterId: 'newapi-account',
      sourceDeviceId: 'mbp-m4-max',
      accountLabel: 'Team New API',
      planLabel: 'New API',
      source: 'api',
      status: 'ok',
      updatedAt: nowIso,
      balance: { amount: 42.5, currency: 'USD', todaySpend: 1.84, monthSpend: 18.4, allTimeSpend: 112.0 },
      windows: [
        { kind: 'billing', label: 'Balance', metric: 'credits', remaining: 42.5, currency: 'USD', usedPercent: 30.2, remainingPercent: 69.8 },
      ],
    },
  ];

  const stats: MonitorStats = {
    periods: {
      today: todaySessions,
      month: monthPeriod,
      allTime: allTimePeriod,
    },
    limits: {
      providers,
    },
    historyPreview: {
      daily: dailyHistory,
      summary: { activeDays: 126, activeDaysComplete: true },
    },
    devices: [
      {
        deviceId: 'mbp-m4-max',
        hostname: 'MacBook-Pro-M4',
        platform: 'darwin',
        deviceKind: 'laptop',
        osName: 'macOS Sequoia',
        osVersion: '15.4',
        agentVersion: '1.0.8',
        stale: false,
        updatedAt: nowIso,
        receivedAt: nowIso,
        periodWindows: {
          today: { endsAt: tomorrowStart },
          month: { endsAt: nextMonthStart },
        },
        periods: {
          today: {
            ...todaySessions,
            totalTokens: 2685600,
            inputTokens: 545600,
            outputTokens: 204000,
            cacheReadTokens: 1816000,
            cacheWriteTokens: 120000,
            costUsd: 10.62,
          },
          month: {
            ...monthPeriod,
            totalTokens: 24120000,
            costUsd: 92.40,
          },
          allTime: {
            ...allTimePeriod,
            totalTokens: 128400000,
            costUsd: 472.10,
          },
        },
        limits: {
          providers: providers.filter((p) => p.sourceDeviceId === 'mbp-m4-max'),
        },
      },
      {
        deviceId: 'linux-ws-01',
        hostname: 'Threadripper-Workstation',
        platform: 'linux',
        deviceKind: 'workstation',
        osName: 'Ubuntu Linux',
        osVersion: '24.04 LTS',
        agentVersion: '1.0.8',
        stale: false,
        updatedAt: fiveMinsAgo,
        receivedAt: fiveMinsAgo,
        periodWindows: {
          today: { endsAt: tomorrowStart },
          month: { endsAt: nextMonthStart },
        },
        periods: {
          today: {
            ...todaySessions,
            totalTokens: 1420000,
            inputTokens: 320000,
            outputTokens: 98400,
            cacheReadTokens: 921600,
            cacheWriteTokens: 80000,
            costUsd: 5.18,
          },
          month: {
            ...monthPeriod,
            totalTokens: 12100000,
            costUsd: 42.90,
          },
          allTime: {
            ...allTimePeriod,
            totalTokens: 56440000,
            costUsd: 204.40,
          },
        },
        limits: {
          providers: providers.filter((p) => p.sourceDeviceId === 'linux-ws-01'),
        },
      },
      {
        deviceId: 'thinkpad-x1',
        hostname: 'ThinkPad-X1-Carbon',
        platform: 'win32',
        deviceKind: 'laptop',
        osName: 'Windows 11 Pro',
        osVersion: '24H2',
        agentVersion: '1.0.7',
        stale: true,
        updatedAt: twoHoursAgo,
        receivedAt: twoHoursAgo,
        periodWindows: {
          today: { endsAt: tomorrowStart },
          month: { endsAt: nextMonthStart },
        },
        periods: {
          today: {
            totalTokens: 180000,
            inputTokens: 60000,
            outputTokens: 16000,
            cacheReadTokens: 104000,
            costUsd: 0.62,
            capabilities: { tokenComponents: true },
          },
          month: {
            totalTokens: 2200000,
            costUsd: 7.50,
            capabilities: { tokenComponents: true },
          },
          allTime: {
            totalTokens: 12000000,
            costUsd: 42.00,
            capabilities: { tokenComponents: true },
          },
        },
      },
    ],
  };

  const subscriptions: SubscriptionsPayload = {
    updatedAt: nowIso,
    subscriptions: [
      {
        id: 'sub-claude-max',
        provider: 'claude',
        planName: 'Claude Max 20x',
        kind: 'subscription',
        amountMinor: 20000,
        currency: 'USD',
        interval: 'month',
        intervalCount: 1,
        autoRenew: true,
        startDate: '2026-01-15',
        endDate: '2026-12-15',
        nextRenewalOverride: '2026-11-15',
        note: '主力研发与架构审计订阅 · 含 Claude Code 高频限额',
        binding: {
          accountEmail: 'eng@tokenmonitor.dev',
          profileName: 'Core Engineering',
        },
      },
      {
        id: 'sub-cursor-pro',
        provider: 'cursor',
        planName: 'Cursor Business Seat',
        kind: 'subscription',
        amountMinor: 4000,
        currency: 'USD',
        interval: 'month',
        intervalCount: 1,
        autoRenew: true,
        startDate: '2026-03-01',
        nextRenewalOverride: '2026-12-01',
        binding: {
          accountEmail: 'eng@tokenmonitor.dev',
        },
      },
      {
        id: 'topup-openrouter-wallet',
        provider: 'openrouter',
        planName: 'OpenRouter & DeepSeek API 预存池',
        kind: 'topup',
        amountMinor: 15000,
        currency: 'USD',
        startDate: '2026-06-10',
        note: '用于多模型对比测试与子代理并发调用',
        binding: {
          profileName: 'Gateway API Key',
        },
        topUps: [
          { date: '2026-10-18', amountMinor: 5000 },
          { date: '2026-08-24', amountMinor: 5000 },
          { date: '2026-06-10', amountMinor: 5000 },
        ],
      },
    ],
  };

  const quotaHistory: QuotaHistoryPayload = {
    key: 'd'.repeat(64), now: nowMs, persistent: true,
    windows: (providers.find(row => row.provider === 'opendesign')?.windows || []).map((window, index) => ({
      key: `demo-${window.kind}`, window, unit: 'pp', balance: false,
      points: [0, 1, 2, 3, 4].map(i => ({ at: nowMs - (4 - i) * 20 * 60000,
        value: (index ? 40 : 8) + i * 4, unit: 'pp', balance: false,
        reset: Date.parse(window.resetsAt || ''), basis: '100', interval: 300000 })),
      distribution: {
        buckets: Array.from({ length: 14 }, (_, i) => {
          const date = new Date(nowMs); date.setDate(date.getDate() - 13 + i);
          return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
            value: i < 2 || i === 6 ? null : (i * 3 + index * 7) % 18,
            observations: i < 2 || i === 6 ? 0 : 8, uncertain: i === 5 };
        }),
        unallocated: 0, resets: 0,
      },
    })),
  };
  const limitAccountPresentation: LimitAccountPresentationMap = {
    deepseek: {
      labels: {
        'sha256:demo-deepseek-api': '工作账号',
        'sha256:demo-deepseek-personal': '个人备用',
      },
      order: ['sha256:demo-deepseek-api', 'sha256:demo-deepseek-personal'],
    },
    alibaba: {
      labels: {
        'sha256:demo-alibaba-personal:cn-personal': '百炼主力',
      },
      order: ['sha256:demo-alibaba-personal:cn-personal'],
    },
  };
  return {
    quotaHistory,
    connectionUrl: 'https://hub.tokenmonitor.internal:8443',
    stats,
    limitAccountPresentation,
    subscriptions,
    notifications: {
      enabled: true,
      permission: true,
      message: '后台完成提醒运行中 · 实时监听 3 台设备',
      lastReadAt: nowMs,
    },
    approvals: {
      enabled: true,
      permission: true,
      status: 'ok',
      message: '待电脑端确认 1 条',
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          deviceId: 'mbp-m4-max',
          deviceName: 'MacBook Pro M4 Max',
          client: 'codex',
          sessionId: 'demo-codex-1',
          tool: 'Bash',
          command: 'git status && npm run verify',
          description: '运行本地检查以验证本次改动',
          projectLabel: 'token-monitor-android',
          createdAt: nowMs - 25_000,
          expiresAt: nowMs + 95_000,
        },
      ],
    },
    appUpdate: {
      currentVersion: '1.0.8',
      latestVersion: '1.0.8',
      automatic: true,
      checking: false,
      available: false,
      checkedAt: nowMs - 1800 * 1000,
      name: 'Token Monitor for Android v1.0.8',
      notes: '',
      publishedAt: nowIso,
      size: 0,
      error: '',
      promptToken: '',
      download: { phase: 'idle', version: '', downloaded: 0, total: 0, message: '', error: '' },
    },
  };
}

export function createDemoReports(nowMs: number = Date.now()): {
  config: HubReportConfig;
  integrations: ReportIntegrationsStatus;
  items: ReportListItem[];
  details: Record<string, { report: UsageReportData; markdown: string; aiAnalysis?: ReportAiAnalysis }>;
} {
  const now = new Date(nowMs);
  const nowIso = now.toISOString();
  const todayKey = nowIso.slice(0, 10);
  const monthKey = nowIso.slice(0, 7);
  const weekKey = '2026-W47';

  const makeDetail = (
    granularity: ReportGranularity,
    key: string,
    label: string,
    startDate: string,
    endDate: string,
    scale: number,
    activeDays: number,
  ): { report: UsageReportData; markdown: string; aiAnalysis: ReportAiAnalysis } => {
    const totalTokens = Math.round(4285600 * scale);
    const knownCostUsd = Number((16.42 * scale).toFixed(2));
    const inputTokens = Math.round(925600 * scale);
    const outputTokens = Math.round(318400 * scale);
    const cacheReadTokens = Math.round(2841600 * scale);
    const cacheWriteTokens = Math.round(200000 * scale);
    const proj1Tokens = Math.round(2150000 * scale);
    const proj2Tokens = Math.round(1320000 * scale);
    const proj3Tokens = Math.max(0, totalTokens - proj1Tokens - proj2Tokens);
    const report: UsageReportData = {
      schemaVersion: 1,
      schema: 'token-monitor-report/v1',
      reportId: `${granularity}:${key}`,
      granularity,
      period: {
        key,
        label,
        startDate,
        endDate,
        timeZone: 'Asia/Shanghai',
        isCurrent: true,
        generatedAt: nowIso,
      },
      hub: {
        runtime: 'node-hub',
        deviceCount: 3,
        activeDeviceCount: 2,
        staleDeviceCount: 1,
      },
      coverage: {
        tokenComponentsComplete: true,
        projectsComplete: true,
        projectAttributionSource: granularity === 'daily' ? 'live-period' : 'daily-snapshots',
        historyComplete: true,
      },
      summary: {
        totalTokens,
        knownCostUsd,
        unpricedTokens: Math.round(42000 * scale),
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        unclassifiedTokens: 0,
        cacheHitRatePct: 75.43,
        messageCount: Math.round(96 * scale),
        sessionCount: Math.round(14 * scale),
        projectCount: 3,
        activeDays,
        activeTimeMs: Math.round(9800000 * scale),
        peakDay: { date: todayKey, tokens: 4285600, costUsd: 16.42 },
        throughput: {
          timedTokens: Math.round(3900000 * scale),
          timedOutputTokens: Math.round(295000 * scale),
          timedDurationMs: Math.round(3850000 * scale),
          avgOutputTokensPerSec: 76.6,
        },
        comparison: {
          previousPeriodKey: granularity === 'daily' ? '昨日' : granularity === 'weekly' ? '上周' : '上月',
          previousTokens: Math.round(totalTokens * 0.84),
          previousCostUsd: Number((knownCostUsd * 0.85).toFixed(2)),
          tokenDelta: Math.round(totalTokens * 0.16),
          tokenDeltaPct: 19.05,
          costDelta: Number((knownCostUsd * 0.15).toFixed(2)),
          costDeltaPct: 17.65,
        },
      },
      projects: [
        {
          key: 'token-monitor-android',
          label: 'token-monitor-android',
          tokens: proj1Tokens,
          costUsd: Number((knownCostUsd * 0.5).toFixed(2)),
          unpricedTokens: 0,
          tokenSharePct: Number(((proj1Tokens / totalTokens) * 100).toFixed(2)),
          costSharePct: 50,
          sessionCount: Math.max(1, Math.round(6 * scale)),
          clients: [
            { client: 'claude', tokens: Math.round(proj1Tokens * 0.62), sharePct: 62 },
            { client: 'codex', tokens: Math.round(proj1Tokens * 0.38), sharePct: 38 },
          ],
          models: [
            { model: 'claude-sonnet-4-20250514', tokens: Math.round(proj1Tokens * 0.62), sharePct: 62 },
            { model: 'gpt-5', tokens: Math.round(proj1Tokens * 0.38), sharePct: 38 },
          ],
        },
        {
          key: 'hub-telemetry-collector',
          label: 'hub-telemetry-collector',
          tokens: proj2Tokens,
          costUsd: Number((knownCostUsd * 0.31).toFixed(2)),
          unpricedTokens: 0,
          tokenSharePct: Number(((proj2Tokens / totalTokens) * 100).toFixed(2)),
          costSharePct: 31,
          sessionCount: Math.max(1, Math.round(5 * scale)),
          clients: [{ client: 'antigravity', tokens: proj2Tokens, sharePct: 100 }],
          models: [{ model: 'gemini-2.5-pro', tokens: proj2Tokens, sharePct: 100 }],
        },
        {
          key: 'distributed-inference-gateway',
          label: 'distributed-inference-gateway',
          tokens: proj3Tokens,
          costUsd: Number((knownCostUsd * 0.19).toFixed(2)),
          unpricedTokens: Math.round(42000 * scale),
          tokenSharePct: Number(((proj3Tokens / totalTokens) * 100).toFixed(2)),
          costSharePct: 19,
          sessionCount: Math.max(1, Math.round(3 * scale)),
          clients: [{ client: 'cursor', tokens: proj3Tokens, sharePct: 100 }],
          models: [{ model: 'deepseek-r1', tokens: proj3Tokens, sharePct: 100 }],
        },
      ],
      clients: [
        {
          client: 'claude',
          tokens: Math.round(1940000 * scale),
          costUsd: Number((7.85 * scale).toFixed(2)),
          unpricedTokens: 0,
          tokenSharePct: 45.27,
          costSharePct: 47.81,
          cacheReadTokens: Math.round(1380000 * scale),
          cacheWriteTokens: Math.round(90000 * scale),
          outputTokens: Math.round(145000 * scale),
          inputTokens: Math.round(325000 * scale),
          unclassifiedTokens: 0,
          cacheHitRatePct: 80.94,
          messageCount: Math.round(42 * scale),
        },
        {
          client: 'antigravity',
          tokens: Math.round(1265600 * scale),
          costUsd: Number((4.92 * scale).toFixed(2)),
          unpricedTokens: 0,
          tokenSharePct: 29.53,
          costSharePct: 29.96,
          cacheReadTokens: Math.round(840000 * scale),
          cacheWriteTokens: Math.round(60000 * scale),
          outputTokens: Math.round(98000 * scale),
          inputTokens: Math.round(267600 * scale),
          unclassifiedTokens: 0,
          cacheHitRatePct: 75.84,
          messageCount: Math.round(28 * scale),
        },
        {
          client: 'codex',
          tokens: Math.round(680000 * scale),
          costUsd: Number((2.45 * scale).toFixed(2)),
          unpricedTokens: 0,
          tokenSharePct: 15.87,
          costSharePct: 14.92,
          cacheReadTokens: Math.round(441600 * scale),
          cacheWriteTokens: Math.round(35000 * scale),
          outputTokens: Math.round(48400 * scale),
          inputTokens: Math.round(155000 * scale),
          unclassifiedTokens: 0,
          cacheHitRatePct: 74.02,
          messageCount: Math.round(16 * scale),
        },
        {
          client: 'cursor',
          tokens: Math.round(400000 * scale),
          costUsd: Number((1.2 * scale).toFixed(2)),
          unpricedTokens: Math.round(42000 * scale),
          tokenSharePct: 9.33,
          costSharePct: 7.31,
          cacheReadTokens: Math.round(180000 * scale),
          cacheWriteTokens: Math.round(15000 * scale),
          outputTokens: Math.round(27000 * scale),
          inputTokens: Math.round(178000 * scale),
          unclassifiedTokens: 0,
          cacheHitRatePct: 50.28,
          messageCount: Math.round(10 * scale),
        },
      ],
      models: [
        {
          model: 'claude-sonnet-4-20250514',
          tokens: Math.round(1860000 * scale),
          costUsd: Number((7.53 * scale).toFixed(2)),
          unpricedTokens: 0,
          tokenSharePct: 43.4,
          costSharePct: 45.86,
          cacheReadTokens: Math.round(1340000 * scale),
          cacheWriteTokens: Math.round(85000 * scale),
          outputTokens: Math.round(138000 * scale),
          inputTokens: Math.round(297000 * scale),
          unclassifiedTokens: 0,
          cacheHitRatePct: 81.86,
          avgOutputTokensPerSec: 82.4,
        },
        {
          model: 'gemini-2.5-pro',
          tokens: Math.round(1265600 * scale),
          costUsd: Number((4.92 * scale).toFixed(2)),
          unpricedTokens: 0,
          tokenSharePct: 29.53,
          costSharePct: 29.96,
          cacheReadTokens: Math.round(840000 * scale),
          cacheWriteTokens: Math.round(60000 * scale),
          outputTokens: Math.round(98000 * scale),
          inputTokens: Math.round(267600 * scale),
          unclassifiedTokens: 0,
          cacheHitRatePct: 75.84,
          avgOutputTokensPerSec: 74.1,
        },
        {
          model: 'gpt-5',
          tokens: Math.round(680000 * scale),
          costUsd: Number((2.45 * scale).toFixed(2)),
          unpricedTokens: 0,
          tokenSharePct: 15.87,
          costSharePct: 14.92,
          cacheReadTokens: Math.round(441600 * scale),
          cacheWriteTokens: Math.round(35000 * scale),
          outputTokens: Math.round(48400 * scale),
          inputTokens: Math.round(155000 * scale),
          unclassifiedTokens: 0,
          cacheHitRatePct: 74.02,
          avgOutputTokensPerSec: 69.8,
        },
      ],
      devices: [
        {
          deviceId: 'mbp-m4-max',
          hostname: 'MacBook Pro M4 Max',
          platform: 'darwin',
          stale: false,
          tokens: Math.round(2840000 * scale),
          costUsd: Number((10.94 * scale).toFixed(2)),
          tokenSharePct: 66.27,
          projectCount: 3,
        },
        {
          deviceId: 'linux-dev-box',
          hostname: 'Ubuntu Workstation',
          platform: 'linux',
          stale: false,
          tokens: Math.round(1445600 * scale),
          costUsd: Number((5.48 * scale).toFixed(2)),
          tokenSharePct: 33.73,
          projectCount: 2,
        },
      ],
      timeline: Array.from({ length: Math.min(7, Math.max(1, activeDays)) }, (_, idx) => {
        const d = new Date(nowMs - (Math.min(7, activeDays) - 1 - idx) * 86400_000).toISOString().slice(0, 10);
        const dayTokens = idx === Math.min(7, activeDays) - 1 ? 4285600 : Math.round(2650000 + idx * 240000);
        return {
          date: d,
          tokens: dayTokens,
          costUsd: Number((dayTokens * 0.0000038).toFixed(2)),
          activeTimeMs: 7200000 + idx * 900000,
          topClient: 'claude',
          topModel: 'claude-sonnet-4-20250514',
        };
      }),
      signals: [
        {
          code: 'top-project-concentration',
          severity: 'info',
          project: 'token-monitor-android',
          valuePct: 50.17,
          summary: '项目 token-monitor-android 占本周期总 Token 的 50.17%',
        },
        {
          code: 'unpriced-tokens-present',
          severity: 'warning',
          valuePct: 0.98,
          summary: `包含 ${Math.round(42000 * scale).toLocaleString('en-US')} 个未定价 Token，已知费用仅统计已配置费率部分`,
        },
      ],
    };

    const [p1, p2, p3] = report.projects;
    const formatMinutes = (ms: number): string => {
      const mins = Math.max(1, Math.round(ms / 60000));
      if (mins < 60) return `${mins}m`;
      const hours = Math.floor(mins / 60);
      return `${hours}h ${mins % 60}m`;
    };

    const markdown = [
      '---',
      `schema: ${JSON.stringify(report.schema)}`,
      `reportId: ${JSON.stringify(report.reportId)}`,
      `granularity: ${JSON.stringify(granularity)}`,
      `periodKey: ${JSON.stringify(key)}`,
      `startDate: ${JSON.stringify(startDate)}`,
      `endDate: ${JSON.stringify(endDate)}`,
      `generatedAt: ${JSON.stringify(nowIso)}`,
      `totalTokens: ${totalTokens}`,
      `knownCostUsd: ${knownCostUsd}`,
      `projectCount: ${report.projects.length}`,
      '---',
      '',
      `# Token Monitor ${granularity.toUpperCase()} 分析报告 · ${label}`,
      '',
      `报告 ID: \`${report.reportId}\` · 时区: \`Asia/Shanghai\` · 活跃设备: ${report.hub.activeDeviceCount}/${report.hub.deviceCount}`,
      '',
      '## 一、核心总览（Executive Summary）',
      '',
      '| 指标 | 数值 |',
      '| --- | ---: |',
      `| 总 Token 消耗 | ${totalTokens.toLocaleString('en-US')} |`,
      `| 已知费用 (USD) | $${knownCostUsd.toFixed(2)} |`,
      `| 输入 / 输出 Token | ${inputTokens.toLocaleString('en-US')} / ${outputTokens.toLocaleString('en-US')} |`,
      `| 缓存读取 / 写入 | ${cacheReadTokens.toLocaleString('en-US')} / ${cacheWriteTokens.toLocaleString('en-US')} |`,
      `| 缓存命中率 | 75.43% |`,
      `| 消息 / 会话数 | ${report.summary.messageCount} / ${report.summary.sessionCount} |`,
      `| 活跃项目 / 天数 | ${report.projects.length} / ${activeDays} |`,
      `| 活跃时长 / 平均速率 | ${formatMinutes(report.summary.activeTimeMs)} / 76.6 tok/s |`,
      `| 环比变化 (${report.summary.comparison?.previousPeriodKey || '上期'}) | +19.1% Tokens |`,
      '',
      '## 二、项目使用深度分析（Project Usage Analysis）',
      '',
      `归因来源: \`${report.coverage.projectAttributionSource}\` · 完整性: \`${report.coverage.projectsComplete}\``,
      '',
      '| 排名 | 项目 | Token | 占比 | 已知费用 | 主力工具 | 主力模型 |',
      '| --- | --- | ---: | ---: | ---: | --- | --- |',
      ...report.projects.map((p, idx) =>
        `| ${idx + 1} | \`${p.label}\` | ${p.tokens.toLocaleString('en-US')} | ${p.tokenSharePct.toFixed(1)}% | $${p.costUsd.toFixed(2)} | ${p.clients[0]?.client || '-'} | ${p.models[0]?.model || '-'} |`
      ),
      '',
      '## 三、工具与模型效率（Tools & Models Efficiency）',
      '',
      '### AI 编程工具（Clients）',
      '',
      '| 工具 | Token | 占比 | 已知费用 | 缓存命中率 | 输出 Token | 消息数 |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...report.clients.map((c) =>
        `| ${c.client} | ${c.tokens.toLocaleString('en-US')} | ${c.tokenSharePct.toFixed(1)}% | $${c.costUsd.toFixed(2)} | ${c.cacheHitRatePct !== null ? `${c.cacheHitRatePct.toFixed(1)}%` : '—'} | ${c.outputTokens.toLocaleString('en-US')} | ${c.messageCount} |`
      ),
      '',
      '### 主力模型（Models）',
      '',
      '| 模型 | Token | 占比 | 已知费用 | 缓存命中率 | 速率 (tok/s) |',
      '| --- | ---: | ---: | ---: | ---: | ---: |',
      ...report.models.map((m) =>
        `| \`${m.model}\` | ${m.tokens.toLocaleString('en-US')} | ${m.tokenSharePct.toFixed(1)}% | $${m.costUsd.toFixed(2)} | ${m.cacheHitRatePct !== null ? `${m.cacheHitRatePct.toFixed(1)}%` : '—'} | ${m.avgOutputTokensPerSec ?? '—'} |`
      ),
      '',
      '## 四、时间趋势与多设备分布（Timeline & Devices）',
      '',
      '### 逐日用量趋势',
      '',
      '| 日期 | Token | 已知费用 | 活跃时长 | 主力工具 | 主力模型 |',
      '| --- | ---: | ---: | ---: | --- | --- |',
      ...report.timeline.map((row) =>
        `| ${row.date} | ${row.tokens.toLocaleString('en-US')} | $${row.costUsd.toFixed(2)} | ${formatMinutes(row.activeTimeMs)} | ${row.topClient} | ${row.topModel} |`
      ),
      '',
      '### 设备贡献（Devices）',
      '',
      '| 设备 ID | 主机名 | 系统 | 状态 | Token | 占比 | 已知费用 |',
      '| --- | --- | --- | --- | ---: | ---: | ---: |',
      ...report.devices.map((d) =>
        `| \`${d.deviceId}\` | ${d.hostname} | ${d.platform} | ${d.stale ? 'stale' : 'active'} | ${d.tokens.toLocaleString('en-US')} | ${d.tokenSharePct.toFixed(1)}% | $${d.costUsd.toFixed(2)} |`
      ),
      '',
      '## 五、自动化信号（Automated Signals）',
      '',
      ...report.signals.map((sig) =>
        `- **[${sig.severity.toUpperCase()}] \`${sig.code}\`**: ${sig.summary}`
      ),
    ].join('\n');

    const aiAnalysis: ReportAiAnalysis = {
      schemaVersion: 1,
      generatedAt: nowIso,
      protocol: 'openai-compatible',
      providerLabel: 'DeepSeek',
      model: 'deepseek-chat',
      language: 'zh-CN',
      question: null,
      summaryMarkdown: [
        `# ${label} · AI 用量深度分析`,
        '',
        '## 核心结论',
        `- 本周期共消耗 **${totalTokens.toLocaleString('en-US')} tokens**，已知费用 **$${knownCostUsd.toFixed(2)}**（环比上期 **+19.1%**），整体缓存命中率 **75.4%**。`,
        `- 核心工作量集中于 \`${p1.label}\` 与 \`${p2.label}\`，合计贡献 **${(p1.tokenSharePct + p2.tokenSharePct).toFixed(1)}%** 的 Token 消耗。`,
        '- **Team New API** 第三方余额 **$42.50**（本月已用 **$18.40**），`DeepSeek Platform` 与订阅配额余量充足。',
        '',
        '## 项目与研发重点',
        '| 项目 | Tokens | 成本 | 占比 | 观察 |',
        '| --- | ---: | ---: | ---: | --- |',
        `| \`${p1.label}\` | ${p1.tokens.toLocaleString('en-US')} | $${p1.costUsd.toFixed(2)} | ${p1.tokenSharePct.toFixed(1)}% | Claude Code + Codex 协同推进，上下文复用稳定 |`,
        `| \`${p2.label}\` | ${p2.tokens.toLocaleString('en-US')} | $${p2.costUsd.toFixed(2)} | ${p2.tokenSharePct.toFixed(1)}% | Antigravity + \`gemini-2.5-pro\` 聚焦采集链路调试 |`,
        `| \`${p3.label}\` | ${p3.tokens.toLocaleString('en-US')} | $${p3.costUsd.toFixed(2)} | ${p3.tokenSharePct.toFixed(1)}% | Cursor + \`deepseek-r1\` 含少量未定价推理调用 |`,
        '',
        '> **诊断提示**：`claude-sonnet-4-20250514` 缓存命中率达到 **81.9%**（输出速率 **82.4 tok/s**），长对话边际成本控制理想；但 `cursor` 工具链缓存命中仅 **50.3%**，存在会话切分过碎的优化空间。',
        '',
        '## 效率与额度建议',
        `1. **收敛短会话碎片**：在 \`${p3.label}\` 网关调试中尽量延续同一上下文窗口，避免反复重建全量提示词。`,
        `2. **补全模型定价映射**：当前包含 **${report.summary.unpricedTokens.toLocaleString('en-US')}** 个未定价 Token，建议在桌面端费率表中补充 \`deepseek-r1\` 私有路由单价。`,
        '3. **保持双端与推送协同**：`MacBook Pro M4 Max`（66.3%）与 `Ubuntu Workstation`（33.7%）在线稳定，可继续通过 `openclaw-weixin` 自动接收周期复盘。',
      ].join('\n'),
      tokenUsage: { inputTokens: 960, outputTokens: 340, totalTokens: 1300 },
      stale: false,
    };

    return { report, markdown, aiAnalysis };
  };

  const daily = makeDetail('daily', todayKey, `${todayKey} (今日)`, todayKey, todayKey, 1, 1);
  const weekly = makeDetail('weekly', weekKey, `${weekKey} (本周)`, todayKey, todayKey, 4.6, 5);
  const monthly = makeDetail('monthly', monthKey, `${monthKey} (本月)`, `${monthKey}-01`, todayKey, 11.8, 14);

  return {
    config: { enabled: true, daily: true, weekly: true, monthly: true },
    integrations: {
      ai: {
        enabled: true,
        protocol: 'openai-compatible',
        providerLabel: 'DeepSeek',
        model: 'deepseek-chat',
        language: 'zh-CN',
        autoAnalyzeOnRollover: true,
        apiKeyConfigured: true,
      },
      openclaw: {
        enabled: true,
        mode: 'openclaw-agent',
        channel: 'openclaw-weixin',
        to: 'wxid_demo_user',
        pushOnRollover: true,
        includeAiAnalysis: true,
        includeLimits: true,
        hookTokenConfigured: true,
      },
      lastPush: {
        at: nowIso,
        ok: true,
        reportId: daily.report.reportId,
        channel: 'openclaw-weixin',
        mode: 'openclaw-agent',
      },
    },
    items: [
      {
        reportId: daily.report.reportId,
        granularity: 'daily',
        periodKey: todayKey,
        label: daily.report.period.label,
        startDate: daily.report.period.startDate,
        endDate: daily.report.period.endDate,
        generatedAt: nowIso,
        totalTokens: daily.report.summary.totalTokens,
        knownCostUsd: daily.report.summary.knownCostUsd,
        projectCount: daily.report.projects.length,
        hasAiAnalysis: true,
      },
      {
        reportId: weekly.report.reportId,
        granularity: 'weekly',
        periodKey: weekKey,
        label: weekly.report.period.label,
        startDate: weekly.report.period.startDate,
        endDate: weekly.report.period.endDate,
        generatedAt: nowIso,
        totalTokens: weekly.report.summary.totalTokens,
        knownCostUsd: weekly.report.summary.knownCostUsd,
        projectCount: weekly.report.projects.length,
        hasAiAnalysis: true,
      },
      {
        reportId: monthly.report.reportId,
        granularity: 'monthly',
        periodKey: monthKey,
        label: monthly.report.period.label,
        startDate: monthly.report.period.startDate,
        endDate: monthly.report.period.endDate,
        generatedAt: nowIso,
        totalTokens: monthly.report.summary.totalTokens,
        knownCostUsd: monthly.report.summary.knownCostUsd,
        projectCount: monthly.report.projects.length,
        hasAiAnalysis: true,
      },
    ],
    details: {
      [`daily:${todayKey}`]: daily,
      'daily:current': daily,
      [`weekly:${weekKey}`]: weekly,
      'weekly:current': weekly,
      [`monthly:${monthKey}`]: monthly,
      'monthly:current': monthly,
    },
  };
}

export function createDemoAgManager(nowMs: number = Date.now()) {
  const nowIso = new Date(nowMs).toISOString();
  const inTwoHours = new Date(nowMs + 2 * 3600 * 1000).toISOString();
  const inFiveHours = new Date(nowMs + 5 * 3600 * 1000).toISOString();
  const inFourDays = new Date(nowMs + (4 * 24 + 6) * 3600 * 1000).toISOString();
  const inSixDays = new Date(nowMs + (6 * 24 + 3) * 3600 * 1000).toISOString();
  return {
    version: 1,
    updatedAt: nowIso,
    devices: [
      {
        version: 1,
        deviceId: 'debian',
        hostname: 'debian',
        updatedAt: nowIso,
        settings: {
          startupRefresh: false,
          autoRefresh: true,
          refreshIntervalMinutes: 10,
        },
        activeAccounts: {
          classic: 'alice.ultra@example.com',
          ide: 'alice.ultra@example.com',
          agy: 'bob.pro@example.com',
          acp: '',
        },
        accounts: [
          {
            id: 'agm-demo-1',
            email: 'alice.ultra@example.com',
            name: 'Alice Ultra',
            subscriptionTier: 'ULTRA',
            disabled: false,
            disabledReason: '',
            validationBlocked: false,
            validationMessage: '',
            banned: false,
            hasDeviceProfile: true,
            lastUsedAt: Math.floor((nowMs - 120_000) / 1000),
            quota: {
              isForbidden: false,
              forbiddenReason: '',
              lastUpdated: Math.floor(nowMs / 1000),
              groups: [
                {
                  displayName: 'Gemini',
                  description: 'Gemini 3 / 4 shared pool',
                  buckets: [
                    { bucketId: 'gemini-5h', window: '5h', remainingFraction: 0.92, resetTime: inFiveHours, displayName: 'Gemini 5h' },
                    { bucketId: 'gemini-weekly', window: 'weekly', remainingFraction: 0.78, resetTime: inFourDays, displayName: 'Gemini Weekly' },
                  ],
                },
                {
                  displayName: 'Claude / GPT',
                  description: 'Third-party reasoning pool',
                  buckets: [
                    { bucketId: 'claude-5h', window: '5h', remainingFraction: 0.85, resetTime: inTwoHours, displayName: 'Claude 5h' },
                    { bucketId: 'claude-weekly', window: 'weekly', remainingFraction: 0.64, resetTime: inFourDays, displayName: 'Claude Weekly' },
                  ],
                },
                {
                  displayName: 'Hydrogen',
                  description: 'Dedicated Gemini 4 Hydrogen pool',
                  buckets: [
                    { bucketId: 'hydrogen-weekly', window: 'weekly', remainingFraction: 0.9, resetTime: inSixDays, displayName: 'Hydrogen Weekly' },
                  ],
                },
              ],
              models: [
                { name: 'gemini-4-hydrogen-preview', displayName: 'Gemini 4 Hydrogen', percentage: 90, resetTime: inSixDays },
                { name: 'claude-sonnet-4-6-thinking', displayName: 'Claude Sonnet 4.6', percentage: 85, resetTime: inTwoHours },
                { name: 'gpt-oss-120b-medium', displayName: 'GPT OSS 120B', percentage: 85, resetTime: inTwoHours },
                { name: 'gemini-3-pro-high', displayName: 'Gemini 3 Pro High', percentage: 92, resetTime: inFiveHours },
                { name: 'gemini-3-flash', displayName: 'Gemini 3 Flash', percentage: 100, resetTime: inFiveHours },
              ],
            },
          },
          {
            id: 'agm-demo-2',
            email: 'bob.pro@example.com',
            name: 'Bob Pro',
            subscriptionTier: 'PRO',
            disabled: false,
            disabledReason: '',
            validationBlocked: false,
            validationMessage: '',
            banned: false,
            hasDeviceProfile: false,
            lastUsedAt: Math.floor((nowMs - 600_000) / 1000),
            quota: {
              isForbidden: false,
              forbiddenReason: '',
              lastUpdated: Math.floor((nowMs - 600_000) / 1000),
              models: [
                { name: 'claude-opus-4-6-thinking', displayName: 'Claude Opus 4.6', percentage: 15, resetTime: inTwoHours },
                { name: 'gemini-3-pro-high', displayName: 'Gemini 3 Pro High', percentage: 48, resetTime: inFiveHours },
                { name: 'gemini-3-flash', displayName: 'Gemini 3 Flash', percentage: 82, resetTime: inFiveHours },
              ],
            },
          },
          {
            id: 'agm-demo-3',
            email: 'carol.free@example.com',
            name: 'Carol Verify',
            subscriptionTier: 'FREE',
            disabled: false,
            disabledReason: '',
            validationBlocked: true,
            validationMessage: 'Account validation required',
            banned: false,
            hasDeviceProfile: false,
            lastUsedAt: Math.floor((nowMs - 3600_000) / 1000),
            quota: {
              isForbidden: true,
              forbiddenReason: 'Account validation required',
              lastUpdated: Math.floor((nowMs - 3600_000) / 1000),
              groups: [],
              models: [],
            },
          },
        ],
      },
      {
        version: 1,
        deviceId: 'desktop-ir5n5uq',
        hostname: 'DESKTOP-IR5N5UQ',
        updatedAt: new Date(nowMs - 4 * 60_000).toISOString(),
        settings: {
          startupRefresh: true,
          autoRefresh: true,
          refreshIntervalMinutes: 15,
        },
        activeAccounts: {
          classic: 'natsumeqvq@gmail.com',
          ide: 'natsumeqvq@gmail.com',
          agy: '',
          acp: '',
        },
        accounts: [
          {
            id: 'agm-demo-1',
            email: 'natsumeqvq@gmail.com',
            name: 'Natsume Pro',
            subscriptionTier: 'PRO',
            disabled: false,
            disabledReason: '',
            validationBlocked: false,
            validationMessage: '',
            banned: false,
            hasDeviceProfile: true,
            lastUsedAt: Math.floor((nowMs - 240_000) / 1000),
            quota: {
              isForbidden: false,
              forbiddenReason: '',
              lastUpdated: Math.floor((nowMs - 240_000) / 1000),
              groups: [
                {
                  displayName: 'Gemini',
                  description: '',
                  buckets: [
                    { bucketId: 'gemini-5h', window: '5h', remainingFraction: 1, resetTime: nowIso, displayName: 'Gemini 5h' },
                    { bucketId: 'gemini-weekly', window: 'weekly', remainingFraction: 0, resetTime: inFourDays, displayName: 'Gemini Weekly' },
                  ],
                },
                {
                  displayName: 'Claude / GPT',
                  description: '',
                  buckets: [
                    { bucketId: 'claude-5h', window: '5h', remainingFraction: 1, resetTime: nowIso, displayName: 'Claude 5h' },
                    { bucketId: 'claude-weekly', window: 'weekly', remainingFraction: 1, resetTime: inSixDays, displayName: 'Claude Weekly' },
                  ],
                },
              ],
              models: [
                { name: 'claude-sonnet-5-5-thinking', displayName: 'Claude Sonnet 5.5', percentage: 100, resetTime: nowIso },
                { name: 'gpt-oss-120b', displayName: 'GPT OSS 120B', percentage: 100, resetTime: inSixDays },
              ],
            },
          },
          {
            id: 'agm-demo-ir-2',
            email: 'junx8120@gmail.com',
            name: 'Junx Pro',
            subscriptionTier: 'PRO',
            disabled: false,
            disabledReason: '',
            validationBlocked: false,
            validationMessage: '',
            banned: false,
            hasDeviceProfile: true,
            lastUsedAt: Math.floor((nowMs - 900_000) / 1000),
            quota: {
              isForbidden: false,
              forbiddenReason: '',
              lastUpdated: Math.floor((nowMs - 900_000) / 1000),
              groups: [
                {
                  displayName: 'Gemini',
                  description: '',
                  buckets: [
                    { bucketId: 'gemini-5h', window: '5h', remainingFraction: 0.72, resetTime: inFiveHours, displayName: 'Gemini 5h' },
                    { bucketId: 'gemini-weekly', window: 'weekly', remainingFraction: 0.88, resetTime: inFourDays, displayName: 'Gemini Weekly' },
                  ],
                },
              ],
              models: [
                { name: 'claude-sonnet-5-5', displayName: 'Claude 5.5', percentage: 72, resetTime: inFiveHours },
              ],
            },
          },
        ],
      },
      {
        version: 1,
        deviceId: 'desktop-uuo5f81',
        hostname: 'DESKTOP-UUO5F81',
        updatedAt: new Date(nowMs - 18 * 60_000).toISOString(),
        settings: {
          startupRefresh: false,
          autoRefresh: false,
          refreshIntervalMinutes: 10,
        },
        activeAccounts: {
          classic: '',
          ide: 'uuo-backup@example.com',
          agy: '',
          acp: '',
        },
        accounts: [
          {
            id: 'agm-demo-uuo-1',
            email: 'uuo-backup@example.com',
            name: 'UUO Backup',
            subscriptionTier: 'ULTRA',
            disabled: false,
            disabledReason: '',
            validationBlocked: false,
            validationMessage: '',
            banned: false,
            hasDeviceProfile: true,
            lastUsedAt: Math.floor((nowMs - 1080_000) / 1000),
            quota: {
              isForbidden: false,
              forbiddenReason: '',
              lastUpdated: Math.floor((nowMs - 1080_000) / 1000),
              groups: [
                {
                  displayName: 'Gemini',
                  description: '',
                  buckets: [
                    { bucketId: 'gemini-5h', window: '5h', remainingFraction: 0.65, resetTime: inTwoHours, displayName: 'Gemini 5h' },
                  ],
                },
              ],
              models: [
                { name: 'gemini-4-argon-preview', displayName: 'Gemini 4 Argon', percentage: 65, resetTime: inTwoHours },
              ],
            },
          },
        ],
      },
      {
        version: 1,
        deviceId: 'mbp-m4-max',
        hostname: 'MacBook-Pro-M4',
        updatedAt: new Date(nowMs - 45 * 60_000).toISOString(),
        settings: {
          startupRefresh: false,
          autoRefresh: true,
          refreshIntervalMinutes: 30,
        },
        activeAccounts: {
          classic: '',
          ide: '',
          agy: 'mbp-pro@example.com',
          acp: 'mbp-pro@example.com',
        },
        accounts: [
          {
            id: 'agm-demo-mbp-1',
            email: 'mbp-pro@example.com',
            name: 'MacBook Pro Pool',
            subscriptionTier: 'PRO',
            disabled: false,
            disabledReason: '',
            validationBlocked: false,
            validationMessage: '',
            banned: false,
            hasDeviceProfile: false,
            lastUsedAt: Math.floor((nowMs - 2700_000) / 1000),
            quota: {
              isForbidden: false,
              forbiddenReason: '',
              lastUpdated: Math.floor((nowMs - 2700_000) / 1000),
              models: [
                { name: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', percentage: 95, resetTime: inFiveHours },
              ],
            },
          },
          {
            id: 'agm-demo-mbp-2',
            email: 'mbp-banned@example.com',
            name: 'Disabled Node',
            subscriptionTier: 'FREE',
            disabled: true,
            disabledReason: 'Suspended by policy',
            validationBlocked: false,
            validationMessage: '',
            banned: true,
            hasDeviceProfile: false,
            lastUsedAt: Math.floor((nowMs - 7200_000) / 1000),
            quota: {
              isForbidden: false,
              forbiddenReason: '',
              lastUpdated: Math.floor((nowMs - 7200_000) / 1000),
              groups: [],
              models: [],
            },
          },
        ],
      },
    ],
  };
}
