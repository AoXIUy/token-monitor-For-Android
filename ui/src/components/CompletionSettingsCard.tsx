import React, { useState } from 'react';
import { Bell, ChevronDown, Settings2, ShieldCheck } from 'lucide-react';
import { ApprovalsState, NotificationState } from '../types/monitor';
import { formatShortTime } from '../utils/formatters';
import { InlineAlert, ToggleSwitch } from './ui/Primitives';

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

  const permissionMissing = notifications.permission === false;
  const approvalsActiveCompact = Boolean(compact && !expanded && approvals?.enabled);

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

  const headerInfo = (
    <>
      <div
        className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
          permissionMissing
            ? 'bg-[var(--tm-warning-soft-bg)] border-[var(--tm-warning-soft-border)] text-[var(--tm-warning)]'
            : 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)] text-[var(--tm-accent-text)]'
        }`}
        aria-hidden="true"
      >
        <Bell className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <h2 className="text-sm font-semibold text-[var(--tm-text-primary)] truncate">
            会话完成提醒
          </h2>
          {approvalsActiveCompact && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--tm-success-soft-bg)] border border-[var(--tm-success-soft-border)] text-[11px] font-medium text-[var(--tm-success-text)] shrink-0 whitespace-nowrap">
              <i aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[var(--tm-success)]" />
              <span>
                审批提醒
                {approvals && approvals.items.length > 0 ? ` ${approvals.items.length}` : ''}
              </span>
            </span>
          )}
          {compact && (
            <ChevronDown
              aria-hidden="true"
              className={`w-4 h-4 text-[var(--tm-text-muted)] transition-transform duration-150 shrink-0 ${
                expanded ? 'rotate-180 text-[var(--tm-accent-text)]' : ''
              }`}
            />
          )}
        </div>
        <p
          id="monitor-state"
          role="status"
          className={`text-[11.5px] mt-0.5 truncate tabular-nums ${
            permissionMissing ? 'text-[var(--tm-warning-text)]' : 'text-[var(--tm-text-muted)]'
          }`}
        >
          {statusText}
        </p>
      </div>
    </>
  );

  return (
    <section
      id="completion-settings"
      className={`glass-panel rounded-3xl ${compact ? 'mb-3' : ''} ${
        permissionMissing
          ? 'border-[var(--tm-warning-soft-border)]'
          : 'border-[var(--tm-border-default)]'
      } ${compact && !expanded ? 'px-4 py-2.5' : 'p-4 sm:p-5'}`}
    >
      <div className="flex items-center justify-between gap-2.5">
        {compact ? (
          <button
            type="button"
            data-completion-expand="true"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            className="flex items-center gap-2.5 min-w-0 flex-1 min-h-[44px] py-0.5 rounded-xl text-left transition-opacity active:opacity-80"
          >
            {headerInfo}
          </button>
        ) : (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">{headerInfo}</div>
        )}

        <ToggleSwitch
          id="monitor-enabled"
          checked={notifications.enabled}
          disabled={!connected || monitorPending}
          onChange={onToggleMonitor}
          ariaLabel="开启会话完成后台监控"
          className="notification-toggle"
        />
      </div>

      {showBody && (
        <>
          {permissionMissing && (
            <InlineAlert
              tone="amber"
              className="mt-3"
              action={
                <button
                  type="button"
                  onClick={onOpenSystemSettings}
                  className="min-h-[40px] px-3 rounded-xl bg-[var(--tm-warning-soft-bg)] hover:brightness-105 active:scale-[0.98] border border-[var(--tm-warning-soft-border)] text-xs font-semibold text-[var(--tm-warning-text)] transition-all whitespace-nowrap"
                >
                  去开启
                </button>
              }
            >
              尚未授予通知权限；开启监控时将请求授权，或在系统通知设置中允许本应用发送提醒。
            </InlineAlert>
          )}

          <p className="text-xs text-[var(--tm-text-muted)] leading-relaxed mt-2.5">
            开启后台监控后显示常驻通知；检测到已观察会话的明确本轮结束信号时提醒。首次连接不补发历史通知。
          </p>

          {approvals && onToggleApprovalAlerts && (
            <div className="mt-3.5 pt-3.5 border-t border-[var(--tm-border-subtle)]">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                      approvals.permission === false
                        ? 'bg-[var(--tm-warning-soft-bg)] border-[var(--tm-warning-soft-border)] text-[var(--tm-warning)]'
                        : 'bg-[var(--tm-success-soft-bg)] border-[var(--tm-success-soft-border)] text-[var(--tm-success)]'
                    }`}
                    aria-hidden="true"
                  >
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-[var(--tm-text-primary)] truncate">
                      只读审批提醒
                    </h3>
                    <p
                      id="approval-alerts-state"
                      role="status"
                      className="text-[11.5px] text-[var(--tm-text-muted)] mt-0.5 truncate tabular-nums"
                    >
                      {approvalsStatusText}
                    </p>
                  </div>
                </div>

                <ToggleSwitch
                  id="approval-alerts-enabled"
                  checked={approvals.enabled}
                  disabled={!connected || approvalsPending}
                  onChange={onToggleApprovalAlerts}
                  ariaLabel="开启只读审批提醒"
                  className="notification-toggle"
                />
              </div>
              <p className="text-xs text-[var(--tm-text-muted)] leading-relaxed mt-2">
                仅在手机端开启时通过通知栏和首页卡片提醒 Codex 与 Antigravity 需要确认的操作；实际允许或拒绝仍在电脑端完成，不阻塞电脑端流程。
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-3.5">
            <button
              id="notification-test"
              type="button"
              onClick={onTestNotification}
              className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold text-[var(--tm-accent-text)] bg-[var(--tm-accent-soft-bg)] hover:brightness-105 active:scale-[0.98] border border-[var(--tm-accent-soft-border)] transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Bell className="w-3.5 h-3.5" aria-hidden="true" />
              <span>发送测试通知</span>
            </button>

            <button
              id="notification-settings"
              type="button"
              onClick={onOpenSystemSettings}
              className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--tm-text-primary)] bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.98] border border-[var(--tm-border-default)] transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>系统通知设置</span>
            </button>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[var(--tm-border-subtle)]">
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              aria-expanded={showDetails}
              className="w-full min-h-[44px] flex items-center justify-between text-xs text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] transition-colors"
            >
              <span>后台运行说明</span>
              <ChevronDown
                aria-hidden="true"
                className={`w-4 h-4 text-[var(--tm-text-muted)] transition-transform duration-150 ${
                  showDetails ? 'rotate-180 text-[var(--tm-accent-text)]' : ''
                }`}
              />
            </button>
            {showDetails && (
              <p className="text-xs text-[var(--tm-text-muted)] leading-relaxed mt-1.5">
                Android 15 及以上对后台数据同步有约 6 小时运行预算，系统可能暂停监控，打开应用后可重新开启。省电模式、网络中断、强行停止也可能延迟或中断提醒。常驻通知提供停止按钮。
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
};
