import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bell, ChevronDown, Monitor, ShieldCheck, Terminal, X } from 'lucide-react';
import type { ApprovalsState } from '../types/monitor';
import { clientName } from '../utils/formatters';
import { CopyButton } from './ui/Primitives';

interface ApprovalsPanelProps {
  approvals: ApprovalsState;
}

function formatElapsed(createdAt: number, now: number): string {
  if (!createdAt || createdAt <= 0) return '刚刚';
  const diffSec = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (diffSec < 10) return '刚刚';
  if (diffSec < 60) return `${diffSec} 秒前`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} 分钟前`;
  return `${Math.floor(min / 60)} 小时前`;
}

export const ApprovalsPanel: React.FC<ApprovalsPanelProps> = ({ approvals }) => {
  const [now, setNow] = useState(() => Date.now());
  const [dismissedIds, setDismissedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDismissedIds((prev) => {
      const prevKeys = Object.keys(prev);
      if (prevKeys.length === 0) return prev;
      const activeIds = new Set(approvals.items.map((item) => item.id));
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const id of prevKeys) {
        if (activeIds.has(id) && prev[id]) {
          next[id] = true;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [approvals.items]);

  const visibleItems = approvals.items.filter((item) => !dismissedIds[item.id]);
  const visibleCount = visibleItems.length;
  const dismissedCount = approvals.items.length - visibleCount;

  useEffect(() => {
    if (!approvals.enabled || visibleCount === 0) return;
    setNow(Date.now());
    let timer: number | null = null;
    const start = () => {
      if (timer !== null || document.hidden) return;
      timer = window.setInterval(() => setNow(Date.now()), 5000);
    };
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        setNow(Date.now());
        start();
      }
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [approvals.enabled, visibleCount]);

  if (!approvals.enabled) return null;

  const hasItems = visibleCount > 0;
  const isHealthy = approvals.status === 'ok';
  const isWarn = approvals.status === 'disabled' || approvals.status === 'unsupported';

  if (!hasItems) {
    // When alerts exist but were collapsed by the user, show a compact recoverable bar
    // instead of falling through to the healthy "no alerts" banner.
    if (dismissedCount > 0) {
      return (
        <section
          id="approval-alerts-collapsed"
          aria-label="已收起的待确认提醒"
          className="glass-panel rounded-2xl px-3.5 py-1.5 mb-3 flex items-center justify-between gap-2 border-[var(--tm-warning-soft-border)] bg-[var(--tm-warning-soft-bg)]"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Bell className="w-4 h-4 text-[var(--tm-warning-text)] shrink-0" aria-hidden="true" />
            <p className="text-xs font-semibold text-[var(--tm-warning-text)] truncate tabular-nums">
              已收起 {dismissedCount} 条待电脑端确认
            </p>
          </div>
          <button
            type="button"
            data-approval-restore="true"
            onClick={() => setDismissedIds({})}
            className="min-h-[44px] px-3 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-warning-soft-border)] text-xs font-semibold text-[var(--tm-warning-text)] inline-flex items-center gap-1 shrink-0 active:scale-[0.97] transition-all"
          >
            <span>展开</span>
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </section>
      );
    }

    if (isHealthy) {
      return (
        <section
          id="approval-alerts-banner"
          className="glass-panel rounded-2xl px-3.5 py-2 mb-3 flex items-center justify-between gap-2 border-[var(--tm-success-soft-border)]"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              aria-hidden="true"
              className="w-5 h-5 rounded-lg bg-[var(--tm-success-soft-bg)] text-[var(--tm-success-text)] border border-[var(--tm-success-soft-border)] flex items-center justify-center shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </span>
            <p className="text-xs font-medium text-[var(--tm-text-secondary)] truncate">
              {approvals.message}
            </p>
          </div>
          <span className="text-[11px] text-[var(--tm-text-muted)] shrink-0 whitespace-nowrap">
            仅通知
          </span>
        </section>
      );
    }

    return (
      <section
        id="approval-alerts-banner"
        className={`glass-panel rounded-2xl px-3.5 py-2.5 mb-3 flex items-start gap-2.5 ${
          isWarn
            ? 'border-[var(--tm-warning-soft-border)] bg-[var(--tm-warning-soft-bg)]'
            : 'border-[var(--tm-danger-soft-border)] bg-[var(--tm-danger-soft-bg)]'
        }`}
      >
        <div
          aria-hidden="true"
          className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${
            isWarn
              ? 'bg-[var(--tm-warning-soft-bg)] text-[var(--tm-warning-text)] border-[var(--tm-warning-soft-border)]'
              : 'bg-[var(--tm-danger-soft-bg)] text-[var(--tm-danger-text)] border-[var(--tm-danger-soft-border)]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-xs font-medium text-[var(--tm-text-primary)] leading-snug break-words">
            {approvals.message}
          </p>
          <p className="text-[11px] text-[var(--tm-text-secondary)] leading-relaxed break-words">
            仅通知提醒；请在电脑端确认操作，不阻塞本地流程
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      id="approval-alerts-panel"
      aria-label="待电脑端确认提醒"
      className="space-y-2 mb-3"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Bell className="w-3.5 h-3.5 text-[var(--tm-warning-text)] shrink-0" aria-hidden="true" />
          <h2 className="text-xs font-bold tracking-wide text-[var(--tm-warning-text)] tabular-nums">
            待电脑端确认 ({visibleCount})
          </h2>
        </div>
        {dismissedCount > 0 && (
          <button
            type="button"
            data-approval-restore="true"
            onClick={() => setDismissedIds({})}
            className="min-h-[44px] px-3 rounded-xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-border-default)] text-xs font-semibold text-[var(--tm-accent-text)] tabular-nums active:scale-[0.97] transition-all shrink-0"
          >
            恢复已收起 ({dismissedCount})
          </button>
        )}
      </div>

      {visibleItems.map((item) => (
        <article
          key={item.id}
          data-approval-alert-id={item.id}
          className="glass-panel rounded-2xl p-3.5 border-[var(--tm-warning-soft-border)] bg-[var(--tm-warning-soft-bg)] space-y-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--tm-warning-soft-bg)] text-[var(--tm-warning-text)] border border-[var(--tm-warning-soft-border)]">
                  {item.client ? clientName(item.client) : 'Agent'}
                </span>
                {item.deviceName && (
                  <span className="text-xs font-semibold text-[var(--tm-text-primary)] truncate">
                    {item.deviceName}
                  </span>
                )}
                {item.projectLabel && (
                  <span className="text-[11px] text-[var(--tm-text-secondary)] truncate">
                    · {item.projectLabel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[var(--tm-text-muted)] flex-wrap">
                {item.tool && (
                  <span className="inline-flex items-center gap-1 text-[var(--tm-accent-text)] font-medium">
                    <Terminal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{item.tool}</span>
                  </span>
                )}
                <span className="tabular-nums text-[var(--tm-warning-text)] font-medium">
                  {formatElapsed(item.createdAt, now)}
                </span>
              </div>
            </div>

            <button
              type="button"
              aria-label="收起提醒"
              data-approval-dismiss={item.id}
              onClick={() => setDismissedIds((prev) => ({ ...prev, [item.id]: true }))}
              className="shrink-0 inline-flex items-center justify-center gap-1 min-h-[44px] px-3 rounded-xl border border-[var(--tm-border-default)] bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.97] text-xs font-medium text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] transition-all"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              <span>收起</span>
            </button>
          </div>

          {item.description && (
            <p className="text-xs text-[var(--tm-text-secondary)] leading-relaxed break-words">
              {item.description}
            </p>
          )}

          {item.command && (
            <div className="glass-inset rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-1 border-b border-[var(--tm-border-subtle)] bg-[var(--tm-bg-row)]">
                <span className="text-[11px] font-mono-tabular text-[var(--tm-text-muted)] truncate">
                  待执行命令
                </span>
                <CopyButton
                  text={item.command}
                  ariaLabel="复制待确认命令"
                  label="复制"
                  copiedLabel="已复制"
                  className="min-h-[44px] px-3 py-1.5 text-xs"
                />
              </div>
              <pre className="p-3 text-xs font-mono-tabular text-[var(--tm-text-primary)] overflow-x-auto max-h-36 whitespace-pre-wrap break-words [overflow-wrap:anywhere] select-text leading-relaxed">
                {item.command}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-[var(--tm-warning-text)] font-medium pt-0.5">
            <Monitor className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>请前往电脑端确认</span>
          </div>
        </article>
      ))}
    </section>
  );
};
