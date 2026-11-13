import React, { useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  HelpCircle,
  Link2,
  Play,
} from 'lucide-react';
import { ApprovalsState, NotificationState, AppUpdateState, MonitorStats } from '../types/monitor';
import { CompletionSettingsCard } from './CompletionSettingsCard';
import { AppUpdateCard } from './AppUpdateCard';
import { WidgetGalleryCard } from './WidgetGalleryCard';

interface SettingsViewProps {
  appUpdate: AppUpdateState;
  stats?: MonitorStats | null;
  fetchedAt?: number;
  connectionUrl: string;
  allowHttpInitial: boolean;
  connectPending: boolean;
  formError: string;
  notifications: NotificationState;
  monitorPending: boolean;
  approvals: ApprovalsState;
  approvalsPending: boolean;
  isBrowserPreview?: boolean;
  onConnect: (url: string, secret: string, allowHttp: boolean) => void;
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
  connectPending,
  formError,
  notifications,
  monitorPending,
  approvals,
  approvalsPending,
  isBrowserPreview,
  onConnect,
  onDisconnect,
  onLoadDemo,
  onToggleMonitor,
  onToggleApprovalAlerts,
  onTestNotification,
  onOpenSystemSettings,
  onSimulateUpdateCheck,
  onSimulateAutoUpdateToggle,
}) => {
  const [url, setUrl] = useState(connectionUrl);
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [allowHttp, setAllowHttp] = useState(allowHttpInitial);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect(url.trim(), secret, allowHttp);
  };

  return (
    <div id="settings" className="space-y-4">
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

      {isBrowserPreview && onLoadDemo && (
        <section className="glass-panel rounded-3xl p-4 border-sky-400/25 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-sky-300">Web 交互预览模式</p>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
              当前在浏览器中运行，可加载完整多设备与子代理演示数据。
            </p>
          </div>
          <button
            type="button"
            onClick={onLoadDemo}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-xs font-semibold text-sky-200 flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>加载演示数据</span>
          </button>
        </section>
      )}

      <form
        id="connection-form"
        onSubmit={handleSubmit}
        className="glass-panel rounded-3xl p-5 space-y-4"
      >
        <div className="flex items-center gap-2 pb-1 border-b border-white/8">
          <Link2 className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-100">Hub 连接凭据</h3>
        </div>

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
            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-2xl glass-inset text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/70 font-mono-tabular"
          />
        </label>

        <div className="space-y-1.5">
          <label htmlFor="hub-secret" className="text-xs font-medium text-slate-200 block">
            Shared secret
          </label>
          <div className="relative flex items-center">
            <input
              id="hub-secret"
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="输入 Hub 中配置的 secret"
              required
              autoComplete="new-password"
              spellCheck={false}
              className="w-full min-h-[46px] pl-3.5 pr-11 py-2.5 rounded-2xl glass-inset text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/70"
            />
            <button
              type="button"
              onClick={() => setShowSecret((prev) => !prev)}
              aria-label={showSecret ? '隐藏 secret' : '显示 secret'}
              aria-pressed={showSecret}
              className="w-10 h-10 flex items-center justify-center absolute right-1 text-slate-400 hover:text-slate-200 rounded-xl transition-colors"
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer py-1 min-h-[44px]">
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
                ? 'bg-sky-400 border-sky-400 text-slate-950'
                : 'glass-inset border-white/20 text-transparent'
            }`}
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </span>
          <span className="text-xs">
            <strong className="font-semibold text-slate-200 block">允许 HTTP</strong>
            <span className="text-[11px] text-slate-400 leading-relaxed block mt-0.5">
              仅用于可信局域网；地址与 secret 将明文传输。
            </span>
          </span>
        </label>

        {formError && (
          <p
            id="form-error"
            role="alert"
            className="text-xs text-rose-300 bg-rose-500/12 border border-rose-400/25 rounded-2xl p-3 leading-relaxed"
          >
            {formError}
          </p>
        )}

        <button
          id="connect"
          type="submit"
          disabled={connectPending}
          className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-between shadow-[0_6px_24px_rgba(56,189,248,0.28)] hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          <span>{connectPending ? '正在连接 Hub…' : '保存并连接'}</span>
          <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
        </button>

        {connectionUrl && (
          <button
            id="disconnect"
            type="button"
            onClick={onDisconnect}
            className="w-full min-h-[44px] text-xs font-medium text-rose-300/90 hover:text-rose-200 transition-colors text-center pt-1"
          >
            断开连接并清除凭据
          </button>
        )}
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
      />

      <AppUpdateCard
        state={appUpdate}
        onSimulateCheck={onSimulateUpdateCheck}
        onSimulateAutoToggle={onSimulateAutoUpdateToggle}
      />

      <section className="glass-panel rounded-3xl p-5 space-y-2">
        <div className="flex items-center gap-2 text-sky-300">
          <HelpCircle className="w-4 h-4" />
          <h3 className="text-sm font-semibold text-slate-100">如何找到 Hub？</h3>
        </div>
        <p className="text-xs text-slate-300/85 leading-relaxed">
          电脑端打开「设置 → 多设备同步 → 在这台设备托管 Hub」，复制显示的地址和 secret。也支持已部署的 Node Hub 和 Cloudflare Worker。
        </p>
        <p className="text-xs text-slate-400 leading-relaxed">
          手机与电脑须网络互通。localhost 指手机自身，局域网请填写电脑的 IP 地址。
        </p>
      </section>

      <p className="text-[11px] text-slate-400/80 text-center leading-relaxed pt-2 pb-2">
        Token Monitor for Android
        {appUpdate.currentVersion ? ` · ${appUpdate.currentVersion}` : ''}
        <br />
        凭据加密保存在本机 · 后台提醒按开关运行
      </p>
    </div>
  );
};
