import { useEffect, useState } from 'react';
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
import { formatShortTime, PAGE_LABELS } from './utils/formatters';

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
          update(previous => ({ ...previous, dismissedUpdatePrompt: previous.appUpdate.promptToken }));
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
  saveLimitsPrefs,
  saveDisplayPrefs,
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
    hubProfiles,
    activeHubProfileId,
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
  const [reportWindowOpen, setReportWindowOpen] = useState(false);
  const [reportWindowTab, setReportWindowTab] = useState<ReportWindowTab>('ai');
  const [inputFocused, setInputFocused] = useState(false);

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

  useEffect(() => {
    if (!revealAppUpdate || page !== 'settings') return;
    document.getElementById('app-update')?.scrollIntoView({ block: 'start' });
    setRevealAppUpdate(false);
  }, [page, revealAppUpdate]);

  const nowTick = Date.now();
  const selected = MonitorModel.select(stats, device, period, nowTick);

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
      !stats ||
      !foreground ||
      document.hidden ||
      !['overview', 'sessions', 'sessionDetail'].includes(page)
    )
      return;
    const now = Date.now();
    const detail =
      page === 'sessionDetail'
        ? MonitorModel.sessionDetail(stats, detailKey, { deviceId: device, period, now })
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
        stats,
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
      Math.max(1, nearest - now)
    );
    return () => clearTimeout(timer);
  }, [
    stats,
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
    if (window.HubNative?.refresh) {
      window.HubNative.refresh();
      return;
    }
    if (isBrowserPreview) {
      update((previous) => receiveNativeMessage(previous, { type: 'status', state: 'loading' }));
      window.setTimeout(() => {
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

  const handleConnect = (url: string, secret: string, allowHttpChecked: boolean) => {
    if (!window.HubNative?.connect) {
      loadBrowserDemo(url, allowHttpChecked);
      return;
    }
    update((previous) => ({ ...previous, connectPending: true, formError: '' }));
    window.HubNative.connect(url, secret, allowHttpChecked);
  };

  const handleSelectHubProfile = (id: string) => {
    if (window.HubNative?.selectHubProfile) {
      update((previous) => ({ ...previous, connectPending: true, formError: '' }));
      window.HubNative.selectHubProfile(id);
      return;
    }
    const target = hubProfiles.find((profile) => profile.id === id);
    if (target) loadBrowserDemo(target.url, target.allowHttp);
  };

  const handleAddHubProfile = (name: string, url: string, secret: string, allowHttpChecked: boolean) => {
    if (window.HubNative?.addHubProfile) {
      update((previous) => ({ ...previous, connectPending: true, formError: '' }));
      window.HubNative.addHubProfile(name, url, secret, allowHttpChecked);
      return;
    }
    const nextId = `demo-${Date.now().toString(36)}`;
    const nextProfile = { id: nextId, name: name.trim() || url, url, allowHttp: allowHttpChecked };
    update((previous) => ({
      ...previous,
      hubProfiles: [...previous.hubProfiles, nextProfile],
      activeHubProfileId: nextId,
    }));
    loadBrowserDemo(url, allowHttpChecked);
  };

  const handleSaveHubProfile = (id: string, name: string, url: string, secret: string, allowHttpChecked: boolean) => {
    if (window.HubNative?.saveHubProfile) {
      update((previous) => ({ ...previous, connectPending: true, formError: '' }));
      window.HubNative.saveHubProfile(id, name, url, secret, allowHttpChecked);
      return;
    }
    update((previous) => ({
      ...previous,
      hubProfiles: previous.hubProfiles.map((profile) =>
        profile.id === id ? { ...profile, name: name.trim() || url, url, allowHttp: allowHttpChecked } : profile),
      activeHubProfileId: id,
    }));
    loadBrowserDemo(url, allowHttpChecked);
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
    update((previous) => receiveNativeMessage(previous, {
      type: 'connection',
      url: '',
      activeHubProfileId: '',
      hubProfiles: previous.hubProfiles,
    }));
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
        })
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
        })
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
        })
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
        })
      );
    }
  };

  const handleSimulateUpdateCheck = () => {
    update((previous) =>
      receiveNativeMessage(previous, {
        type: 'appUpdate',
        ...previous.appUpdate,
        checking: true,
      })
    );
    window.setTimeout(() => {
      update((previous) =>
        receiveNativeMessage(previous, {
          type: 'appUpdate',
          ...previous.appUpdate,
          checking: false,
          checkedAt: Date.now(),
          currentVersion: previous.appUpdate.currentVersion || '1.0.8',
          latestVersion: '1.0.8',
          available: false,
        })
      );
    }, 300);
  };

  const handleSimulateAutoUpdateToggle = (enabled: boolean) => {
    update((previous) =>
      receiveNativeMessage(previous, {
        type: 'appUpdate',
        ...previous.appUpdate,
        automatic: enabled,
      })
    );
  };

  const handleToggleSessionAccordion = (encodedKey: string) =>
    setOpenSessions((previous) => {
      const next = new Set(previous);
      if (next.has(encodedKey)) next.delete(encodedKey);
      else next.add(encodedKey);
      return next;
    });

  const showFilters =
    page !== 'settings' &&
    page !== 'devices' &&
    page !== 'sessionDetail' &&
    page !== 'reports' &&
    !(page === 'limits' && quotaTab === 'subscriptions');

  useEffect(() => {
    if (!showFilters && devicePickerOpen) setDevicePickerOpen(false);
  }, [showFilters, devicePickerOpen]);

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
      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
      : status === 'loading'
      ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse'
      : status === 'offline'
      ? 'bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]'
      : 'bg-slate-400';

  const devicesList = stats?.devices || [];
  const activeDevicesCount = devicesList.filter((d) => !d.stale).length;
  const selectedDeviceObj = device ? devicesList.find((d) => d.deviceId === device) || null : null;
  const isSelectedDeviceRemoved = Boolean(device) && !selectedDeviceObj;

  return (
    <div className="min-h-screen bg-[#090C10] text-slate-100 relative overflow-x-clip flex flex-col">
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 h-72 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(56,189,248,0.15),transparent)] z-0"
      />

      <header className="sticky top-0 z-30 w-full tm-chrome-bar border-b border-white/[0.08]">
        <div className="max-w-[460px] mx-auto min-h-14 py-1 px-3.5 sm:px-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setPage('overview')}
            className="min-w-0 flex items-center gap-2 text-left rounded-xl px-1 -ml-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 min-h-[44px] active:scale-[0.98] transition-transform group"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400/25 to-emerald-400/15 border border-sky-400/35 flex items-center justify-center text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.20)] group-hover:border-sky-400/50 transition-colors shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-white truncate">
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
                className="min-h-[44px] px-2.5 py-1.5 rounded-full glass-pill-bar hover:border-sky-400/40 active:scale-[0.97] inline-flex items-center gap-1 text-xs font-semibold text-sky-200 transition-all whitespace-nowrap shrink-0"
              >
                <FileText className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                <span>报告</span>
              </button>
            )}

            <button
              id="connection-button"
              type="button"
              onClick={() => setPage('settings')}
              aria-label="连接设置"
              className="min-h-[44px] px-2.5 sm:px-3 py-1.5 rounded-full glass-pill-bar hover:border-white/25 active:scale-[0.97] flex items-center gap-1.5 text-xs font-medium text-slate-200 transition-all whitespace-nowrap shrink-0"
            >
              <i id="status-dot" className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor}`} />
              <span id="status-label">{statusLabel}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="w-full max-w-[460px] mx-auto flex-1 flex flex-col relative z-10">
        <main className="flex-1 px-4 pt-3 pb-24">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p
                id="eyebrow"
                className="text-[11px] font-medium tracking-wide text-sky-400 mb-0.5 truncate"
              >
                {page === 'settings'
                  ? '多设备同步与安全凭据'
                  : page === 'reports'
                    ? '智能分析 · 周期报告专区'
                    : 'AI 遥测与额度监控'}
              </p>
              <h1 id="page-title" className="text-[22px] sm:text-2xl leading-tight font-bold tracking-tight text-white">
                {PAGE_LABELS[page]}
              </h1>
            </div>

            {showRefresh && (
              <button
                id="refresh"
                type="button"
                disabled={status === 'loading'}
                onClick={handleRefresh}
                aria-label="刷新数据"
                className="w-11 h-11 rounded-full glass-pill-bar hover:border-white/25 active:scale-95 flex items-center justify-center text-slate-300 hover:text-white transition-all disabled:opacity-45 shrink-0"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    status === 'loading' ? 'animate-spin text-sky-400' : ''
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
                    className="min-h-[36px] px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-xs font-semibold text-white active:scale-[0.97] transition-all whitespace-nowrap"
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
                      className="min-h-[44px] px-3 rounded-xl bg-sky-400/20 hover:bg-sky-400/28 border border-sky-400/35 text-xs font-semibold text-sky-100 active:scale-[0.97] transition-all whitespace-nowrap"
                    >
                      查看更新
                    </button>
                    <button
                      type="button"
                      aria-label="稍后更新"
                      className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-sky-200 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all"
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

          {showFilters && (
            <div id="filters" className="mb-3 space-y-2">
              {showPeriods && (
                <SegmentedControl<PeriodId>
                  id="periods"
                  ariaLabel="统计周期"
                  value={period}
                  onChange={(pId) => {
                    setPeriod(pId);
                    setOpenSessions(new Set());
                  }}
                  options={[
                    { value: 'today', label: '今日', dataAttrs: { 'data-period': 'today' } },
                    { value: 'month', label: '本月', dataAttrs: { 'data-period': 'month' } },
                    { value: 'allTime', label: '累计', dataAttrs: { 'data-period': 'allTime' } },
                  ]}
                />
              )}

              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    id="device-picker-trigger"
                    type="button"
                    aria-label="选择统计设备"
                    aria-haspopup="dialog"
                    aria-expanded={devicePickerOpen}
                    onClick={() => setDevicePickerOpen(true)}
                    className={`min-h-[44px] px-3 py-1.5 rounded-full glass-pill-bar hover:border-white/25 active:scale-[0.98] inline-flex items-center gap-2 text-xs font-medium max-w-full min-w-0 transition-all ${
                      isSelectedDeviceRemoved
                        ? 'border-amber-400/45 text-amber-200'
                        : 'text-slate-200'
                    }`}
                  >
                    {selectedDeviceObj ? (
                      <>
                        <DeviceIcon
                          kind={selectedDeviceObj.deviceKind}
                          className="w-3.5 h-3.5 text-sky-400 shrink-0"
                        />
                        <i
                          aria-hidden="true"
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            selectedDeviceObj.stale ? 'bg-amber-400' : 'bg-emerald-400'
                          }`}
                        />
                        <span className="truncate">
                          {selectedDeviceObj.hostname || selectedDeviceObj.deviceId}
                        </span>
                      </>
                    ) : isSelectedDeviceRemoved ? (
                      <>
                        <Laptop className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">所选设备已移除</span>
                      </>
                    ) : (
                      <>
                        <Server className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span className="truncate">全部设备</span>
                        {devicesList.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-white/[0.07] text-[11px] tabular-nums text-slate-300 shrink-0">
                            {activeDevicesCount}/{devicesList.length}
                          </span>
                        )}
                      </>
                    )}
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>

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
                  className={`text-[11px] tabular-nums shrink-0 ${
                    status === 'offline' ? 'text-amber-300' : 'text-slate-400'
                  }`}
                >
                  {fetchedAt
                    ? `${new Date(fetchedAt).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })} 更新`
                    : '等待数据'}
                </span>
              </div>
            </div>
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
              ]}
            />
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
              hubProfiles={hubProfiles}
              activeHubProfileId={activeHubProfileId}
              connectPending={connectPending}
              formError={formError}
              displayPrefs={state.displayPrefs}
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
                    : '打开下方「连接」，输入电脑端的 Hub 地址和 secret。'
                }
                action={
                  !connection ? (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setPage('settings')}
                        className="w-full min-h-[44px] rounded-2xl bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950 font-bold text-xs active:scale-[0.985] transition-transform"
                      >
                        前往配置 Hub 连接
                      </button>
                      {isBrowserPreview && (
                        <button
                          type="button"
                          onClick={() => loadBrowserDemo()}
                          className="w-full min-h-[44px] rounded-2xl glass-inset hover:border-sky-400/35 text-sky-300 font-semibold text-xs active:scale-[0.985] transition-all"
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
                  stats={stats}
                  selected={selected}
                  period={period}
                  deviceId={device}
                  breakdownKind={breakdownKind}
                  onBreakdownChange={setBreakdownKind}
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
                  prefs={state.limitsPrefs}
                  limitAccountPresentation={state.limitAccountPresentation}
                  onChangePrefs={saveLimitsPrefs}
                />
              )}

              {page === 'sessions' && (
                <SessionsView
                  stats={stats}
                  selected={selected}
                  period={period}
                  deviceId={device}
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
                  stats={stats}
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
          stats={stats}
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
        aria-hidden={inputFocused || undefined}
        className={`bottom-nav fixed bottom-0 inset-x-0 z-40 tm-chrome-bar border-t border-white/[0.08] transition-all duration-150 ${
          inputFocused ? 'opacity-0 pointer-events-none translate-y-full' : ''
        }`}
      >
        <div className="max-w-[460px] mx-auto px-2 py-1 grid grid-cols-5 gap-1">
          {(
            [
              ['overview', '总览', LayoutGrid],
              ['devices', '设备', Server],
              ['limits', '额度', Clock],
              ['sessions', '会话', MessageSquare],
              ['settings', '连接', Settings],
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
                tabIndex={inputFocused ? -1 : undefined}
                onClick={() => setPage(tabId)}
                className={`relative min-h-[50px] rounded-2xl flex flex-col items-center justify-center gap-1 border transition-all duration-150 active:scale-[0.96] ${
                  isActive
                    ? 'text-sky-300 bg-sky-400/12 border-sky-400/20'
                    : 'text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.85)]"
                  />
                )}
                <Icon
                  className={`w-[19px] h-[19px] transition-transform duration-150 ${
                    isActive ? 'text-sky-300' : ''
                  }`}
                />
                <span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
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
