import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileUp,
  HelpCircle,
  Link2,
  Pencil,
  Play,
  Plus,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  ApprovalsState,
  CaCertDraftState,
  DisplayPrefs,
  NotificationState,
  AppUpdateState,
  HubProfile,
  MonitorStats,
} from '../types/monitor';
import { CompletionSettingsCard } from './CompletionSettingsCard';
import { AppUpdateCard } from './AppUpdateCard';
import { ThemeStudioCard } from './ThemeStudioCard';
import { WidgetGalleryCard } from './WidgetGalleryCard';
import { CopyButton, InlineAlert, SectionHeader, ToggleSwitch } from './ui/Primitives';

function isPrivateOrLoopbackHttpUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return true;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return true;
  }
  if (parsed.protocol !== 'http:') return true;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1') {
    return true;
  }
  if (host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) {
    return true;
  }
  const rfc172 = /^172\.(\d+)\./.exec(host);
  if (rfc172 && Number(rfc172[1]) >= 16 && Number(rfc172[1]) <= 31) return true;
  const cgnat = /^100\.(\d+)\./.exec(host);
  if (cgnat && Number(cgnat[1]) >= 64 && Number(cgnat[1]) <= 127) return true;
  if (host.includes(':') && (host.startsWith('fc') || host.startsWith('fd') || /^fe[89ab]/.test(host))) {
    return true;
  }
  return false;
}

function formatFingerprintShort(sha256: string | undefined): string {
  if (!sha256) return '';
  const clean = sha256.trim().toUpperCase();
  if (clean.length < 16) return clean;
  const pairs = clean.match(/.{1,2}/g) || [];
  if (pairs.length <= 12) return pairs.join(':');
  return `${pairs.slice(0, 6).join(':')}…${pairs.slice(-4).join(':')}`;
}

function formatCertDate(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return '未知';
  try {
    return new Date(ms).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return '未知';
  }
}

