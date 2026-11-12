import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Clock,
  Download,
  LayoutGrid,
  Laptop,
  MessageSquare,
  RefreshCw,
  Server,
  Settings,
  X,
} from 'lucide-react';
import { CompletionSettingsCard } from './components/CompletionSettingsCard';
import { AppUpdateDialog } from './components/AppUpdateDialog';
import { DeviceIcon } from './components/DeviceIcon';
import { DevicePickerDialog } from './components/DevicePickerDialog';
import { DevicesView } from './components/DevicesView';
import { LimitsView } from './components/LimitsView';
import { OverviewView } from './components/OverviewView';
import { SessionDetailView } from './components/SessionDetailView';
import { SessionsView } from './components/SessionsView';
import { SettingsView } from './components/SettingsView';
import { useNativeMonitor } from './hooks/useNativeMonitor';
import { MonitorModel } from './model/monitorModel';
import { receiveNativeMessage } from './nativeState';
import type {
  BreakdownKind,
  PageId,
  PeriodId,
  QuotaTabId,
  ConnectionStatus,
} from './types/monitor';
import { formatShortTime, PAGE_LABELS } from './utils/formatters';

type Monitor = ReturnType<typeof useNativeMonitor>;

export default function App() {
  const monitor = useNativeMonitor();
  const { state, update } = monitor;
  const showUpdate = state.foreground && state.appUpdate.available && Boolean(state.appUpdate.promptToken)
    && state.dismissedUpdatePrompt !== state.appUpdate.promptToken && state.appUpdate.download.phase !== 'installing';
  return <>
    <Dashboard key={state.connectionEpoch} {...monitor} />
    <AppUpdateDialog state={state.appUpdate} open={showUpdate}
      onDismiss={() => {
        update(previous => ({ ...previous, dismissedUpdatePrompt: previous.appUpdate.promptToken }));
        window.HubNative?.dismissAppUpdatePrompt?.();
      }} />
  </>;
}

