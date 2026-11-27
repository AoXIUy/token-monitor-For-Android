import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ChevronDown,
  Clock,
  Download,
  FileText,
  LayoutGrid,
  Laptop,
  MessageSquare,
  RefreshCw,
  Server,
  Settings,
  X,
} from 'lucide-react';
import { ApprovalsPanel } from './components/ApprovalsPanel';
import { AntigravityManagerView } from './components/AntigravityManagerView';
import { CompletionSettingsCard } from './components/CompletionSettingsCard';
import { AppUpdateDialog } from './components/AppUpdateDialog';
import { DeviceIcon } from './components/DeviceIcon';
import { DevicePickerDialog } from './components/DevicePickerDialog';
import { DevicesView } from './components/DevicesView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LimitsView } from './components/LimitsView';
import { OverviewView } from './components/OverviewView';
import { ReportWindowDialog, type ReportWindowTab } from './components/ReportWindowDialog';
import { ReportsView } from './components/ReportsView';
import { SessionDetailView } from './components/SessionDetailView';
import { SessionsView } from './components/SessionsView';
import { SettingsView } from './components/SettingsView';
import { EmptyState, InlineAlert, SegmentedControl } from './components/ui/Primitives';
import { fixedRangeStatsSignature, isDerivedPeriodId, needsPagedSessions } from './fixedRangeState';
import { useNativeMonitor } from './hooks/useNativeMonitor';
import { MonitorModel } from './model/monitorModel';
import { receiveNativeMessage } from './nativeState';
import type {
  BreakdownKind,
  PageId,
  PeriodId,
  QuotaTabId,
  ReportGranularity,
  ConnectionStatus,
} from './types/monitor';
import { formatShortTime, PAGE_LABELS, PERIOD_LABELS, PERIOD_SHORT_LABELS } from './utils/formatters';

type Monitor = ReturnType<typeof useNativeMonitor>;

export default function App() {
  const monitor = useNativeMonitor();
  const { state, update } = monitor;
  const showUpdate = state.foreground && state.appUpdate.available && Boolean(state.appUpdate.promptToken)
    && state.dismissedUpdatePrompt !== state.appUpdate.promptToken && state.appUpdate.download.phase !== 'installing';
  return (
    <ErrorBoundary
      onOpenSettings={() => update((previous) => ({ ...previous, page: 'settings' }))}
    >
      <Dashboard key={state.connectionEpoch} {...monitor} />
      <AppUpdateDialog state={state.appUpdate} open={showUpdate}
        onDismiss={() => {
          update((previous) => ({ ...previous, dismissedUpdatePrompt: previous.appUpdate.promptToken }));
          window.HubNative?.dismissAppUpdatePrompt?.();
        }} />
    </ErrorBoundary>
  );
}

function isTextEntryElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return !target.readOnly && !target.disabled;
  if (target instanceof HTMLInputElement) {
    const nonText = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'];
    return !nonText.includes(target.type) && !target.readOnly && !target.disabled;
  }
  return target.isContentEditable;
}

