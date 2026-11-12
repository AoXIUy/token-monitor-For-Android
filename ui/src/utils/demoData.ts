import type { AppUpdateState, MonitorStats, NotificationState, SubscriptionsPayload, QuotaHistoryPayload } from '../types/monitor';

export function createDemoPayload(nowMs: number = Date.now()): {
  connectionUrl: string;
  stats: MonitorStats;
  subscriptions: SubscriptionsPayload;
  notifications: NotificationState;
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
  return {
    quotaHistory,
    connectionUrl: 'https://hub.tokenmonitor.internal:8443',
    stats,
    subscriptions,
    notifications: {
      enabled: true,
      permission: true,
      message: '后台完成提醒运行中 · 实时监听 3 台设备',
      lastReadAt: nowMs,
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
