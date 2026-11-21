import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  HelpCircle,
  Link2,
  Pencil,
  Play,
  Plus,
  Server,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  ApprovalsState,
  DisplayPrefs,
  NotificationState,
  AppUpdateState,
  HubProfile,
  MonitorStats,
} from '../types/monitor';
import { CompletionSettingsCard } from './CompletionSettingsCard';
import { AppUpdateCard } from './AppUpdateCard';
import { WidgetGalleryCard } from './WidgetGalleryCard';
import { CopyButton, InlineAlert, SectionHeader, ToggleSwitch } from './ui/Primitives';

interface SettingsViewProps {
  appUpdate: AppUpdateState;
  stats?: MonitorStats | null;
  fetchedAt?: number;
  connectionUrl: string;
  allowHttpInitial: boolean;
  hubProfiles?: HubProfile[];
  activeHubProfileId?: string;
  connectPending: boolean;
  formError: string;
  displayPrefs?: DisplayPrefs;
  onChangeDisplayPrefs?: (next: DisplayPrefs) => void;
  notifications: NotificationState;
  monitorPending: boolean;
  approvals: ApprovalsState;
  approvalsPending: boolean;
  isBrowserPreview?: boolean;
  onConnect: (url: string, secret: string, allowHttp: boolean) => void;
  onSelectHubProfile?: (id: string) => void;
  onAddHubProfile?: (name: string, url: string, secret: string, allowHttp: boolean) => void;
  onSaveHubProfile?: (id: string, name: string, url: string, secret: string, allowHttp: boolean) => void;
  onDeleteHubProfile?: (id: string) => void;
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
  hubProfiles = [],
  activeHubProfileId = '',
  connectPending,
  formError,
  displayPrefs = { separateQoderClients: false, exactTrendTokens: false },
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

  useEffect(() => {
    setConfirmDisconnect(false);
  }, [connectionUrl]);

  const activeProfile = activeHubProfileId
    ? hubProfiles.find((profile) => profile.id === activeHubProfileId) || null
    : null;

  const editingProfile =
    formMode === 'edit'
      ? hubProfiles.find((profile) => profile.id === editingProfileId) || null
      : null;
  const destinationChanged = Boolean(
    editingProfile && (url.trim() !== editingProfile.url || allowHttp !== editingProfile.allowHttp),
  );
  const secretRequired = !editingProfile || destinationChanged;

