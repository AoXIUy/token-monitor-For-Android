import React, { useState } from 'react';
import { Bell, ChevronDown, Settings2 } from 'lucide-react';
import { NotificationState } from '../types/monitor';
import { formatShortTime } from '../utils/formatters';

interface CompletionSettingsCardProps {
  notifications: NotificationState;
  monitorPending: boolean;
  connected: boolean;
  onToggleMonitor: (enabled: boolean) => void;
  onTestNotification: () => void;
  onOpenSystemSettings: () => void;
}

export const CompletionSettingsCard: React.FC<CompletionSettingsCardProps> = ({
  notifications,
  monitorPending,
  connected,
  onToggleMonitor,
  onTestNotification,
  onOpenSystemSettings,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const statusText = monitorPending
    ? '正在处理通知权限与监控状态…'
    : notifications.message +
      (notifications.enabled && notifications.lastReadAt
        ? ` · 最近读取 ${formatShortTime(notifications.lastReadAt)}`
        : '');

  return (
    <section
      id="completion-settings"
      className="glass-panel rounded-3xl p-4.5 mb-3.5 border-sky-400/20"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-400/25 flex items-center justify-center text-sky-300 shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">会话完成提醒</h3>
            <p
              id="monitor-state"
              role="status"
              className="text-[11px] text-slate-400 mt-0.5 truncate"
            >
              {statusText}
            </p>
          </div>
        </div>

        <label className="notification-toggle inline-flex items-center gap-2 cursor-pointer min-h-[44px] shrink-0">
          <input
            id="monitor-enabled"
            type="checkbox"
            checked={notifications.enabled}
            disabled={!connected || monitorPending}
            onChange={(e) => onToggleMonitor(e.target.checked)}
            className="sr-only"
          />
          <span
            aria-hidden="true"
            className={`w-11 h-6 rounded-full transition-colors duration-200 relative inline-block ${
              notifications.enabled
                ? 'bg-gradient-to-r from-sky-400 to-emerald-400'
                : 'bg-white/15'
            } ${!connected || monitorPending ? 'opacity-45' : ''}`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-0.5 left-0.5 transition-transform duration-200 ${
                notifications.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
          <span className="text-xs font-medium text-slate-200">后台监控</span>
        </label>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed mt-2.5">
        开启后显示常驻通知；检测到已观察会话的明确本轮结束信号时提醒。首次连接不补发历史通知。
      </p>

      <div className="flex flex-wrap gap-2 mt-3">
        <button
          id="notification-test"
          type="button"
          onClick={onTestNotification}
          className="min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium text-sky-300 bg-sky-500/10 hover:bg-sky-500/18 border border-sky-400/20 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Bell className="w-3.5 h-3.5" />
          <span>发送测试通知</span>
        </button>

        <button
          id="notification-settings"
          type="button"
          onClick={onOpenSystemSettings}
          className="min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>系统通知设置</span>
        </button>
      </div>

      <div className="mt-3 pt-2.5 border-t border-white/6">
        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          className="w-full min-h-[32px] flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <span>后台运行说明</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-150 ${
              showDetails ? 'rotate-180 text-sky-400' : ''
            }`}
          />
        </button>
        {showDetails && (
          <p className="text-xs text-slate-400 leading-relaxed mt-2">
            Android 15 及以上对后台数据同步有约 6 小时运行预算，系统可能暂停监控，打开应用后可重新开启。省电模式、网络中断、强行停止也可能延迟或中断提醒。常驻通知提供停止按钮。
          </p>
        )}
      </div>
    </section>
  );
};
