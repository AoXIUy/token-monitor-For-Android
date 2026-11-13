import React, { useState } from 'react';
import { Bell, ChevronDown, Settings2, ShieldCheck } from 'lucide-react';
import { ApprovalsState, NotificationState } from '../types/monitor';
import { formatShortTime } from '../utils/formatters';

interface CompletionSettingsCardProps {
  notifications: NotificationState;
  monitorPending: boolean;
  approvals?: ApprovalsState;
  approvalsPending?: boolean;
  connected: boolean;
  compact?: boolean;
  onToggleMonitor: (enabled: boolean) => void;
  onToggleApprovalAlerts?: (enabled: boolean) => void;
  onTestNotification: () => void;
  onOpenSystemSettings: () => void;
}

export const CompletionSettingsCard: React.FC<CompletionSettingsCardProps> = ({
  notifications,
  monitorPending,
  approvals,
  approvalsPending = false,
  connected,
  compact = false,
  onToggleMonitor,
  onToggleApprovalAlerts,
  onTestNotification,
  onOpenSystemSettings,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

  const statusText = monitorPending
    ? '正在处理通知权限与监控状态…'
    : notifications.message +
      (notifications.enabled && notifications.lastReadAt
        ? ` · 最近读取 ${formatShortTime(notifications.lastReadAt)}`
        : '');

  const approvalsStatusText = approvalsPending
    ? '正在切换审批提醒状态…'
    : approvals?.message || '审批提醒未开启';

  const showBody = !compact || expanded;

  return (
    <section
      id="completion-settings"
      className={`glass-panel rounded-3xl mb-3.5 border-sky-400/20 ${
        compact && !expanded ? 'px-4 py-3' : 'p-5'
      }`}
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-400/25 flex items-center justify-center text-sky-300 shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-semibold text-slate-100 truncate">会话完成提醒</h3>
              {compact && (
                <button
                  type="button"
                  data-completion-expand="true"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((prev) => !prev)}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-sky-300 hover:bg-sky-500/10 transition-colors shrink-0"
                >
                  <span>{expanded ? '收起' : '更多'}</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-150 ${
                      expanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              )}
            </div>
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
            className="sr-only peer"
          />
          <span
            aria-hidden="true"
            className={`w-11 h-6 rounded-full transition-colors duration-200 relative inline-block peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#090C10] ${
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
          <span className="text-xs font-medium text-slate-200 whitespace-nowrap">后台监控</span>
        </label>
      </div>

      {showBody && (
        <>
          <p className="text-xs text-slate-400 leading-relaxed mt-2.5">
            开启后显示常驻通知；检测到已观察会话的明确本轮结束信号时提醒。首次连接不补发历史通知。
          </p>

          {approvals && onToggleApprovalAlerts && (
            <div className="mt-3.5 pt-3 border-t border-white/8">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center text-emerald-300 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-semibold text-slate-100 truncate">审批提醒</h4>
                    <p
                      id="approval-alerts-state"
                      role="status"
                      className="text-[11px] text-slate-400 mt-0.5 truncate"
                    >
                      {approvalsStatusText}
                    </p>
                  </div>
                </div>

                <label className="notification-toggle inline-flex items-center gap-2 cursor-pointer min-h-[44px] shrink-0">
                  <input
                    id="approval-alerts-enabled"
                    type="checkbox"
                    checked={approvals.enabled}
                    disabled={!connected || approvalsPending}
                    onChange={(e) => onToggleApprovalAlerts(e.target.checked)}
                    className="sr-only peer"
                  />
                  <span
                    aria-hidden="true"
                    className={`w-11 h-6 rounded-full transition-colors duration-200 relative inline-block peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#090C10] ${
                      approvals.enabled
                        ? 'bg-gradient-to-r from-emerald-400 to-sky-400'
                        : 'bg-white/15'
                    } ${!connected || approvalsPending ? 'opacity-45' : ''}`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-0.5 left-0.5 transition-transform duration-200 ${
                        approvals.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </span>
                  <span className="text-xs font-medium text-slate-200 whitespace-nowrap">只读提醒</span>
                </label>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
                仅在手机端开启时通过通知栏和首页卡片提醒 Codex 与 Antigravity 需要确认的操作；实际允许或拒绝仍在电脑端完成，不阻塞电脑端流程。
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-3.5">
            <button
              id="notification-test"
              type="button"
              onClick={onTestNotification}
              className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium text-sky-300 bg-sky-500/10 hover:bg-sky-500/18 border border-sky-400/20 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>发送测试通知</span>
            </button>

            <button
              id="notification-settings"
              type="button"
              onClick={onOpenSystemSettings}
              className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>系统通知设置</span>
            </button>
          </div>

          <div className="mt-3 pt-2.5 border-t border-white/6">
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              aria-expanded={showDetails}
              className="w-full min-h-[40px] flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span>后台运行说明</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-150 ${
                  showDetails ? 'rotate-180 text-sky-400' : ''
                }`}
              />
            </button>
            {showDetails && (
              <p className="text-xs text-slate-400 leading-relaxed mt-1.5">
                Android 15 及以上对后台数据同步有约 6 小时运行预算，系统可能暂停监控，打开应用后可重新开启。省电模式、网络中断、强行停止也可能延迟或中断提醒。常驻通知提供停止按钮。
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
};