interface SettingsViewProps {
  appUpdate: AppUpdateState;
  stats?: MonitorStats | null;
  fetchedAt?: number;
  connectionUrl: string;
  allowHttpInitial: boolean;
  hasCustomCaInitial?: boolean;
  hubProfiles?: HubProfile[];
  activeHubProfileId?: string;
  caDraft?: CaCertDraftState | null;
  connectPending: boolean;
  formError: string;
  displayPrefs?: DisplayPrefs;
  systemDark?: boolean;
  onChangeDisplayPrefs?: (next: DisplayPrefs) => void;
  notifications: NotificationState;
  monitorPending: boolean;
  approvals: ApprovalsState;
  approvalsPending: boolean;
  isBrowserPreview?: boolean;
  onConnect: (url: string, secret: string, allowHttp: boolean, caDraftToken?: string) => void;
  onSelectHubProfile?: (id: string) => void;
  onAddHubProfile?: (name: string, url: string, secret: string, allowHttp: boolean, caDraftToken?: string) => void;
  onSaveHubProfile?: (
    id: string,
    name: string,
    url: string,
    secret: string,
    allowHttp: boolean,
    caMode?: 'keep' | 'replace' | 'clear',
    caDraftToken?: string,
  ) => void;
  onDeleteHubProfile?: (id: string) => void;
  onPickCaCertificate?: () => void;
  onValidateCaPem?: (pem: string) => void;
  onClearCaDraft?: () => void;
  onDisconnect: () => void;
  onLoadDemo?: () => void;
  onToggleMonitor: (enabled: boolean) => void;
  onToggleApprovalAlerts: (enabled: boolean) => void;
  onTestNotification: () => void;
  onOpenSystemSettings: () => void;
  onSimulateUpdateCheck?: () => void;
  onSimulateAutoUpdateToggle?: (enabled: boolean) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  appUpdate,
  stats,
  fetchedAt,
  connectionUrl,
  allowHttpInitial,
  hasCustomCaInitial = false,
  hubProfiles = [],
  activeHubProfileId = '',
  caDraft = null,
  connectPending,
  formError,
  displayPrefs = { separateQoderClients: false, exactTrendTokens: false, theme: 'obsidian' },
  systemDark = true,
  onChangeDisplayPrefs,
  notifications,
  monitorPending,
  approvals,
  approvalsPending,
  isBrowserPreview,
  onConnect,
  onSelectHubProfile,
  onAddHubProfile,
  onSaveHubProfile,
  onDeleteHubProfile,
  onPickCaCertificate,
  onValidateCaPem,
  onClearCaDraft,
  onDisconnect,
  onLoadDemo,
  onToggleMonitor,
  onToggleApprovalAlerts,
  onTestNotification,
  onOpenSystemSettings,
  onSimulateUpdateCheck,
  onSimulateAutoUpdateToggle,
}) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [formMode, setFormMode] = useState<'connect' | 'add' | 'edit'>('connect');
  const [editingProfileId, setEditingProfileId] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState(connectionUrl);
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [allowHttp, setAllowHttp] = useState(allowHttpInitial);
  const [caSectionOpen, setCaSectionOpen] = useState(false);
  const [caClearRequested, setCaClearRequested] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pemInput, setPemInput] = useState('');

  useEffect(() => {
    setConfirmDisconnect(false);
  }, [connectionUrl]);

  // Clear pasted PEM immediately once native accepts it so raw cert text never lingers in DOM state.
  useEffect(() => {
    if (caDraft?.draftToken && caDraft.cert) {
      setPemInput('');
      setPasteMode(false);
      setCaClearRequested(false);
      setCaSectionOpen(true);
    }
  }, [caDraft?.draftToken, caDraft?.cert]);

  const activeProfile = activeHubProfileId
    ? hubProfiles.find((profile) => profile.id === activeHubProfileId) || null
    : null;

  const editingProfile =
    formMode === 'edit'
      ? hubProfiles.find((profile) => profile.id === editingProfileId) || null
      : null;

  // Collapse the raw connection form when already connected to a saved profile
  // so users edit the active profile (preserving its custom CA) or explicitly add a new one.
  const showConnectionForm =
    !connectionUrl ||
    !activeProfile ||
    formMode === 'add' ||
    formMode === 'edit';

  const trimmedUrl = url.trim();
  const isHttpScheme = trimmedUrl.toLowerCase().startsWith('http://');
  const showCaSection = !isHttpScheme;
  const effectiveEditCaMode: 'keep' | 'replace' | 'clear' =
    isHttpScheme && editingProfile?.hasCustomCa
      ? 'clear'
      : caDraft?.draftToken
        ? 'replace'
        : caClearRequested
          ? 'clear'
          : 'keep';
  const caChanged = Boolean(
    editingProfile &&
      ((effectiveEditCaMode === 'clear' && editingProfile.hasCustomCa) ||
        (effectiveEditCaMode === 'replace' &&
          Boolean(caDraft?.draftToken) &&
          caDraft?.cert?.sha256 !== editingProfile.caFingerprint)),
  );
  const destinationChanged = Boolean(
    editingProfile && (trimmedUrl !== editingProfile.url || allowHttp !== editingProfile.allowHttp || caChanged),
  );
  const secretRequired = !editingProfile || destinationChanged;
  const publicHttpWarning = allowHttp && isHttpScheme && !isPrivateOrLoopbackHttpUrl(trimmedUrl);

  const startAddProfile = () => {
    onClearCaDraft?.();
    setFormMode('add');
    setEditingProfileId('');
    setConfirmDeleteId('');
    setConfirmDisconnect(false);
    setName('');
    setUrl('');
    setSecret('');
    setAllowHttp(false);
    setCaClearRequested(false);
    setCaSectionOpen(false);
    setPasteMode(false);
    setPemInput('');
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const startEditProfile = (profile: HubProfile) => {
    onClearCaDraft?.();
    setFormMode('edit');
    setEditingProfileId(profile.id);
    setConfirmDeleteId('');
    setConfirmDisconnect(false);
    setName(profile.name);
    setUrl(profile.url);
    setSecret('');
    setAllowHttp(profile.allowHttp);
    setCaClearRequested(false);
    setCaSectionOpen(Boolean(profile.hasCustomCa));
    setPasteMode(false);
    setPemInput('');
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const cancelFormMode = () => {
    onClearCaDraft?.();
    setFormMode('connect');
    setEditingProfileId('');
    setName('');
    setUrl(connectionUrl);
    setSecret('');
    setAllowHttp(allowHttpInitial);
    setCaClearRequested(false);
    setCaSectionOpen(false);
    setPasteMode(false);
    setPemInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const draftToken = !isHttpScheme && caDraft?.draftToken ? caDraft.draftToken : '';
    if (formMode === 'edit' && editingProfile && onSaveHubProfile) {
      onSaveHubProfile(editingProfile.id, name.trim(), trimmedUrl, secret, allowHttp, effectiveEditCaMode, draftToken);
      return;
    }
    if (formMode === 'add' && onAddHubProfile) {
      onAddHubProfile(name.trim(), trimmedUrl, secret, allowHttp, draftToken);
      return;
    }
    onConnect(trimmedUrl, secret, allowHttp, draftToken);
  };

  const renderDisconnectControl = () =>
    connectionUrl ? (
      confirmDisconnect ? (
        <div className="rounded-2xl bg-[var(--tm-danger-soft-bg)] border border-[var(--tm-danger-soft-border)] p-3.5 space-y-2.5">
          <p className="text-xs text-[var(--tm-danger-text)] leading-relaxed">
            {hubProfiles.length > 0
              ? '确认断开当前 Hub 连接？已保存的 Hub 列表仍会保留，可随时重新切换连接。'
              : '确认断开连接并清除本机加密保存的 Hub 地址与共享密钥？清除后需重新输入凭据。'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirmDisconnect(false)}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.98] border border-[var(--tm-border-default)] text-xs font-medium text-[var(--tm-text-primary)] transition-all"
            >
              取消
            </button>
            <button
              id="disconnect"
              type="button"
              onClick={() => {
                setConfirmDisconnect(false);
                onDisconnect();
              }}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-[var(--tm-danger)] hover:brightness-105 active:scale-[0.98] text-xs font-semibold text-[var(--tm-text-inverse)] transition-all"
            >
              {hubProfiles.length > 0 ? '确认断开' : '确认清除并断开'}
            </button>
          </div>
        </div>
      ) : (
        <button
          id="disconnect"
          type="button"
          onClick={() => setConfirmDisconnect(true)}
          className="w-full min-h-[44px] rounded-2xl border border-[var(--tm-danger-soft-border)] bg-[var(--tm-danger-soft-bg)] hover:brightness-105 active:scale-[0.98] text-xs font-medium text-[var(--tm-danger-text)] transition-all text-center px-3"
        >
          {hubProfiles.length > 0 ? '断开当前连接（保留已保存列表）' : '断开连接并清除凭据'}
        </button>
      )
    ) : null;

  return (
    <div id="settings" className="space-y-4">
      {connectionUrl ? (
        <section className="glass-hero rounded-3xl px-4 py-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-2xl bg-[var(--tm-success-soft-bg)] border border-[var(--tm-success-soft-border)] flex items-center justify-center text-[var(--tm-success)] shrink-0">
                <Activity className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--tm-text-primary)] truncate">
                    <i aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[var(--tm-success)] shrink-0" />
                    <span className="truncate">{activeProfile?.name || '已连接 Hub'}</span>
                  </span>
                  {allowHttpInitial && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--tm-warning-soft-bg)] border border-[var(--tm-warning-soft-border)] text-[var(--tm-warning-text)] text-[11px] font-mono-tabular shrink-0">
                      HTTP
                    </span>
                  )}
                  {(hasCustomCaInitial || activeProfile?.hasCustomCa) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--tm-info-soft-bg)] border border-[var(--tm-info-soft-border)] text-[var(--tm-info-text)] text-[11px] font-medium shrink-0">
                      <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                      自定义 CA
                    </span>
                  )}
                </div>
                <p className="text-[11.5px] font-mono-tabular text-[var(--tm-text-secondary)] truncate mt-0.5">
                  {connectionUrl}
                </p>
              </div>
            </div>
            <CopyButton
              text={connectionUrl}
              ariaLabel="复制当前 Hub 地址"
              label="复制"
              copiedLabel="已复制"
            />
          </div>

          {activeProfile && !showConnectionForm && (
            <div className="pt-2.5 border-t border-[var(--tm-border-subtle)] space-y-2">
              {formError && (
                <InlineAlert id="form-error" tone="rose" role="alert">
                  {formError}
                </InlineAlert>
              )}
              <div className="flex flex-wrap gap-2">
                {onSaveHubProfile && (
                  <button
                    type="button"
                    disabled={connectPending}
                    onClick={() => startEditProfile(activeProfile)}
                    className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-border-default)] text-xs font-medium text-[var(--tm-text-primary)] inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>编辑当前连接</span>
                  </button>
                )}
                {onAddHubProfile && (
                  <button
                    type="button"
                    disabled={connectPending}
                    onClick={startAddProfile}
                    className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-xs font-semibold text-[var(--tm-accent-text)] inline-flex items-center justify-center gap-1.5 hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>新增 Hub</span>
                  </button>
                )}
              </div>
              {renderDisconnectControl()}
            </div>
          )}
        </section>
      ) : (
        <div className="text-center py-4 px-2">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3.5 glass-hero flex items-center justify-center text-[var(--tm-accent-text)]">
            <Activity className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-bold text-[var(--tm-text-primary)] tracking-tight">
            你的所有设备，一处查看。
          </h2>
          <p className="text-xs text-[var(--tm-text-muted)] leading-relaxed mt-1.5">
            连接已有 Hub，随时了解 AI 用量。
            <br />
            手机仅查看数据，不参与采集。
          </p>
        </div>
      )}

      {isBrowserPreview && onLoadDemo && (
        <section className="glass-panel rounded-3xl p-4 border-[var(--tm-border-accent)] flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[var(--tm-accent-text)]">Web 交互预览模式</p>
            <p className="text-[11.5px] text-[var(--tm-text-muted)] mt-0.5 leading-snug">
              当前在浏览器中运行，可加载完整多设备与子代理演示数据。
            </p>
          </div>
          <button
            type="button"
            onClick={onLoadDemo}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--tm-accent-soft-bg)] hover:brightness-105 active:scale-[0.98] border border-[var(--tm-accent-soft-border)] text-xs font-semibold text-[var(--tm-accent-text)] flex items-center gap-1.5 shrink-0 transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            <span>加载演示数据</span>
          </button>
        </section>
      )}

      {/* Theme Studio surfaced near the top for instant discovery */}
      {onChangeDisplayPrefs && (
        <ThemeStudioCard
          themePreference={displayPrefs.theme}
          systemDark={systemDark}
          onSelectTheme={(theme) => onChangeDisplayPrefs({ ...displayPrefs, theme })}
        />
      )}

      {hubProfiles.length > 0 && (
        <section id="saved-hubs" className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5">
          <SectionHeader
            headingLevel="h2"
            icon={<Server className="w-4 h-4" />}
            title="已保存的 Hub"
            badge={
              <span className="px-2 py-0.5 rounded-full bg-[var(--tm-bg-control)] text-[11px] font-mono-tabular text-[var(--tm-text-secondary)]">
                {hubProfiles.length}
              </span>
            }
            action={
              onAddHubProfile ? (
                <button
                  id="add-hub-profile"
                  type="button"
                  onClick={startAddProfile}
                  disabled={connectPending}
                  className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)] text-xs font-semibold hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>新增 Hub</span>
                </button>
              ) : undefined
            }
            className="pb-2 border-b border-[var(--tm-border-subtle)]"
          />

          <ul id="saved-hubs-list" className="space-y-2.5">
            {hubProfiles.map((profile) => {
              const isActive = profile.id === activeHubProfileId && Boolean(connectionUrl);
              const isEditing = formMode === 'edit' && editingProfileId === profile.id;
              const isConfirmDelete = confirmDeleteId === profile.id;
              return (
                <li
                  key={profile.id}
                  data-hub-profile-id={profile.id}
                  className={`rounded-2xl p-3.5 border transition-colors ${
                    isEditing
                      ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)]'
                      : isActive
                        ? 'bg-[var(--tm-success-soft-bg)] border-[var(--tm-success-soft-border)]'
                        : 'glass-inset border-[var(--tm-border-subtle)]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-[var(--tm-text-primary)] truncate">
                        {profile.name}
                      </span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--tm-success-soft-bg)] border border-[var(--tm-success-soft-border)] text-[var(--tm-success-text)] text-[11px] font-medium">
                          <Check className="w-3 h-3" aria-hidden="true" />
                          当前已连接
                        </span>
                      )}
                      {isEditing && (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--tm-accent-soft-bg)] text-[var(--tm-accent-text)] text-[11px] font-medium">
                          编辑中
                        </span>
                      )}
                      {profile.allowHttp && (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--tm-warning-soft-bg)] text-[var(--tm-warning-text)] text-[11px] font-mono-tabular">
                          HTTP
                        </span>
                      )}
                      {profile.hasCustomCa && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--tm-info-soft-bg)] text-[var(--tm-info-text)] text-[11px] font-medium">
                          <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                          自定义 CA
                        </span>
                      )}
                    </div>
                    <p className="text-[11.5px] font-mono-tabular text-[var(--tm-text-muted)] break-all mt-1">
                      {profile.url}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 mt-3 pt-2.5 border-t border-[var(--tm-border-subtle)]">
                    {!isActive && onSelectHubProfile && (
                      <button
                        type="button"
                        disabled={connectPending}
                        onClick={() => {
                          setConfirmDeleteId('');
                          onSelectHubProfile(profile.id);
                        }}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)] text-xs font-semibold hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        切换连接
                      </button>
                    )}
                    {onSaveHubProfile && (
                      <button
                        type="button"
                        disabled={connectPending}
                        onClick={() => startEditProfile(profile)}
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] text-[var(--tm-text-primary)] text-xs font-medium hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>编辑</span>
                      </button>
                    )}
                    {onDeleteHubProfile && (
                      <>
                        {isConfirmDelete && (
                          <button
                            type="button"
                            disabled={connectPending}
                            onClick={() => setConfirmDeleteId('')}
                            className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] text-xs font-medium active:scale-[0.98] transition-all disabled:opacity-50"
                          >
                            取消
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={connectPending}
                          onClick={() => {
                            if (!isConfirmDelete) {
                              setConfirmDeleteId(profile.id);
                              return;
                            }
                            setConfirmDeleteId('');
                            if (editingProfileId === profile.id) cancelFormMode();
                            onDeleteHubProfile(profile.id);
                          }}
                          className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-xl text-xs border transition-all active:scale-[0.98] disabled:opacity-50 ${
                            isConfirmDelete
                              ? 'bg-[var(--tm-danger)] border-transparent text-[var(--tm-text-inverse)] font-semibold'
                              : 'bg-[var(--tm-bg-control)] border-[var(--tm-border-default)] text-[var(--tm-danger-text)] hover:bg-[var(--tm-danger-soft-bg)]'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{isConfirmDelete ? '确认删除' : '删除'}</span>
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {showConnectionForm && (
        <form
          ref={formRef}
          id="connection-form"
          onSubmit={handleSubmit}
          className={`glass-panel rounded-3xl p-4 sm:p-5 space-y-4 transition-colors ${
            formMode === 'edit'
              ? 'border-[var(--tm-border-accent)]'
              : formMode === 'add'
                ? 'border-[var(--tm-success-soft-border)]'
                : ''
          }`}
        >
          <SectionHeader
            headingLevel="h2"
            icon={<Link2 className="w-4 h-4" />}
            title={
              formMode === 'edit' && editingProfile
                ? `编辑连接 · ${editingProfile.name}`
                : formMode === 'add'
                  ? '新增 Hub 连接'
                  : 'Hub 连接凭据'
            }
            action={
              formMode !== 'connect' ? (
                <button
                  type="button"
                  onClick={cancelFormMode}
                  className="inline-flex items-center gap-1 min-h-[40px] px-3 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-border-default)] text-xs font-medium text-[var(--tm-text-primary)] shrink-0 active:scale-[0.98] transition-all"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>取消</span>
                </button>
              ) : undefined
            }
            className="pb-2 border-b border-[var(--tm-border-subtle)]"
          />

          {formMode !== 'connect' && (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[var(--tm-text-secondary)] block">
                显示名称（可选）
              </span>
              <input
                id="hub-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：公司台式机 / 家里 Mac"
                maxLength={64}
                autoComplete="off"
                className="w-full min-h-[46px] px-3.5 py-2.5 rounded-2xl glass-inset text-sm text-[var(--tm-text-primary)] placeholder:text-[var(--tm-text-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)] focus-visible:border-[var(--tm-border-accent)] transition-colors"
              />
            </label>
          )}

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[var(--tm-text-secondary)] block">Hub 地址</span>
            <input
              id="hub-url"
              type="text"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://monitor.example.com"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-2xl glass-inset text-sm text-[var(--tm-text-primary)] placeholder:text-[var(--tm-text-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)] focus-visible:border-[var(--tm-border-accent)] font-mono-tabular transition-colors"
            />
          </label>

          <div className="space-y-1.5">
            <label htmlFor="hub-secret" className="text-xs font-medium text-[var(--tm-text-secondary)] block">
              共享密钥 (Shared secret)
            </label>
            <div className="relative flex items-center">
              <input
                id="hub-secret"
                type={showSecret ? 'text' : 'password'}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={
                  editingProfile
                    ? destinationChanged
                      ? '地址、协议或自定义 CA 已变更，请重新输入密钥'
                      : '留空将沿用当前保存的密钥'
                    : '输入 Hub 中配置的共享密钥'
                }
                required={secretRequired}
                autoComplete="new-password"
                spellCheck={false}
                className="w-full min-h-[46px] pl-3.5 pr-12 py-2.5 rounded-2xl glass-inset text-sm text-[var(--tm-text-primary)] placeholder:text-[var(--tm-text-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)] focus-visible:border-[var(--tm-border-accent)] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowSecret((prev) => !prev)}
                aria-label={showSecret ? '隐藏共享密钥' : '显示共享密钥'}
                aria-pressed={showSecret}
                className="w-11 h-11 flex items-center justify-center absolute right-0.5 text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)] active:scale-95 rounded-xl transition-all"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {editingProfile && (
              <p
                className={`text-[11.5px] leading-relaxed ${
                  destinationChanged ? 'text-[var(--tm-warning-text)]' : 'text-[var(--tm-text-muted)]'
                }`}
              >
                {destinationChanged
                  ? '检测到 Hub 地址、HTTP 选项或自定义 CA 证书已变更，出于安全校验需要重新填写共享密钥。'
                  : '留空将沿用本机加密保存的原密钥；仅在轮换 Hub 密钥时填写新值。'}
              </p>
            )}
          </div>

          {showCaSection && (
            <div id="ca-cert-section" className="rounded-2xl border border-[var(--tm-border-subtle)] bg-[var(--tm-bg-row)] overflow-hidden">
              <button
                id="ca-cert-toggle"
                type="button"
                onClick={() => setCaSectionOpen((prev) => !prev)}
                aria-expanded={caSectionOpen}
                className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-[var(--tm-bg-row-hover)] transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-[var(--tm-accent-text)] shrink-0" aria-hidden="true" />
                  <span className="text-xs font-semibold text-[var(--tm-text-primary)] truncate">
                    自签名 / 私有 CA 证书（可选）
                  </span>
                  {caDraft?.cert ? (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--tm-success-soft-bg)] text-[var(--tm-success-text)] text-[11px] font-medium shrink-0">
                      已载入待保存
                    </span>
                  ) : editingProfile?.hasCustomCa && !caClearRequested ? (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--tm-info-soft-bg)] text-[var(--tm-info-text)] text-[11px] font-medium shrink-0">
                      已配置
                    </span>
                  ) : caClearRequested ? (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--tm-warning-soft-bg)] text-[var(--tm-warning-text)] text-[11px] font-medium shrink-0">
                      保存后移除
                    </span>
                  ) : null}
                </span>
                {caSectionOpen ? (
                  <ChevronUp className="w-4 h-4 text-[var(--tm-text-muted)] shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[var(--tm-text-muted)] shrink-0" aria-hidden="true" />
                )}
              </button>

              {caSectionOpen && (
                <div className="px-3.5 pb-3.5 pt-2 space-y-3 border-t border-[var(--tm-border-subtle)]">
                  <p className="text-[11.5px] text-[var(--tm-text-muted)] leading-relaxed">
                    若 Hub 使用自签名或私有 CA 签发的 HTTPS 证书，可导入公钥 CA 证书（.pem / .crt / .der）。证书仅作用于当前连接并强制校验证书 SAN 域名/IP，绝不影响应用更新。
                  </p>

                  {caDraft?.cert ? (
                    <div className="rounded-xl bg-[var(--tm-success-soft-bg)] border border-[var(--tm-success-soft-border)] p-3 space-y-1.5 text-[11.5px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--tm-success-text)]">新证书已校验（待保存）</span>
                        <button
                          id="clear-ca-draft"
                          type="button"
                          onClick={() => onClearCaDraft?.()}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-danger-soft-bg)] border border-[var(--tm-border-default)] text-xs text-[var(--tm-danger-text)] font-medium transition-colors"
                        >
                          取消
                        </button>
                      </div>
                      {caDraft.cert.subject && (
                        <p className="text-[var(--tm-text-primary)] break-all">Subject: {caDraft.cert.subject}</p>
                      )}
                      {caDraft.cert.issuer && (
                        <p className="text-[var(--tm-text-muted)] break-all">Issuer: {caDraft.cert.issuer}</p>
                      )}
                      <p className="font-mono-tabular text-[var(--tm-accent-text)] break-all">
                        SHA-256: {formatFingerprintShort(caDraft.cert.sha256)}
                      </p>
                      <p className="text-[var(--tm-text-muted)]">
                        有效期至 {formatCertDate(caDraft.cert.notAfter)}
                        {caDraft.cert.certCount > 1 ? ` · 共 ${caDraft.cert.certCount} 个证书` : ''}
                      </p>
                    </div>
                  ) : editingProfile?.hasCustomCa && !caClearRequested ? (
                    <div className="rounded-xl glass-inset border border-[var(--tm-info-soft-border)] p-3 space-y-1.5 text-[11.5px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--tm-info-text)]">当前已绑定自定义 CA</span>
                        <button
                          id="clear-ca-cert"
                          type="button"
                          onClick={() => setCaClearRequested(true)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-danger-soft-bg)] border border-[var(--tm-border-default)] text-xs text-[var(--tm-danger-text)] font-medium transition-colors"
                        >
                          移除证书
                        </button>
                      </div>
                      {editingProfile.caSubject && (
                        <p className="text-[var(--tm-text-primary)] break-all">Subject: {editingProfile.caSubject}</p>
                      )}
                      {editingProfile.caFingerprint && (
                        <p className="font-mono-tabular text-[var(--tm-accent-text)] break-all">
                          SHA-256: {formatFingerprintShort(editingProfile.caFingerprint)}
                        </p>
                      )}
                      <p className="text-[var(--tm-text-muted)]">
                        有效期至 {formatCertDate(editingProfile.caNotAfter)}
                        {editingProfile.caNotAfter && editingProfile.caNotAfter < Date.now() ? '（已过期）' : ''}
                      </p>
                    </div>
                  ) : caClearRequested && editingProfile?.hasCustomCa ? (
                    <div className="rounded-xl bg-[var(--tm-warning-soft-bg)] border border-[var(--tm-warning-soft-border)] p-3 flex items-center justify-between gap-2 text-[11.5px] text-[var(--tm-warning-text)]">
                      <span>保存后将移除自定义 CA 并恢复系统默认根证书校验。</span>
                      <button
                        type="button"
                        onClick={() => setCaClearRequested(false)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] text-xs font-medium text-[var(--tm-text-primary)] shrink-0"
                      >
                        撤销
                      </button>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <button
                      id="pick-ca-cert"
                      type="button"
                      disabled={connectPending || Boolean(caDraft?.loading)}
                      onClick={() => onPickCaCertificate?.()}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)] text-xs font-semibold hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{caDraft?.loading ? '正在校验…' : '选择证书文件'}</span>
                    </button>
                    <button
                      id="toggle-paste-ca"
                      type="button"
                      disabled={connectPending || Boolean(caDraft?.loading)}
                      onClick={() => setPasteMode((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--tm-bg-control)] border border-[var(--tm-border-default)] text-[var(--tm-text-primary)] text-xs font-medium hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      <span>{pasteMode ? '收起粘贴框' : '粘贴 PEM 证书'}</span>
                    </button>
                  </div>

                  {pasteMode && (
                    <div className="space-y-2">
                      <label htmlFor="ca-pem-input" className="sr-only">
                        粘贴 PEM 格式 CA 证书
                      </label>
                      <textarea
                        id="ca-pem-input"
                        aria-label="粘贴 PEM 格式 CA 证书"
                        rows={4}
                        value={pemInput}
                        onChange={(e) => setPemInput(e.target.value)}
                        placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                        spellCheck={false}
                        autoComplete="off"
                        className="w-full px-3 py-2 rounded-xl glass-inset text-xs font-mono-tabular text-[var(--tm-text-primary)] placeholder:text-[var(--tm-text-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)] focus-visible:border-[var(--tm-border-accent)]"
                      />
                      <button
                        id="validate-ca-pem"
                        type="button"
                        disabled={!pemInput.trim() || Boolean(caDraft?.loading)}
                        onClick={() => onValidateCaPem?.(pemInput)}
                        className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--tm-success-soft-bg)] border border-[var(--tm-success-soft-border)] text-[var(--tm-success-text)] text-xs font-semibold disabled:opacity-50"
                      >
                        校验并载入证书
                      </button>
                    </div>
                  )}

                  {caDraft?.error && (
                    <InlineAlert id="ca-cert-error" tone="rose" role="alert">
                      {caDraft.error}
                    </InlineAlert>
                  )}
                </div>
              )}
            </div>
          )}

          <label
            className={`flex items-start gap-3 cursor-pointer rounded-2xl border px-3.5 py-2.5 min-h-[44px] transition-colors ${
              allowHttp
                ? 'bg-[var(--tm-warning-soft-bg)] border-[var(--tm-warning-soft-border)]'
                : 'bg-[var(--tm-bg-row)] border-[var(--tm-border-subtle)] hover:border-[var(--tm-border-default)]'
            }`}
          >
            <input
              id="allow-http"
              type="checkbox"
              checked={allowHttp}
              onChange={(e) => setAllowHttp(e.target.checked)}
              className="sr-only peer"
            />
            <span
              aria-hidden="true"
              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--tm-focus-ring)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--tm-bg-surface)] ${
                allowHttp
                  ? 'bg-[var(--tm-warning)] border-[var(--tm-warning)] text-[var(--tm-text-inverse)]'
                  : 'glass-inset border-[var(--tm-border-strong)] text-transparent'
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </span>
            <span className="text-xs min-w-0 flex-1">
              <strong
                className={`font-semibold block ${
                  allowHttp ? 'text-[var(--tm-warning-text)]' : 'text-[var(--tm-text-primary)]'
                }`}
              >
                允许 HTTP
              </strong>
              <span
                className={`text-[11.5px] leading-relaxed block mt-0.5 ${
                  allowHttp ? 'text-[var(--tm-warning-text)] opacity-90' : 'text-[var(--tm-text-muted)]'
                }`}
              >
                仅用于可信局域网；地址与密钥将明文传输。
              </span>
            </span>
          </label>

          {publicHttpWarning && (
            <InlineAlert id="public-http-warning" tone="rose" role="alert">
              <span className="inline-flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  检测到非局域网 / 公网 HTTP 地址：共享密钥与用量数据将在公网明文传输，极易被窃听或劫持。请为 Hub 启用 HTTPS（自签证书可在上方导入自定义 CA）。
                </span>
              </span>
            </InlineAlert>
          )}

          {formError && (
            <InlineAlert id="form-error" tone="rose" role="alert">
              {formError}
            </InlineAlert>
          )}

          <button
            id="connect"
            type="submit"
            disabled={connectPending}
            className="w-full min-h-[48px] px-5 py-3 rounded-2xl [background-image:var(--tm-accent-gradient)] text-[var(--tm-text-inverse)] font-bold text-sm flex items-center justify-between shadow-md hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <span>
              {connectPending
                ? '正在连接 Hub…'
                : formMode === 'edit'
                  ? '保存更改并连接'
                  : formMode === 'add'
                    ? '添加并连接'
                    : '保存并连接'}
            </span>
            <ArrowUpRight className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
          </button>

          {renderDisconnectControl()}
        </form>
      )}

      {onChangeDisplayPrefs && (
        <section id="settings-display" className="glass-panel rounded-3xl p-4 sm:p-5 space-y-4">
          <SectionHeader
            headingLevel="h2"
            icon={<SlidersHorizontal className="w-4 h-4" />}
            title="显示偏好"
            subtitle="自定义用量合并方式与趋势数值精度"
            className="pb-2 border-b border-[var(--tm-border-subtle)]"
          />

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-[var(--tm-text-primary)]">
                分开显示 Qoder 与 Qoder CN
              </h3>
              <p className="text-xs text-[var(--tm-text-muted)] leading-relaxed mt-1">
                关闭时将 Qoder 与 Qoder CN 的用量合并为 Qoder（含总览、设备明细与桌面微件）；会话与额度仍保留独立来源。
              </p>
            </div>
            <ToggleSwitch
              id="separate-qoder-clients"
              checked={displayPrefs.separateQoderClients}
              onChange={(checked) =>
                onChangeDisplayPrefs({ ...displayPrefs, separateQoderClients: checked })
              }
              ariaLabel="分开显示 Qoder 与 Qoder CN"
            />
          </div>

          <div className="pt-3.5 border-t border-[var(--tm-border-subtle)] flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-[var(--tm-text-primary)]">
                趋势详情显示精确 Token 数
              </h3>
              <p className="text-xs text-[var(--tm-text-muted)] leading-relaxed mt-1">
                开启后在总览每日趋势选中卡片、曲线提示和数值明细中显示精确千分位 Token 计数；关闭时使用紧凑格式。
              </p>
            </div>
            <ToggleSwitch
              id="exact-trend-tokens"
              checked={displayPrefs.exactTrendTokens}
              onChange={(checked) =>
                onChangeDisplayPrefs({ ...displayPrefs, exactTrendTokens: checked })
              }
              ariaLabel="趋势详情显示精确 Token 数"
            />
          </div>
        </section>
      )}

      <div id="settings-notifications">
        <CompletionSettingsCard
          notifications={notifications}
          monitorPending={monitorPending}
          approvals={approvals}
          approvalsPending={approvalsPending}
          connected={Boolean(connectionUrl)}
          onToggleMonitor={onToggleMonitor}
          onToggleApprovalAlerts={onToggleApprovalAlerts}
          onTestNotification={onTestNotification}
          onOpenSystemSettings={onOpenSystemSettings}
        />
      </div>

      <WidgetGalleryCard
        stats={stats ?? null}
        connected={Boolean(connectionUrl)}
        fetchedAt={fetchedAt ?? 0}
        separateQoderClients={displayPrefs.separateQoderClients}
      />

      <AppUpdateCard
        state={appUpdate}
        onSimulateCheck={onSimulateUpdateCheck}
        onSimulateAutoToggle={onSimulateAutoUpdateToggle}
      />

      <section className="glass-panel rounded-3xl p-4 sm:p-5 space-y-2.5">
        <SectionHeader headingLevel="h2" icon={<HelpCircle className="w-4 h-4" />} title="如何找到 Hub？" />
        <p className="text-xs text-[var(--tm-text-secondary)] leading-relaxed">
          电脑端打开「设置 → 多设备同步 → 在这台设备托管 Hub」，复制显示的地址和共享密钥。也支持已部署的 Node Hub 和 Cloudflare Worker。
        </p>
        <p className="text-xs text-[var(--tm-text-muted)] leading-relaxed">
          手机与电脑须网络互通。localhost 指手机自身，局域网请填写电脑的 IP 地址。
        </p>
      </section>

      <p className="text-[11.5px] text-[var(--tm-text-muted)] text-center leading-relaxed pt-2 pb-2 tabular-nums">
        Token Monitor for Android
        {appUpdate.currentVersion ? ` · ${appUpdate.currentVersion}` : ''}
        <br />
        凭据加密保存在本机 · 后台提醒按开关运行
      </p>
    </div>
  );
};