function Dashboard({ state, update, isBrowserPreview, loadBrowserDemo, queryConversation, clearConversation }: Monitor) {
  const {
    page,
    period,
    device,
    stats,
    subscriptions,
    subscriptionError,
    connection,
    allowHttp,
    status,
    message,
    fetchedAt,
    foreground,
    statusHealthy,
    detailKey,
    notifications,
    monitorPending,
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

  useEffect(() => {
    if (!revealAppUpdate || page !== 'settings') return;
    document.getElementById('app-update')?.scrollIntoView({ block: 'start' });
    setRevealAppUpdate(false);
  }, [page, revealAppUpdate]);

  const nowTick = Date.now();
  const selected = MonitorModel.select(stats, device, period, nowTick);

  const setPage = (next: PageId) => {
    setDevicePickerOpen(false);
    update((previous) => ({ ...previous, page: next }));
    setOpenSessions(new Set());
    setSessionLimit(40);
    if (next === 'limits' && quotaTab === 'subscriptions') {
      window.HubNative?.subscriptions?.();
    }
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

  const handleDisconnect = () => {
    if (window.HubNative?.disconnect) {
      window.HubNative.disconnect();
      return;
    }
    update((previous) => receiveNativeMessage(previous, { type: 'connection', url: '' }));
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
    !(page === 'limits' && quotaTab === 'subscriptions');

  const showPeriods = page !== 'limits';
  const showRefresh = Boolean(connection) && page !== 'settings';
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
      : 'bg-slate-500';

  const devicesList = stats?.devices || [];
  const activeDevicesCount = devicesList.filter((d) => !d.stale).length;
  const selectedDeviceObj = device ? devicesList.find((d) => d.deviceId === device) || null : null;
  const isSelectedDeviceRemoved = Boolean(device) && !selectedDeviceObj;

  return (
    <div className="min-h-screen bg-[#090C10] text-slate-100 relative overflow-x-hidden">
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 h-80 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(56,189,248,0.16),transparent)] z-0"
      />

      <div className="max-w-[440px] mx-auto min-h-screen flex flex-col relative z-10">
        <header className="sticky top-0 z-30 h-14 px-4 flex items-center justify-between gap-4 bg-[#090C10]/85 backdrop-blur-2xl border-b border-white/[0.08]">
          <button
            type="button"
            onClick={() => setPage('overview')}
            className="flex items-center gap-2.5 text-left rounded-xl px-1 -ml-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 min-h-[44px] shrink-0 group"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400/25 to-emerald-400/15 border border-sky-400/35 flex items-center justify-center text-sky-300 shadow-[0_0_18px_rgba(56,189,248,0.22)] group-hover:border-sky-400/50 transition-colors">
              <Activity className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-white whitespace-nowrap">
              Token Monitor
            </span>
          </button>

          <button
            id="connection-button"
            type="button"
            onClick={() => setPage('settings')}
            aria-label="连接设置"
            className="min-h-[40px] px-3.5 py-1.5 rounded-full glass-pill-bar hover:border-white/25 flex items-center gap-2 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <i id="status-dot" className={`w-2 h-2 rounded-full ${statusDotColor}`} />
            <span id="status-label">{statusLabel}</span>
          </button>
        </header>

        <main className="flex-1 px-4 pt-4 pb-24">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p
                id="eyebrow"
                className="text-[11px] font-medium tracking-wide text-sky-400 mb-0.5"
              >
                {page === 'settings' ? '多设备同步与安全凭据' : 'AI 遥测与额度监控'}
              </p>
              <h1 id="page-title" className="text-2xl font-bold tracking-tight text-white">
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
                className="w-11 h-11 rounded-full glass-pill-bar hover:border-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-all disabled:opacity-45 shrink-0"
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
            <div
              id="notice"
              role="status"
              aria-live="polite"
              className="mb-3.5 rounded-2xl bg-amber-500/12 border border-amber-400/30 p-3.5 text-xs text-amber-200 flex items-start gap-2.5 leading-relaxed"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{noticeText}</span>
            </div>
          )}

          {state.appUpdate.available &&
            state.dismissedUpdateVersion !== state.appUpdate.latestVersion && (
              <div
                id="app-update-banner"
                role="status"
                className="mb-3.5 rounded-2xl border border-sky-400/30 bg-sky-400/10 p-3 flex flex-wrap items-center gap-2 text-xs text-sky-200"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span className="flex-1 min-w-0">
                  发现新版本 {state.appUpdate.latestVersion}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPage('settings');
                    setRevealAppUpdate(true);
                  }}
                  className="min-h-[40px] px-2.5 font-semibold text-sky-200 hover:text-white transition-colors"
                >
                  查看更新
                </button>
                <button
                  type="button"
                  aria-label="稍后更新"
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center text-sky-300 hover:text-white transition-colors"
                  onClick={() =>
                    update((previous) => ({
                      ...previous,
                      dismissedUpdateVersion: previous.appUpdate.latestVersion,
                    }))
                  }
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

          {showFilters && (
            <div id="filters" className="mb-3.5 space-y-2.5">
              {showPeriods && (
                <div
                  id="periods"
                  aria-label="统计周期"
                  className="glass-inset p-1 rounded-2xl flex gap-1"
                >
                  {(
                    [
                      ['today', '今日'],
                      ['month', '本月'],
                      ['allTime', '累计'],
                    ] as Array<[PeriodId, string]>
                  ).map(([pId, label]) => {
                    const active = period === pId;
                    return (
                      <button
                        key={pId}
                        type="button"
                        data-period={pId}
                        aria-pressed={active}
                        onClick={() => {
                          setPeriod(pId);
                          setOpenSessions(new Set());
                        }}
                        className={`flex-1 min-h-[40px] rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-slate-800/95 text-white shadow-sm border border-white/10'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="inline-flex items-center gap-2 min-w-0">
                  <button
                    id="device-picker-trigger"
                    type="button"
                    aria-label="选择统计设备"
                    aria-haspopup="dialog"
                    aria-expanded={devicePickerOpen}
                    onClick={() => setDevicePickerOpen(true)}
                    className={`min-h-[40px] pl-3 pr-3 py-1.5 rounded-full glass-pill-bar hover:border-white/25 inline-flex items-center gap-2 text-xs font-medium max-w-[min(240px,62vw)] transition-colors ${
                      isSelectedDeviceRemoved
                        ? 'border-amber-400/40 text-amber-200'
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
                          <span className="px-1.5 py-0.2 rounded-full bg-white/[0.06] text-[10px] font-mono-tabular text-slate-300 shrink-0">
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
                  className="text-[11px] font-mono-tabular text-slate-400 shrink-0"
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
            <div id="quota-tabs" className="glass-inset p-1 rounded-2xl flex gap-1 mb-3.5">
              {(
                [
                  ['limits', '账户额度'],
                  ['subscriptions', '共享订阅'],
                ] as Array<[QuotaTabId, string]>
              ).map(([qId, label]) => {
                const active = quotaTab === qId;
                return (
                  <button
                    key={qId}
                    type="button"
                    data-quota={qId}
                    aria-pressed={active}
                    onClick={() => {
                      setQuotaTab(qId);
                      if (qId === 'subscriptions') {
                        window.HubNative?.subscriptions?.();
                      }
                    }}
                    className={`flex-1 min-h-[40px] rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-slate-800/95 text-white shadow-sm border border-white/10'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {page === 'sessions' && (
            <div id="session-tools">
              <CompletionSettingsCard
                notifications={notifications}
                monitorPending={monitorPending}
                connected={Boolean(connection)}
                compact={true}
                onToggleMonitor={handleToggleMonitor}
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
              connectPending={connectPending}
              formError={formError}
              notifications={notifications}
              monitorPending={monitorPending}
              isBrowserPreview={isBrowserPreview}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onLoadDemo={() => loadBrowserDemo()}
              onToggleMonitor={handleToggleMonitor}
              onTestNotification={handleTestNotification}
              onOpenSystemSettings={handleOpenNotificationSettings}
              onSimulateUpdateCheck={isBrowserPreview ? handleSimulateUpdateCheck : undefined}
              onSimulateAutoUpdateToggle={
                isBrowserPreview ? handleSimulateAutoUpdateToggle : undefined
              }
            />
          ) : !stats ? (
            <div id="content" className="glass-panel rounded-3xl p-8 text-center my-4 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/12 border border-sky-400/25 flex items-center justify-center text-sky-300 mx-auto">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-100 mb-1">
                  {connection ? '等待 Hub 数据' : '连接你的 Hub'}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {connection
                    ? '连接成功后，用量、设备和额度将在这里显示。'
                    : '打开下方「连接」，输入电脑端的 Hub 地址和 secret。'}
                </p>
              </div>
              {!connection && (
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setPage('settings')}
                    className="w-full min-h-[44px] rounded-2xl bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950 font-bold text-xs"
                  >
                    前往配置 Hub 连接
                  </button>
                  {isBrowserPreview && (
                    <button
                      type="button"
                      onClick={() => loadBrowserDemo()}
                      className="w-full min-h-[44px] rounded-2xl glass-inset hover:border-sky-400/30 text-sky-300 font-semibold text-xs transition-colors"
                    >
                      加载演示数据 (Web 预览)
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div id="content">
              {page === 'overview' && (
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
                  onSelectToolSessions={(toolId) => {
                    setSearch('');
                    setPage('sessions');
                    setSessionTool(toolId);
                  }}
                />
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

        <nav
          aria-label="主导航"
          className="bottom-nav fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[440px] z-40 bg-[#090C10]/88 backdrop-blur-2xl border-t border-white/[0.08] px-2 py-1.5"
        >
          <div className="grid grid-cols-5 gap-1">
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
                page === tabId || (page === 'sessionDetail' && tabId === 'sessions');
              return (
                <button
                  key={tabId}
                  type="button"
                  data-page={tabId}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setPage(tabId)}
                  className={`min-h-[48px] rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-150 ${
                    isActive
                      ? 'text-sky-300 bg-sky-400/12'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon
                    className={`w-[19px] h-[19px] transition-transform duration-150 ${
                      isActive ? '-translate-y-0.5 text-sky-300' : ''
                    }`}
                  />
                  <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