  const startAddProfile = () => {
    setFormMode('add');
    setEditingProfileId('');
    setConfirmDeleteId('');
    setConfirmDisconnect(false);
    setName('');
    setUrl('');
    setSecret('');
    setAllowHttp(false);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const startEditProfile = (profile: HubProfile) => {
    setFormMode('edit');
    setEditingProfileId(profile.id);
    setConfirmDeleteId('');
    setConfirmDisconnect(false);
    setName(profile.name);
    setUrl(profile.url);
    setSecret('');
    setAllowHttp(profile.allowHttp);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const cancelFormMode = () => {
    setFormMode('connect');
    setEditingProfileId('');
    setName('');
    setUrl(connectionUrl);
    setSecret('');
    setAllowHttp(allowHttpInitial);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (formMode === 'edit' && editingProfile && onSaveHubProfile) {
      onSaveHubProfile(editingProfile.id, name.trim(), trimmedUrl, secret, allowHttp);
      return;
    }
    if (formMode === 'add' && onAddHubProfile) {
      onAddHubProfile(name.trim(), trimmedUrl, secret, allowHttp);
      return;
    }
    onConnect(trimmedUrl, secret, allowHttp);
  };

  return (
    <div id="settings" className="space-y-4">
      {connectionUrl ? (
        <section className="glass-hero rounded-3xl px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-emerald-400/14 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-white truncate">
                  <i aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="truncate">{activeProfile?.name || '已连接 Hub'}</span>
                </span>
                {allowHttpInitial && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-200 text-[11px] font-mono-tabular shrink-0">
                    HTTP
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono-tabular text-slate-300 truncate mt-0.5">
                {connectionUrl}
              </p>
            </div>
          </div>
          <CopyButton
            text={connectionUrl}
            ariaLabel="复制当前 Hub 地址"
            label="复制"
            copiedLabel="已复制"
            className="min-h-[38px]"
          />
        </section>
      ) : (
        <div className="text-center py-4 px-2">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3.5 glass-hero flex items-center justify-center text-sky-300 shadow-[0_0_28px_rgba(56,189,248,0.25)]">
            <Activity className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            你的所有设备，一处查看。
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed mt-1.5">
            连接已有 Hub，随时了解 AI 用量。
            <br />
            手机仅查看数据，不参与采集。
          </p>
        </div>
      )}

      {isBrowserPreview && onLoadDemo && (
        <section className="glass-panel rounded-3xl p-4 border-sky-400/25 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-sky-300">Web 交互预览模式</p>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
              当前在浏览器中运行，可加载完整多设备与子代理演示数据。
            </p>
          </div>
          <button
            type="button"
            onClick={onLoadDemo}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 active:scale-[0.98] border border-sky-400/30 text-xs font-semibold text-sky-200 flex items-center gap-1.5 shrink-0 transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>加载演示数据</span>
          </button>
        </section>
      )}

      {hubProfiles.length > 0 && (
        <section id="saved-hubs" className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5">
          <SectionHeader
            icon={<Server className="w-4 h-4" />}
            title="已保存的 Hub"
            badge={
              <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-[11px] font-mono-tabular text-slate-300">
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
                  className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-sky-400/15 border border-sky-400/30 text-sky-200 text-xs font-semibold hover:bg-sky-400/22 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新增 Hub</span>
                </button>
              ) : undefined
            }
            className="pb-2 border-b border-white/8"
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
                      ? 'bg-sky-500/[0.08] border-sky-400/40'
                      : isActive
                        ? 'bg-emerald-400/8 border-emerald-400/30'
                        : 'glass-inset border-white/8'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-slate-100 truncate">
                        {profile.name}
                      </span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-200 text-[11px] font-medium">
                          <Check className="w-3 h-3" />
                          当前已连接
                        </span>
                      )}
                      {isEditing && (
                        <span className="px-2 py-0.5 rounded-full bg-sky-400/15 text-sky-200 text-[11px] font-medium">
                          编辑中
                        </span>
                      )}
                      {profile.allowHttp && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-200 text-[11px] font-mono-tabular">
                          HTTP
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono-tabular text-slate-400 break-all mt-1">
                      {profile.url}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 mt-3 pt-2.5 border-t border-white/6">
                    {!isActive && onSelectHubProfile && (
                      <button
                        type="button"
                        disabled={connectPending}
                        onClick={() => {
                          setConfirmDeleteId('');
                          onSelectHubProfile(profile.id);
                        }}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-sky-400/15 border border-sky-400/30 text-sky-200 text-xs font-semibold hover:bg-sky-400/22 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        切换连接
                      </button>
                    )}
                    {onSaveHubProfile && (
                      <button
                        type="button"
                        disabled={connectPending}
                        onClick={() => startEditProfile(profile)}
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-slate-200 text-xs font-medium hover:bg-white/10 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
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
                            className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-slate-300 hover:text-white text-xs font-medium active:scale-[0.98] transition-all disabled:opacity-50"
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
                              ? 'bg-rose-500/22 border-rose-400/45 text-rose-100 font-semibold'
                              : 'bg-white/[0.05] border-white/10 text-rose-300 hover:bg-rose-500/12'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      <form
        ref={formRef}
        id="connection-form"
        onSubmit={handleSubmit}
        className={`glass-panel rounded-3xl p-4 sm:p-5 space-y-4 transition-colors ${
          formMode === 'edit'
            ? 'border-sky-400/35'
            : formMode === 'add'
              ? 'border-emerald-400/30'
              : ''
        }`}
      >
        <SectionHeader
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
                className="inline-flex items-center gap-1 min-h-[40px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-medium text-slate-200 shrink-0 active:scale-[0.98] transition-all"
              >
                <X className="w-3.5 h-3.5" />
                <span>取消</span>
              </button>
            ) : undefined
          }
          className="pb-2 border-b border-white/8"
        />

        {formMode !== 'connect' && (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-200 block">显示名称（可选）</span>
            <input
              id="hub-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：公司台式机 / 家里 Mac"
              maxLength={64}
              autoComplete="off"
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-2xl glass-inset text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-400/70 transition-colors"
            />
          </label>
        )}

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-200 block">Hub 地址</span>
          <input
            id="hub-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://monitor.example.com"
            required
            autoComplete="off"
            spellCheck={false}
            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-2xl glass-inset text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-400/70 font-mono-tabular transition-colors"
          />
        </label>

        <div className="space-y-1.5">
          <label htmlFor="hub-secret" className="text-xs font-medium text-slate-200 block">
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
                    ? '地址或协议已变更，请重新输入密钥'
                    : '留空将沿用当前保存的密钥'
                  : '输入 Hub 中配置的共享密钥'
              }
              required={secretRequired}
              autoComplete="new-password"
              spellCheck={false}
              className="w-full min-h-[46px] pl-3.5 pr-12 py-2.5 rounded-2xl glass-inset text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-400/70 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowSecret((prev) => !prev)}
              aria-label={showSecret ? '隐藏共享密钥' : '显示共享密钥'}
              aria-pressed={showSecret}
              className="w-11 h-11 flex items-center justify-center absolute right-0.5 text-slate-400 hover:text-slate-100 active:scale-95 rounded-xl transition-all"
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {editingProfile && (
            <p
              className={`text-[11px] leading-relaxed ${
                destinationChanged ? 'text-amber-300' : 'text-slate-400'
              }`}
            >
              {destinationChanged
                ? '检测到 Hub 地址或 HTTP 选项已变更，出于安全校验需要重新填写共享密钥。'
                : '留空将沿用本机加密保存的原密钥；仅在轮换 Hub 密钥时填写新值。'}
            </p>
          )}
        </div>

        <label
          className={`flex items-start gap-3 cursor-pointer rounded-2xl border px-3.5 py-2.5 min-h-[44px] transition-colors ${
            allowHttp
              ? 'bg-amber-500/10 border-amber-400/35'
              : 'bg-white/[0.02] border-white/[0.08] hover:border-white/15'
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
            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#090C10] ${
              allowHttp
                ? 'bg-amber-400 border-amber-400 text-slate-950'
                : 'glass-inset border-white/20 text-transparent'
            }`}
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </span>
          <span className="text-xs min-w-0 flex-1">
            <strong
              className={`font-semibold block ${allowHttp ? 'text-amber-200' : 'text-slate-200'}`}
            >
              允许 HTTP
            </strong>
            <span
              className={`text-[11px] leading-relaxed block mt-0.5 ${
                allowHttp ? 'text-amber-100/85' : 'text-slate-400'
              }`}
            >
              仅用于可信局域网；地址与密钥将明文传输。
            </span>
          </span>
        </label>

        {formError && (
          <InlineAlert id="form-error" tone="rose" role="alert">
            {formError}
          </InlineAlert>
        )}

        <button
          id="connect"
          type="submit"
          disabled={connectPending}
          className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-between shadow-[0_6px_24px_rgba(56,189,248,0.28)] hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
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
          <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
        </button>

        {connectionUrl &&
          (confirmDisconnect ? (
            <div className="rounded-2xl bg-rose-500/10 border border-rose-400/30 p-3.5 space-y-2.5">
              <p className="text-xs text-rose-100 leading-relaxed">
                {hubProfiles.length > 0
                  ? '确认断开当前 Hub 连接？已保存的 Hub 列表仍会保留，可随时重新切换连接。'
                  : '确认断开连接并清除本机加密保存的 Hub 地址与共享密钥？清除后需重新输入凭据。'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(false)}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] active:scale-[0.98] border border-white/10 text-xs font-medium text-slate-200 transition-all"
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
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-rose-500/22 hover:bg-rose-500/32 active:scale-[0.98] border border-rose-400/45 text-xs font-semibold text-rose-100 transition-all"
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
              className="w-full min-h-[44px] rounded-2xl border border-rose-400/20 bg-rose-500/[0.06] hover:bg-rose-500/[0.12] active:scale-[0.98] text-xs font-medium text-rose-300 hover:text-rose-200 transition-all text-center px-3"
            >
              {hubProfiles.length > 0 ? '断开当前连接（保留已保存列表）' : '断开连接并清除凭据'}
            </button>
          ))}
      </form>

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

      {onChangeDisplayPrefs && (
        <section id="settings-display" className="glass-panel rounded-3xl p-4 sm:p-5 space-y-4">
          <SectionHeader
            icon={<SlidersHorizontal className="w-4 h-4" />}
            title="显示偏好"
            subtitle="自定义用量合并方式与趋势数值精度"
            className="pb-2 border-b border-white/8"
          />

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-slate-100">分开显示 Qoder 与 Qoder CN</h4>
              <p className="text-xs text-slate-400 leading-relaxed mt-1">
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

          <div className="pt-3.5 border-t border-white/8 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-slate-100">趋势详情显示精确 Token 数</h4>
              <p className="text-xs text-slate-400 leading-relaxed mt-1">
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

      <AppUpdateCard
        state={appUpdate}
        onSimulateCheck={onSimulateUpdateCheck}
        onSimulateAutoToggle={onSimulateAutoUpdateToggle}
      />

      <section className="glass-panel rounded-3xl p-4 sm:p-5 space-y-2.5">
        <SectionHeader icon={<HelpCircle className="w-4 h-4" />} title="如何找到 Hub？" />
        <p className="text-xs text-slate-300 leading-relaxed">
          电脑端打开「设置 → 多设备同步 → 在这台设备托管 Hub」，复制显示的地址和共享密钥。也支持已部署的 Node Hub 和 Cloudflare Worker。
        </p>
        <p className="text-xs text-slate-400 leading-relaxed">
          手机与电脑须网络互通。localhost 指手机自身，局域网请填写电脑的 IP 地址。
        </p>
      </section>

      <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-2 pb-2 tabular-nums">
        Token Monitor for Android
        {appUpdate.currentVersion ? ` · ${appUpdate.currentVersion}` : ''}
        <br />
        凭据加密保存在本机 · 后台提醒按开关运行
      </p>
    </div>
  );
};
