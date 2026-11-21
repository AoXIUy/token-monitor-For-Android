import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bell, Monitor, ShieldCheck, Terminal, X } from 'lucide-react';
import type { ApprovalsState } from '../types/monitor';
import { clientName } from '../utils/formatters';

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

  useEffect(() => {
    if (!approvals.enabled || approvals.items.length === 0) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [approvals.enabled, approvals.items.length]);

  if (!approvals.enabled) return null;

  const visibleItems = approvals.items.filter((item) => !dismissedIds[item.id]);
  const hasItems = visibleItems.length > 0;
  const isHealthy = approvals.status === 'ok';
  const isWarn = approvals.status === 'disabled' || approvals.status === 'unsupported';

  if (!hasItems) {
    if (isHealthy) {
      return (
        <section
          id="approval-alerts-banner"
          className="glass-panel rounded-2xl px-3.5 py-2 mb-3 flex items-center justify-between gap-2 border-emerald-400/20"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              aria-hidden="true"
              className="w-5 h-5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-400/25 flex items-center justify-center shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </span>
            <p className="text-xs font-medium text-slate-200 truncate">{approvals.message}</p>
          </div>
          <span className="text-[11px] text-slate-400 shrink-0 whitespace-nowrap">仅通知</span>
        </section>
      );
    }

    return (
      <section
        id="approval-alerts-banner"
        className={`glass-panel rounded-2xl px-3.5 py-3 mb-3 flex items-start gap-2.5 ${
          isWarn
            ? 'border-amber-400/30 bg-amber-500/[0.08]'
            : 'border-rose-400/30 bg-rose-500/[0.08]'
        }`}
      >
        <div
          aria-hidden="true"
          className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
            isWarn
              ? 'bg-amber-500/15 text-amber-300 border border-amber-400/30'
              : 'bg-rose-500/15 text-rose-300 border border-rose-400/30'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-xs font-medium text-slate-100 leading-snug break-words">
            {approvals.message}
          </p>
          <p className="text-[11px] text-slate-300/90 leading-relaxed break-words">
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
      className="space-y-2.5 mb-3.5"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Bell className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
          <h2 className="text-xs font-bold tracking-wide text-amber-200 tabular-nums">
            待电脑端确认 ({visibleItems.length})
          </h2>
        </div>
      </div>

      {visibleItems.map((item) => (
        <article
          key={item.id}
          data-approval-alert-id={item.id}
          className="glass-panel rounded-3xl p-4 border-amber-400/40 bg-amber-500/[0.07] space-y-3 shadow-[0_10px_28px_-8px_rgba(245,158,11,0.18)]"
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-400/18 text-amber-200 border border-amber-300/30">
                  {item.client ? clientName(item.client) : 'Agent'}
                </span>
                {item.deviceName && (
                  <span className="text-xs font-semibold text-slate-100 truncate">
                    {item.deviceName}
                  </span>
                )}
                {item.projectLabel && (
                  <span className="text-[11px] text-slate-300/90 truncate">
                    · {item.projectLabel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                {item.tool && (
                  <span className="inline-flex items-center gap-1 text-sky-300 font-medium">
                    <Terminal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{item.tool}</span>
                  </span>
                )}
                <span className="tabular-nums text-amber-300">
                  {formatElapsed(item.createdAt, now)}
                </span>
              </div>
            </div>

            <button
              type="button"
              aria-label="收起提醒"
              data-approval-dismiss={item.id}
              onClick={() => setDismissedIds((prev) => ({ ...prev, [item.id]: true }))}
              className="shrink-0 inline-flex items-center justify-center gap-1 min-h-[36px] px-3 py-1.5 rounded-xl border border-white/12 bg-white/[0.05] hover:bg-white/[0.1] active:scale-[0.97] text-xs font-medium text-slate-200 transition-all"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              <span>收起</span>
            </button>
          </div>

          {item.description && (
            <p className="text-xs text-slate-200 leading-relaxed break-words">{item.description}</p>
          )}

          {item.command && (
            <pre className="glass-inset rounded-2xl p-3 text-xs font-mono-tabular text-slate-100 overflow-x-auto max-h-40 whitespace-pre-wrap break-words select-text leading-relaxed">
              {item.command}
            </pre>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-amber-200/95 pt-0.5">
            <Monitor className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>请前往电脑端确认</span>
          </div>
        </article>
      ))}
    </section>
  );
};