function Dashboard({
  state,
  update,
  isBrowserPreview,
  loadBrowserDemo,
  queryConversation,
  clearConversation,
  queryReportsList,
  queryReportDetail,
  clearReports,
  queryAntigravityManager,
  cancelAntigravityManager,
  updateAgManagerFilter,
  queryFixedRange,
  cancelFixedRange,
  saveLimitsPrefs,
  saveDisplayPrefs,
  pickCaCertificate,
  validateCaCertificatePem,
  clearCaCertificateDraft,
}: Monitor) {
  const {
    page,
    period,
    device,
    stats,
    subscriptions,
    subscriptionError,
    connection,
    allowHttp,
    hasCustomCa,
    hubProfiles,
    activeHubProfileId,
    caDraft,
    status,
    message,
    fetchedAt,
    foreground,
    statusHealthy,
    detailKey,
    notifications,
    monitorPending,
    approvals,
    approvalsPending,
    connectPending,
    formError,
    imeVisible,
  } = state;
  const [breakdownKind, setBreakdownKind] = useState<BreakdownKind>('clients');
  const [quotaTab, setQuotaTab] = useState<QuotaTabId>('limits');
  const [search, setSearch] = useState('');
  const [sessionTool, setSessionTool] = useState('');
  const [sessionLimit, setSessionLimit] = useState(40);
  const [openSessions, setOpenSessions] = useState<Set<string>>(() => new Set());
  const [deadlineTick, setDeadlineTick] = useState(0);
  const [revealAppUpdate, setRevealAppUpdate] = useState(false);
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [reportWindowOpen, setReportWindowOpen] = useState(false);
  const [reportWindowTab, setReportWindowTab] = useState<ReportWindowTab>('ai');
  const [inputFocused, setInputFocused] = useState(false);
  const [previewViewportKeyboard, setPreviewViewportKeyboard] = useState(false);

  const previewRefreshTimerRef = useRef<number | null>(null);
  const previewUpdateTimerRef = useRef<number | null>(null);
  const prevImeVisibleRef = useRef(imeVisible);

  useEffect(() => {
    return () => {
      if (previewRefreshTimerRef.current !== null) window.clearTimeout(previewRefreshTimerRef.current);
      if (previewUpdateTimerRef.current !== null) window.clearTimeout(previewUpdateTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (device && breakdownKind === 'devices') {
      setBreakdownKind('clients');
    }
  }, [device, breakdownKind]);

  useEffect(() => {
    if ((!connection || page !== 'reports') && reportWindowOpen) {
      setReportWindowOpen(false);
    }
  }, [connection, page, reportWindowOpen]);

  useEffect(() => {
    if (page === 'limits' && quotaTab === 'antigravityManager' && connection && foreground) {
      queryAntigravityManager();
    } else {
      cancelAntigravityManager();
    }
  }, [page, quotaTab, connection, foreground, queryAntigravityManager, cancelAntigravityManager]);

  // Track text-entry focus & reconcile unmounted focused inputs so bottom nav never gets stuck hidden.
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (isTextEntryElement(event.target)) setInputFocused(true);
    };
    const onFocusOut = () => {
      window.requestAnimationFrame(() => {
        setInputFocused(isTextEntryElement(document.activeElement));
      });
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  // Reconcile focus whenever route/dialog changes (unmounted inputs do not fire focusout in Chromium).
  useEffect(() => {
    setInputFocused(isTextEntryElement(document.activeElement));
  }, [page, quotaTab, devicePickerOpen, reportWindowOpen]);

  // While an input is focused, observe DOM removals so unmounting a focused field resets inputFocused.
  useEffect(() => {
    if (!inputFocused || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      if (!isTextEntryElement(document.activeElement)) {
        setInputFocused(false);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [inputFocused]);

  // When Android Back dismisses the IME without blurring the active input, restore bottom nav cleanly.
  useEffect(() => {
    if (prevImeVisibleRef.current && !imeVisible) {
      setInputFocused(false);
    }
    prevImeVisibleRef.current = imeVisible;
  }, [imeVisible]);

  // Browser preview fallback: detect mobile virtual keyboard shrink via visualViewport.
  useEffect(() => {
    if (!isBrowserPreview || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const checkViewport = () => {
      setPreviewViewportKeyboard(vv.height < window.innerHeight * 0.82);
    };
    vv.addEventListener('resize', checkViewport);
    return () => vv.removeEventListener('resize', checkViewport);
  }, [isBrowserPreview]);

  useEffect(() => {
    if (!revealAppUpdate || page !== 'settings') return;
    document.getElementById('app-update')?.scrollIntoView({ block: 'start' });
    setRevealAppUpdate(false);
  }, [page, revealAppUpdate]);

  const nowTick = Date.now();
  const customPeriodTabs = state.displayPrefs.periodTabOrder;
  const hasCustomPeriodTabs = customPeriodTabs.length >= 3;
  const wantsPagedSessions = needsPagedSessions(stats, period);
  const fixedRangeSig =
    stats && (isDerivedPeriodId(period) || wantsPagedSessions)
      ? fixedRangeStatsSignature(stats, period)
      : '';
  const currentFixedEntry =
    isDerivedPeriodId(period) || wantsPagedSessions ? state.fixedRange[period] ?? null : null;

  useEffect(() => {
    if (hasCustomPeriodTabs && !customPeriodTabs.includes(period)) {
      update((previous) => ({ ...previous, period: customPeriodTabs[0] }));
    }
  }, [hasCustomPeriodTabs, customPeriodTabs, period, update]);

  useEffect(() => {
    if (hasCustomPeriodTabs && rangeMenuOpen) {
      setRangeMenuOpen(false);
    }
  }, [hasCustomPeriodTabs, rangeMenuOpen]);

  useEffect(() => {
    if (!foreground || !connection) {
      cancelFixedRange();
      return;
    }
    const needsFixedRange =
      Boolean(stats) &&
      (isDerivedPeriodId(period) || wantsPagedSessions) &&
      Boolean(fixedRangeSig) &&
      (page === 'overview' || page === 'sessions' || page === 'sessionDetail' || (isDerivedPeriodId(period) && devicePickerOpen));
    if (!needsFixedRange) return;
    if (
      currentFixedEntry &&
      currentFixedEntry.signature === fixedRangeSig &&
      (currentFixedEntry.loading ||
        currentFixedEntry.scanned !== null ||
        currentFixedEntry.deviceHistories !== null ||
        Boolean(currentFixedEntry.error))
    ) {
      return;
    }
    queryFixedRange(period, fixedRangeSig);
  }, [
    foreground,
    connection,
    stats,
    period,
    wantsPagedSessions,
    fixedRangeSig,
    page,
    devicePickerOpen,
    currentFixedEntry,
    queryFixedRange,
    cancelFixedRange,
  ]);

  const fixedRangeRes = MonitorModel.resolveFixedRange(
    stats,
    period,
    isDerivedPeriodId(period) || wantsPagedSessions ? state.fixedRange[period] ?? null : null,
    nowTick,
  );
  const effectiveStats = fixedRangeRes.projectedStats || stats;
  const selected = MonitorModel.select(effectiveStats, device, period, nowTick);
  const detailsAvailable = !isDerivedPeriodId(period)
    ? true
    : device
      ? Boolean(fixedRangeRes.deviceDetailsAvailable[device])
      : fixedRangeRes.detailsAvailable;

  const setPage = (next: PageId) => {
    setDevicePickerOpen(false);
    if (next !== 'reports') setReportWindowOpen(false);
    update((previous) => ({ ...previous, page: next }));
    setOpenSessions(new Set());
    setSessionLimit(40);
    if (next === 'limits' && quotaTab === 'subscriptions') {
      window.HubNative?.subscriptions?.();
    }
    window.scrollTo(0, 0);
  };
  const openReportsZone = (
    granularity: ReportGranularity = 'daily',
    openWindow = false,
    tab: ReportWindowTab = 'ai',
  ) => {
    setDevicePickerOpen(false);
    setReportWindowTab(tab);
    setReportWindowOpen(openWindow);
    update((previous) => {
      const sameTarget =
        previous.reports.granularity === granularity &&
        previous.reports.periodKey === 'current';
      return {
        ...previous,
        page: 'reports',
        reports: {
          ...previous.reports,
          granularity,
          periodKey: 'current',
          listError: '',
          detailError: '',
          report: sameTarget ? previous.reports.report : null,
          aiAnalysis: sameTarget ? previous.reports.aiAnalysis : null,
          markdown: sameTarget ? previous.reports.markdown : '',
        },
      };
    });
    window.scrollTo(0, 0);
  };
  const setPeriod = (next: PeriodId) => {
    update((previous) => ({ ...previous, period: next }));
    setSessionTool('');
    setSessionLimit(40);
  };
  const setDevice = (next: string) => {
    update((previous) => ({ ...previous, device: next }));
    setSessionTool('');
    setSessionLimit(40);
  };
  const openSession = (key: string) => {
    setDevicePickerOpen(false);
    update((previous) => ({ ...previous, page: 'sessionDetail', detailKey: key }));
    setOpenSessions(new Set());
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const visibility = () => setDeadlineTick((previous) => previous + 1);
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);

  useEffect(() => {
    if (
      !effectiveStats ||
      !foreground ||
      document.hidden ||
      !['overview', 'sessions', 'sessionDetail'].includes(page)
    )
      return;
    const now = Date.now();
    const detail =
      page === 'sessionDetail'
        ? MonitorModel.sessionDetail(effectiveStats, detailKey, { deviceId: device, period, now })
        : null;
    const rows =
      page === 'sessionDetail'
        ? detail
          ? [detail.row]
          : []
        : MonitorModel.sessions(selected.period, page === 'overview' ? '' : search);
    let nearest = Infinity;
    for (const row of rows) {
      const reading = MonitorModel.sessionStatus(row, {
        now,
        stats: effectiveStats,
        deviceId: device,
        period: detail?.period || period,
        connected: statusHealthy,
        foreground,
        fetchedAt,
      });
      if (reading.nextChangeAt > now) nearest = Math.min(nearest, reading.nextChangeAt);
    }
    if (!Number.isFinite(nearest)) return;
    const timer = setTimeout(
      () => setDeadlineTick((previous) => previous + 1),
      Math.max(1, nearest - now),
    );
    return () => clearTimeout(timer);
  }, [
    effectiveStats,
    foreground,
    page,
    detailKey,
    device,
    period,
    selected.period,
    search,
    statusHealthy,
    fetchedAt,
    deadlineTick,
  ]);

  const handleRefresh = () => {
    if (isAgManagerView) {
      if (connection) {
        queryAntigravityManager();
      }
      return;
    }
    if (isDerivedPeriodId(period) && fixedRangeSig && connection) {
      queryFixedRange(period, fixedRangeSig);
    }
    if (window.HubNative?.refresh) {
      window.HubNative.refresh();
      return;
    }
    if (isBrowserPreview) {
      if (previewRefreshTimerRef.current !== null) window.clearTimeout(previewRefreshTimerRef.current);
      update((previous) => receiveNativeMessage(previous, { type: 'status', state: 'loading' }));
      previewRefreshTimerRef.current = window.setTimeout(() => {
        previewRefreshTimerRef.current = null;
        const now = Date.now();
        update((previous) => {
          let next = receiveNativeMessage(previous, { type: 'status', state: 'online' });
          if (previous.stats) {
            next = receiveNativeMessage(next, {
              type: 'stats',
              data: previous.stats,
              fetchedAt: now,
            });
          }
          return next;
        });
      }, 220);
    }
  };

  const handleConnect = (url: string, secret: string, allowHttpChecked: boolean, caDraftToken = '') => {
    if (!window.HubNative?.connect) {
      loadBrowserDemo(url, allowHttpChecked);
      return;
    }
    update((previous) => ({ ...previous, connectPending: true, formError: '' }));
    if (caDraftToken && window.HubNative.connectWithTls) {
      window.HubNative.connectWithTls(url, secret, allowHttpChecked, caDraftToken);
    } else if (window.HubNative.connectWithTls) {
      window.HubNative.connectWithTls(url, secret, allowHttpChecked, '');
    } else {
      window.HubNative.connect(url, secret, allowHttpChecked);
    }
  };

  const handleSelectHubProfile = (id: string) => {
    if (window.HubNative?.selectHubProfile) {
      update((previous) => ({ ...previous, connectPending: true, formError: '' }));
      window.HubNative.selectHubProfile(id);
      return;
    }
    const target = hubProfiles.find((profile) => profile.id === id);
    if (target) loadBrowserDemo(target.url, target.allowHttp, target.id);
  };

  const handleAddHubProfile = (name: string, url: string, secret: string, allowHttpChecked: boolean, caDraftToken = '') => {
    if (window.HubNative?.addHubProfileWithTls) {
      update((previous) => ({ ...previous, connectPending: true, formError: '' }));
      window.HubNative.addHubProfileWithTls(name, url, secret, allowHttpChecked, caDraftToken);
      return;
    }
    if (window.HubNative?.addHubProfile) {
      update((previous) => ({ ...previous, connectPending: true, formError: '' }));
      window.HubNative.addHubProfile(name, url, secret, allowHttpChecked);
      return;
    }
    const cleanUrl = url.trim();
    if (!cleanUrl) return;
    const nextId = `demo-${Date.now().toString(36)}`;
    const nextProfile = {
      id: nextId,
      name: name.trim() || cleanUrl,
      url: cleanUrl,
      allowHttp: allowHttpChecked,
      ...(caDraftToken && caDraft?.cert
        ? {
            hasCustomCa: true,
            caFingerprint: caDraft.cert.sha256,
            caSubject: caDraft.cert.subject,
            caNotAfter: caDraft.cert.notAfter,
          }
        : {}),
    };
    update((previous) => ({
      ...previous,
      hubProfiles: [...previous.hubProfiles, nextProfile],
      activeHubProfileId: nextId,
      caDraft: null,
    }));
    loadBrowserDemo(cleanUrl, allowHttpChecked, nextId);
  };

  const handleSaveHubProfile = (
    id: string,
    name: string,
    url: string,
    secret: string,
    allowHttpChecked: boolean,
    caMode: 'keep' | 'replace' | 'clear' = 'keep',
    caDraftToken = '',
  ) => {
    if (window.HubNative?.saveHubProfileWithTls) {
      update((previous) => ({ ...previous, connectPending: true, formError: '' }));
      window.HubNative.saveHubProfileWithTls(id, name, url, secret, allowHttpChecked, caMode, caDraftToken);
      return;
    }
    if (window.HubNative?.saveHubProfile) {
      update((previous) => ({ ...previous, connectPending: true, formError: '' }));
      window.HubNative.saveHubProfile(id, name, url, secret, allowHttpChecked);
      return;
    }
    const cleanUrl = url.trim();
    if (!cleanUrl) return;
    update((previous) => ({
      ...previous,
      hubProfiles: previous.hubProfiles.map((profile) => {
        if (profile.id !== id) return profile;
        const base = { id: profile.id, name: name.trim() || cleanUrl, url: cleanUrl, allowHttp: allowHttpChecked };
        if (caMode === 'clear') return base;
        if (caMode === 'replace' && caDraft?.cert) {
          return {
            ...base,
            hasCustomCa: true,
            caFingerprint: caDraft.cert.sha256,
            caSubject: caDraft.cert.subject,
            caNotAfter: caDraft.cert.notAfter,
          };
        }
        return profile.hasCustomCa
          ? {
              ...base,
              hasCustomCa: true,
              caFingerprint: profile.caFingerprint,
              caSubject: profile.caSubject,
              caNotAfter: profile.caNotAfter,
            }
          : base;
      }),
      activeHubProfileId: id,
      caDraft: null,
    }));
    loadBrowserDemo(cleanUrl, allowHttpChecked, id);
  };

  const handleDeleteHubProfile = (id: string) => {
    if (window.HubNative?.deleteHubProfile) {
      update((previous) => ({ ...previous, formError: '' }));
      window.HubNative.deleteHubProfile(id);
      return;
    }
    update((previous) => {
      const nextProfiles = previous.hubProfiles.filter((profile) => profile.id !== id);
      if (previous.activeHubProfileId === id) {
        return receiveNativeMessage(previous, {
          type: 'connection',
          url: '',
          activeHubProfileId: '',
          hubProfiles: nextProfiles,
        });
      }
      return receiveNativeMessage(previous, {
        type: 'hubProfiles',
        activeHubProfileId: previous.activeHubProfileId,
        hubProfiles: nextProfiles,
      });
    });
  };

  const handleDisconnect = () => {
    if (window.HubNative?.disconnect) {
      window.HubNative.disconnect();
      return;
    }
    update((previous) =>
      receiveNativeMessage(previous, {
        type: 'connection',
        url: '',
        activeHubProfileId: '',
        hubProfiles: previous.hubProfiles,
      }),
    );
  };

  const handleToggleMonitor = (enabled: boolean) => {
    if (window.HubNative?.monitor) {
      update((previous) => ({ ...previous, monitorPending: true }));
      window.HubNative.monitor(enabled);
      return;
    }
    if (isBrowserPreview) {
      update((previous) =>
        receiveNativeMessage(previous, {
          type: 'notifications',
          enabled,
          permission: true,
          message: enabled ? '后台完成提醒运行中 · 实时监听 3 台设备' : '完成提醒未开启',
          lastReadAt: Date.now(),
        }),
      );
    }
  };

  const handleToggleApprovalAlerts = (enabled: boolean) => {
    if (window.HubNative?.approvalAlerts) {
      update((previous) => ({ ...previous, approvalsPending: true }));
      window.HubNative.approvalAlerts(enabled);
      return;
    }
    if (isBrowserPreview) {
      update((previous) =>
        receiveNativeMessage(previous, {
          type: 'approvalAlerts',
          enabled,
          permission: true,
          status: enabled ? 'ok' : 'off',
          message: enabled ? '审批提醒在线 · 等待电脑端确认提醒' : '审批提醒未开启',
          items: enabled ? previous.approvals.items : [],
        }),
      );
    }
  };

  const handleTestNotification = () => {
    if (window.HubNative?.testNotification) {
      window.HubNative.testNotification();
      return;
    }
    if (isBrowserPreview) {
      update((previous) =>
        receiveNativeMessage(previous, {
          type: 'notifications',
          enabled: previous.notifications.enabled,
          permission: true,
          message: '测试通知已发送 · 会话提醒通道正常',
          lastReadAt: Date.now(),
        }),
      );
    }
  };

  const handleOpenNotificationSettings = () => {
    if (window.HubNative?.notificationSettings) {
      window.HubNative.notificationSettings();
      return;
    }
    if (isBrowserPreview) {
      update((previous) =>
        receiveNativeMessage(previous, {
          type: 'notifications',
          enabled: previous.notifications.enabled,
          permission: true,
          message: '系统通知权限已就绪 (Web 预览模式)',
          lastReadAt: Date.now(),
        }),
      );
    }
  };

  const handleSimulateUpdateCheck = () => {
    if (previewUpdateTimerRef.current !== null) window.clearTimeout(previewUpdateTimerRef.current);
    update((previous) =>
      receiveNativeMessage(previous, {
        type: 'appUpdate',
        ...previous.appUpdate,
        checking: true,
      }),
    );
    previewUpdateTimerRef.current = window.setTimeout(() => {
      previewUpdateTimerRef.current = null;
      update((previous) =>
        receiveNativeMessage(previous, {
          type: 'appUpdate',
          ...previous.appUpdate,
          checking: false,
          checkedAt: Date.now(),
          currentVersion: previous.appUpdate.currentVersion || '1.29.1',
          latestVersion: previous.appUpdate.currentVersion || '1.29.1',
          available: false,
        }),
      );
    }, 300);
  };

  const handleSimulateAutoUpdateToggle = (enabled: boolean) => {
    update((previous) =>
      receiveNativeMessage(previous, {
        type: 'appUpdate',
        ...previous.appUpdate,
        automatic: enabled,
      }),
    );
  };

  const handleToggleSessionAccordion = (encodedKey: string) =>
    setOpenSessions((previous) => {
      const next = new Set(previous);
      if (next.has(encodedKey)) next.delete(encodedKey);
      else next.add(encodedKey);
      return next;
    });

  const isAgManagerView = page === 'limits' && quotaTab === 'antigravityManager';
  const containerWidth = isAgManagerView ? 'max-w-[460px] sm:max-w-2xl lg:max-w-5xl' : 'max-w-[460px]';
  const isRefreshing = isAgManagerView ? state.agManager.loading : status === 'loading';
  const showFilters =
    page !== 'settings' &&
    page !== 'devices' &&
    page !== 'sessionDetail' &&
    page !== 'reports' &&
    !(page === 'limits' && (quotaTab === 'subscriptions' || quotaTab === 'antigravityManager'));

  useEffect(() => {
    if (!showFilters && devicePickerOpen) setDevicePickerOpen(false);
  }, [showFilters, devicePickerOpen]);

  // Gate bottom-nav hiding on BOTH focused input AND real IME visibility
  // so synthetic IME insets without a focused input keep `.bottom-nav` aligned
  // and dismissing the keyboard via Android Back restores navigation immediately.
  const hideBottomNav = inputFocused && (isBrowserPreview ? previewViewportKeyboard : imeVisible);

  const showPeriods = page !== 'limits';
  const showRefresh = Boolean(connection) && page !== 'settings' && page !== 'reports';
  const noticeVisible = status === 'offline' || Boolean(message);
  const noticeText =
    (message || (status === 'offline' ? '无法连接 Hub' : '')) +
    (status === 'offline' && fetchedAt ? ' · 当前显示上次数据，正在自动重试' : '');

  const statusLabel =
    ({
      online: '已连接',
      offline: '已断线',
      loading: '同步中',
      disconnected: '未连接',
    } as Record<ConnectionStatus, string>)[status] || '未连接';

  const statusDotColor =
    status === 'online'
      ? 'bg-[var(--tm-success)]'
      : status === 'loading'
        ? 'bg-[var(--tm-warning)] animate-pulse'
        : status === 'offline'
          ? 'bg-[var(--tm-danger)]'
          : 'bg-[var(--tm-text-subtle)]';

  const devicesList = stats?.devices || [];
  const activeDevicesCount = devicesList.filter((d) => !d.stale).length;
  const selectedDeviceObj = device ? devicesList.find((d) => d.deviceId === device) || null : null;
  const isSelectedDeviceRemoved = Boolean(device) && !selectedDeviceObj;

  const updatedTimeShort = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '';

  const eyebrowText =
    page === 'settings'
      ? '连接、外观主题与系统偏好'
      : page === 'reports'
        ? '智能分析 · 周期报告专区'
        : page === 'devices'
          ? devicesList.length > 0
            ? `共 ${devicesList.length} 台主机 · ${activeDevicesCount} 台在线`
            : '采集主机与上报状态'
          : page === 'sessionDetail'
            ? '会话用量、模型与活动明细'
            : devicesList.length > 0
              ? `${activeDevicesCount}/${devicesList.length} 台设备在线${updatedTimeShort ? ` · ${updatedTimeShort} 更新` : ''}`
              : 'AI 遥测与额度监控';

  return (
    <div className="min-h-screen bg-[var(--tm-bg-canvas)] text-[var(--tm-text-primary)] relative overflow-x-clip flex flex-col">
      <div
        aria-hidden="true"
        style={{ backgroundImage: 'var(--tm-ambient-glow)' }}
        className="fixed inset-x-0 top-0 h-64 pointer-events-none z-0"
      />

      <header className="sticky top-0 z-30 w-full tm-chrome-bar border-b border-[var(--tm-border-subtle)]">
        <div className={`${containerWidth} mx-auto h-14 px-3.5 sm:px-4 flex items-center justify-between gap-2`}>
          <button
            type="button"
            onClick={() => setPage('overview')}
            className="min-w-0 flex items-center gap-2 text-left rounded-xl px-1 -ml-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)] min-h-[44px] active:scale-[0.98] transition-transform group"
          >
            <div className="w-7 h-7 rounded-lg bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] flex items-center justify-center text-[var(--tm-accent-text)] group-hover:border-[var(--tm-border-accent)] transition-colors shrink-0">
              <Activity className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
            <span className="text-sm font-bold tracking-tight text-[var(--tm-text-primary)] truncate">
              Token Monitor
            </span>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {connection && page !== 'reports' && (
              <button
                id="header-reports-button"
                type="button"
                aria-label="打开报告专区"
                onClick={() => openReportsZone('daily', false)}
                className="min-h-[44px] py-1 inline-flex items-center shrink-0 active:scale-[0.97] transition-transform"
              >
                <span className="h-9 px-2.5 rounded-full glass-pill-bar hover:border-[var(--tm-border-accent)] inline-flex items-center gap-1 text-xs font-semibold text-[var(--tm-accent-text)] transition-colors whitespace-nowrap">
                  <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>报告</span>
                </span>
              </button>
            )}

            <button
              id="connection-button"
              type="button"
              onClick={() => setPage('settings')}
              aria-label="连接设置"
              className="min-h-[44px] py-1 inline-flex items-center shrink-0 active:scale-[0.97] transition-transform"
            >
              <span className="h-9 px-2.5 sm:px-3 rounded-full glass-pill-bar hover:border-[var(--tm-border-strong)] inline-flex items-center gap-1.5 text-xs font-medium text-[var(--tm-text-secondary)] transition-colors whitespace-nowrap">
                <i id="status-dot" className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor}`} />
                <span id="status-label">{statusLabel}</span>
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className={`w-full mx-auto flex-1 flex flex-col relative z-10 ${containerWidth}`}>
        <main className="flex-1 px-4 pt-2.5 pb-24">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div className="min-w-0">
              <p
                id="eyebrow"
                className="text-[11.5px] font-medium tracking-wide text-[var(--tm-accent-text)] mb-0.5 truncate tabular-nums"
              >
                {eyebrowText}
              </p>
              <h1
                id="page-title"
                className="text-[21px] sm:text-[23px] leading-tight font-bold tracking-tight text-[var(--tm-text-primary)]"
              >
                {PAGE_LABELS[page]}
              </h1>
            </div>

            {showRefresh && (
              <button
                id="refresh"
                type="button"
                disabled={isRefreshing}
                onClick={handleRefresh}
                aria-label="刷新数据"
                className="w-11 h-11 rounded-full glass-pill-bar hover:border-[var(--tm-border-strong)] active:scale-95 flex items-center justify-center text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] transition-all disabled:opacity-45 shrink-0"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    isRefreshing ? 'animate-spin text-[var(--tm-accent)]' : ''
                  }`}
                />
              </button>
            )}
          </div>

          {noticeVisible && (
            <InlineAlert
              id="notice"
              tone={status === 'offline' && !fetchedAt ? 'rose' : 'amber'}
              ariaLive="polite"
              className="mb-3"
              action={
                status === 'offline' && connection ? (
                  <button
                    type="button"
                    onClick={handleRefresh}
                    className="min-h-[40px] px-3 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-border-default)] text-xs font-semibold text-[var(--tm-text-primary)] active:scale-[0.97] transition-all whitespace-nowrap"
                  >
                    重试
                  </button>
                ) : undefined
              }
            >
              <span>{noticeText}</span>
            </InlineAlert>
          )}

          {state.appUpdate.available &&
            state.dismissedUpdateVersion !== state.appUpdate.latestVersion && (
              <InlineAlert
                id="app-update-banner"
                tone="sky"
                icon={<Download className="w-4 h-4" />}
                className="mb-3 py-2"
                action={
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setPage('settings');
                        setRevealAppUpdate(true);
                      }}
                      className="min-h-[44px] px-3 rounded-xl bg-[var(--tm-accent-soft-bg)] hover:brightness-105 border border-[var(--tm-accent-soft-border)] text-xs font-semibold text-[var(--tm-accent-text)] active:scale-[0.97] transition-all whitespace-nowrap"
                    >
                      查看更新
                    </button>
                    <button
                      type="button"
                      aria-label="稍后更新"
                      className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-[var(--tm-info-text)] hover:bg-[var(--tm-bg-control-hover)] active:scale-95 transition-all"
                      onClick={() =>
                        update((previous) => ({
                          ...previous,
                          dismissedUpdateVersion: previous.appUpdate.latestVersion,
                        }))
                      }
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                }
              >
                <span className="font-medium">
                  发现新版本 {state.appUpdate.latestVersion}
                </span>
              </InlineAlert>
            )}

          {page === 'limits' && (
            <SegmentedControl<QuotaTabId>
              id="quota-tabs"
              ariaLabel="额度视图"
              value={quotaTab}
              className="mb-3"
              onChange={(qId) => {
                setQuotaTab(qId);
                if (qId === 'subscriptions') {
                  window.HubNative?.subscriptions?.();
                }
              }}
              options={[
                { value: 'limits', label: '账户额度', dataAttrs: { 'data-quota': 'limits' } },
                { value: 'subscriptions', label: '共享订阅', dataAttrs: { 'data-quota': 'subscriptions' } },
                { value: 'antigravityManager', label: 'AG 账号池', dataAttrs: { 'data-quota': 'antigravityManager' } },
              ]}
            />
          )}

          {showFilters && (
            <div id="filters" className="mb-3 space-y-2">
              {showPeriods && (
                <>
                  <SegmentedControl<PeriodId>
                    id="periods"
                    ariaLabel="统计周期"
                    value={period}
                    onChange={(pId) => {
                      setPeriod(pId);
                      setOpenSessions(new Set());
                    }}
                    options={
                      hasCustomPeriodTabs
                        ? customPeriodTabs.map((pId) => ({
                            value: pId,
                            label:
                              customPeriodTabs.length >= 5
                                ? PERIOD_SHORT_LABELS[pId]
                                : PERIOD_LABELS[pId],
                            dataAttrs: { 'data-period': pId },
                          }))
                        : (() => {
                            const middlePeriod: PeriodId = isDerivedPeriodId(period)
                              ? period
                              : 'month';
                            return [
                              {
                                value: 'today' as PeriodId,
                                label: PERIOD_LABELS.today,
                                dataAttrs: { 'data-period': 'today' },
                              },
                              {
                                value: middlePeriod,
                                label: PERIOD_LABELS[middlePeriod],
                                dataAttrs: { 'data-period': middlePeriod },
                              },
                              {
                                value: 'allTime' as PeriodId,
                                label: PERIOD_LABELS.allTime,
                                dataAttrs: { 'data-period': 'allTime' },
                              },
                            ];
                          })()
                    }
                  />

                  {!hasCustomPeriodTabs && (rangeMenuOpen || isDerivedPeriodId(period)) && (
                    <div
                      id="period-range-options"
                      role="group"
                      aria-label="选择固定统计范围"
                      className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5"
                    >
                      {(['yesterday', 'week', 'last7', 'month', 'last30'] as PeriodId[]).map(
                        (rangeId) => {
                          const active = period === rangeId;
                          return (
                            <button
                              key={rangeId}
                              type="button"
                              data-fixed-period={rangeId}
                              aria-pressed={active}
                              onClick={() => {
                                setPeriod(rangeId);
                                setOpenSessions(new Set());
                                if (rangeId === 'month') setRangeMenuOpen(false);
                              }}
                              className={`min-h-[40px] shrink-0 px-3 rounded-full text-xs font-semibold border transition-all active:scale-[0.98] whitespace-nowrap ${
                                active
                                  ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]'
                                  : 'glass-inset text-[var(--tm-text-secondary)] hover:border-[var(--tm-border-strong)]'
                              }`}
                            >
                              {PERIOD_LABELS[rangeId]}
                            </button>
                          );
                        },
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <button
                    id="device-picker-trigger"
                    type="button"
                    aria-label="选择统计设备"
                    aria-haspopup="dialog"
                    aria-expanded={devicePickerOpen}
                    onClick={() => setDevicePickerOpen(true)}
                    className={`min-h-[44px] px-3 py-1.5 rounded-full glass-pill-bar hover:border-[var(--tm-border-strong)] active:scale-[0.98] inline-flex items-center gap-2 text-xs font-medium max-w-full min-w-0 transition-all ${
                      isSelectedDeviceRemoved
                        ? 'border-[var(--tm-warning-soft-border)] text-[var(--tm-warning-text)]'
                        : 'text-[var(--tm-text-primary)]'
                    }`}
                  >
                    {selectedDeviceObj ? (
                      <>
                        <DeviceIcon
                          kind={selectedDeviceObj.deviceKind}
                          className="w-3.5 h-3.5 text-[var(--tm-accent-text)] shrink-0"
                        />
                        <i
                          aria-hidden="true"
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            selectedDeviceObj.stale ? 'bg-[var(--tm-warning)]' : 'bg-[var(--tm-success)]'
                          }`}
                        />
                        <span className="truncate">
                          {selectedDeviceObj.hostname || selectedDeviceObj.deviceId}
                        </span>
                      </>
                    ) : isSelectedDeviceRemoved ? (
                      <>
                        <Laptop className="w-3.5 h-3.5 text-[var(--tm-warning)] shrink-0" aria-hidden="true" />
                        <span className="truncate">所选设备已移除</span>
                      </>
                    ) : (
                      <>
                        <Server className="w-3.5 h-3.5 text-[var(--tm-accent-text)] shrink-0" aria-hidden="true" />
                        <span className="truncate">全部设备</span>
                        {devicesList.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-bg-control)] text-[11px] tabular-nums text-[var(--tm-text-secondary)] shrink-0">
                            {activeDevicesCount}/{devicesList.length}
                          </span>
                        )}
                      </>
                    )}
                    <ChevronDown className="w-3.5 h-3.5 text-[var(--tm-text-muted)] shrink-0" aria-hidden="true" />
                  </button>

                  {showPeriods && !hasCustomPeriodTabs && (
                    <button
                      id="period-range-trigger"
                      type="button"
                      data-period-range-toggle="true"
                      aria-expanded={rangeMenuOpen || isDerivedPeriodId(period)}
                      aria-label="切换昨日、本周、近7天或近30天统计范围"
                      onClick={() => setRangeMenuOpen((prev) => !prev)}
                      className={`min-h-[44px] px-2.5 py-1.5 rounded-full glass-pill-bar hover:border-[var(--tm-border-strong)] active:scale-[0.98] inline-flex items-center gap-1 text-xs font-medium shrink-0 transition-all ${
                        isDerivedPeriodId(period) || rangeMenuOpen
                          ? 'border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]'
                          : 'text-[var(--tm-text-secondary)]'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{isDerivedPeriodId(period) ? PERIOD_LABELS[period] : '范围'}</span>
                    </button>
                  )}

                  {/* Retained hidden select for programmatic test/automation compatibility */}
                  <select
                    id="device"
                    aria-hidden="true"
                    tabIndex={-1}
                    value={device}
                    onChange={(e) => {
                      setDevice(e.target.value);
                      setOpenSessions(new Set());
                    }}
                    className="sr-only"
                  >
                    <option value="">全部设备</option>
                    {devicesList.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.hostname || d.deviceId} · {d.deviceId}
                      </option>
                    ))}
                    {isSelectedDeviceRemoved && (
                      <option value={device}>所选设备已移除</option>
                    )}
                  </select>
                </div>

                <span
                  id="freshness"
                  title={fetchedAt ? formatShortTime(fetchedAt) : undefined}
                  className={`text-[11.5px] tabular-nums shrink-0 ${
                    status === 'offline' ? 'text-[var(--tm-warning-text)]' : 'text-[var(--tm-text-muted)]'
                  }`}
                >
                  {updatedTimeShort ? `${updatedTimeShort} 更新` : '等待数据'}
                </span>
              </div>
            </div>
          )}

          {page === 'sessions' && (
            <div id="session-tools">
              <CompletionSettingsCard
                notifications={notifications}
                monitorPending={monitorPending}
                approvals={approvals}
                approvalsPending={approvalsPending}
                connected={Boolean(connection)}
                compact={true}
                onToggleMonitor={handleToggleMonitor}
                onToggleApprovalAlerts={handleToggleApprovalAlerts}
                onTestNotification={handleTestNotification}
                onOpenSystemSettings={handleOpenNotificationSettings}
              />
            </div>
          )}

          {page === 'settings' ? (
            <SettingsView
              appUpdate={state.appUpdate}
              stats={stats}
              fetchedAt={fetchedAt}
              connectionUrl={connection}
              allowHttpInitial={allowHttp}
              hasCustomCaInitial={hasCustomCa}
              hubProfiles={hubProfiles}
              activeHubProfileId={activeHubProfileId}
              caDraft={caDraft}
              connectPending={connectPending}
              formError={formError}
              displayPrefs={state.displayPrefs}
              systemDark={state.systemDark}
              onChangeDisplayPrefs={saveDisplayPrefs}
              notifications={notifications}
              monitorPending={monitorPending}
              approvals={approvals}
              approvalsPending={approvalsPending}
              isBrowserPreview={isBrowserPreview}
              onConnect={handleConnect}
              onSelectHubProfile={handleSelectHubProfile}
              onAddHubProfile={handleAddHubProfile}
              onSaveHubProfile={handleSaveHubProfile}
              onDeleteHubProfile={handleDeleteHubProfile}
              onPickCaCertificate={pickCaCertificate}
              onValidateCaPem={validateCaCertificatePem}
              onClearCaDraft={clearCaCertificateDraft}
              onDisconnect={handleDisconnect}
              onLoadDemo={() => loadBrowserDemo()}
              onToggleMonitor={handleToggleMonitor}
              onToggleApprovalAlerts={handleToggleApprovalAlerts}
              onTestNotification={handleTestNotification}
              onOpenSystemSettings={handleOpenNotificationSettings}
              onSimulateUpdateCheck={isBrowserPreview ? handleSimulateUpdateCheck : undefined}
              onSimulateAutoUpdateToggle={
                isBrowserPreview ? handleSimulateAutoUpdateToggle : undefined
              }
            />
          ) : page === 'reports' ? (
            <div id="content">
              <ReportsView
                reports={state.reports}
                providers={selected.providers}
                connected={Boolean(connection)}
                foreground={foreground}
                onBack={() => setPage('overview')}
                onSelectGranularity={(granularity) => {
                  queryReportsList('', 50);
                  queryReportDetail(granularity, 'current');
                }}
                onSelectPeriodKey={(granularity, periodKey) => {
                  queryReportDetail(granularity, periodKey);
                }}
                onRefresh={(granularity, periodKey) => {
                  queryReportsList('', 50);
                  queryReportDetail(granularity, periodKey);
                }}
                onOpenWindow={(tab) => {
                  setReportWindowTab(tab);
                  setReportWindowOpen(true);
                }}
                onCancel={clearReports}
              />
            </div>
          ) : page === 'limits' && quotaTab === 'antigravityManager' ? (
            <div id="content">
              <AntigravityManagerView
                state={state.agManager}
                connected={Boolean(connection)}
                now={nowTick}
                onRefreshSnapshot={queryAntigravityManager}
                onFilterChange={updateAgManagerFilter}
              />
            </div>
          ) : !stats ? (
            <>
              {page === 'overview' && connection && (
                <ApprovalsPanel approvals={approvals} />
              )}
              <EmptyState
                id="content"
                icon={<Activity className="w-6 h-6" />}
                title={connection ? '等待 Hub 数据' : '连接你的 Hub'}
                description={
                  connection
                    ? '连接成功后，用量、设备和额度将在这里显示。'
                    : '打开下方「设置」，输入电脑端的 Hub 地址和 secret。'
                }
                action={
                  !connection ? (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setPage('settings')}
                        className="w-full min-h-[44px] rounded-2xl [background-image:var(--tm-accent-gradient)] text-[var(--tm-text-inverse)] font-bold text-xs active:scale-[0.985] transition-transform"
                      >
                        前往配置 Hub 连接
                      </button>
                      {isBrowserPreview && (
                        <button
                          type="button"
                          onClick={() => loadBrowserDemo()}
                          className="w-full min-h-[44px] rounded-2xl glass-inset hover:border-[var(--tm-border-accent)] text-[var(--tm-accent-text)] font-semibold text-xs active:scale-[0.985] transition-all"
                        >
                          加载演示数据 (Web 预览)
                        </button>
                      )}
                    </div>
                  ) : undefined
                }
              />
            </>
          ) : (
            <div id="content">
              {page === 'overview' && (
                <>
                  <ApprovalsPanel approvals={approvals} />
                  <OverviewView
                    stats={effectiveStats!}
                    selected={selected}
                    period={period}
                    deviceId={device}
                    breakdownKind={breakdownKind}
                    onBreakdownChange={setBreakdownKind}
                    fixedRangeStatus={fixedRangeRes.status}
                    fixedRangeRange={fixedRangeRes.range}
                    detailsAvailable={detailsAvailable}
                    statusHealthy={statusHealthy}
                    foreground={foreground}
                    fetchedAt={fetchedAt}
                    now={nowTick}
                    onSelectDevice={(devId) => {
                      setDevice(devId);
                      setOpenSessions(new Set());
                      window.scrollTo(0, 0);
                    }}
                    onNavigate={(targetPage) => {
                      if (targetPage === 'sessions') {
                        setSearch('');
                        setSessionTool('');
                      }
                      setPage(targetPage);
                    }}
                    onOpenSessionDetail={openSession}
                    separateQoderClients={state.displayPrefs.separateQoderClients}
                    exactTrendTokens={state.displayPrefs.exactTrendTokens}
                    limitsPrefs={state.limitsPrefs}
                    limitAccountPresentation={state.limitAccountPresentation}
                    onSelectToolSessions={(toolId) => {
                      setSearch('');
                      setPage('sessions');
                      setSessionTool(toolId);
                    }}
                    onOpenReports={(granularity: ReportGranularity) => {
                      openReportsZone(granularity, false);
                    }}
                    onOpenReportWindow={(granularity: ReportGranularity = 'daily') => {
                      openReportsZone(granularity, true, 'ai');
                    }}
                  />
                </>
              )}

              {page === 'devices' && (
                <DevicesView
                  stats={stats}
                  onSelectDevice={(devId) => {
                    setDevice(devId);
                    setPage('overview');
                  }}
                />
              )}

              {page === 'limits' && (
                <LimitsView
                  providers={selected.providers}
                  stats={stats}
                  deviceId={device}
                  quotaTab={quotaTab}
                  subscriptions={subscriptions}
                  subscriptionError={subscriptionError}
                  history={state.quotaHistory}
                  historyError={state.historyError}
                  fetchedAt={fetchedAt}
                  foreground={foreground}
                  now={nowTick}
                  prefs={state.limitsPrefs}
                  limitAccountPresentation={state.limitAccountPresentation}
                  onChangePrefs={saveLimitsPrefs}
                />
              )}

              {page === 'sessions' && (
                <SessionsView
                  stats={effectiveStats!}
                  selected={selected}
                  period={period}
                  deviceId={device}
                  fixedRangeStatus={fixedRangeRes.status}
                  detailsAvailable={detailsAvailable}
                  search={search}
                  onSearchChange={(val) => {
                    setSearch(val);
                    setSessionLimit(40);
                  }}
                  tool={sessionTool}
                  onToolChange={(tool) => {
                    setSessionTool(tool);
                    setSessionLimit(40);
                  }}
                  sessionLimit={sessionLimit}
                  onLoadMore={() => setSessionLimit((prev) => prev + 40)}
                  onResetLimit={() => setSessionLimit(40)}
                  openKeys={openSessions}
                  onToggleOpen={handleToggleSessionAccordion}
                  onOpenSessionDetail={openSession}
                  statusHealthy={statusHealthy}
                  foreground={foreground}
                  fetchedAt={fetchedAt}
                  now={nowTick}
                />
              )}

              {page === 'sessionDetail' && (
                <SessionDetailView
                  key={detailKey}
                  stats={effectiveStats!}
                  detailKey={detailKey}
                  deviceId={device}
                  period={period}
                  statusHealthy={statusHealthy}
                  foreground={foreground}
                  fetchedAt={fetchedAt}
                  now={nowTick}
                  onBack={() => setPage('sessions')}
                  onSelectSession={openSession}
                  conversation={state.conversation}
                  onQueryConversation={queryConversation}
                  onClearConversation={clearConversation}
                />
              )}
            </div>
          )}
        </main>

        <DevicePickerDialog
          open={devicePickerOpen && showFilters}
          stats={effectiveStats}
          selectedDeviceId={device}
          period={period}
          page={page}
          now={nowTick}
          isSelectedDeviceRemoved={isSelectedDeviceRemoved}
          onSelectDevice={(devId) => {
            setDevice(devId);
            setOpenSessions(new Set());
            window.scrollTo(0, 0);
          }}
          onOpenDevicesPage={() => setPage('devices')}
          onClose={() => setDevicePickerOpen(false)}
        />

        <ReportWindowDialog
          open={reportWindowOpen && page === 'reports' && Boolean(connection)}
          activeTab={reportWindowTab}
          onChangeTab={setReportWindowTab}
          onClose={() => setReportWindowOpen(false)}
          reports={state.reports}
        />
      </div>

      <nav
        aria-label="主导航"
        aria-hidden={hideBottomNav || undefined}
        className={`bottom-nav fixed bottom-0 inset-x-0 z-40 tm-chrome-bar border-t border-[var(--tm-border-subtle)] transition-all duration-150 ${
          hideBottomNav ? 'opacity-0 pointer-events-none translate-y-full' : ''
        }`}
      >
        <div className={`${containerWidth} mx-auto px-2 py-1 grid grid-cols-5 gap-1`}>
          {(
            [
              ['overview', '总览', LayoutGrid],
              ['devices', '设备', Server],
              ['limits', '额度', Clock],
              ['sessions', '会话', MessageSquare],
              ['settings', '设置', Settings],
            ] as const
          ).map(([tabId, label, Icon]) => {
            const isActive =
              page === tabId ||
              (page === 'sessionDetail' && tabId === 'sessions') ||
              (page === 'reports' && tabId === 'overview');
            return (
              <button
                key={tabId}
                type="button"
                data-page={tabId}
                aria-current={isActive ? 'page' : undefined}
                tabIndex={hideBottomNav ? -1 : undefined}
                onClick={() => setPage(tabId)}
                className="group min-h-[52px] rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-transform duration-150 active:scale-[0.96]"
              >
                <span
                  aria-hidden="true"
                  className={`w-14 h-7 rounded-full flex items-center justify-center transition-colors duration-150 ${
                    isActive
                      ? 'bg-[var(--tm-nav-active-bg)] text-[var(--tm-nav-active-text)]'
                      : 'text-[var(--tm-text-muted)] group-hover:text-[var(--tm-text-primary)]'
                  }`}
                >
                  <Icon className="w-[19px] h-[19px]" />
                </span>
                <span
                  className={`text-[11px] font-semibold tracking-tight whitespace-nowrap transition-colors duration-150 ${
                    isActive
                      ? 'text-[var(--tm-nav-active-text)]'
                      : 'text-[var(--tm-text-muted)] group-hover:text-[var(--tm-text-primary)]'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
