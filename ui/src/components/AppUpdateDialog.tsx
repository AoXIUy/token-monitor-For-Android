import { useEffect, useRef } from 'react';
import { Download, X } from 'lucide-react';
import type { AppUpdateState } from '../types/monitor';
import { UpdateDownloadPanel } from './UpdateDownloadPanel';

export function AppUpdateDialog({
  state,
  open,
  onDismiss,
}: {
  state: AppUpdateState;
  open: boolean;
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open && element.isConnected) {
      element.showModal();
      contentRef.current?.focus({ preventScroll: true });
    }
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <dialog
      ref={dialog}
      id="app-update-dialog"
      aria-labelledby="update-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onDismiss();
      }}
      className="tm-dialog m-auto w-[calc(100vw-1.5rem)] max-w-[420px] max-h-[88dvh] overflow-y-auto overscroll-contain rounded-3xl border-[var(--tm-border-accent)] p-0"
    >
      <div ref={contentRef} tabIndex={-1} className="p-5 focus:outline-none">
        <div className="flex items-start justify-between gap-3 mb-3.5">
          <div className="min-w-0 flex-1">
            <div
              className="w-10 h-10 rounded-2xl bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] flex items-center justify-center text-[var(--tm-accent-text)] mb-3"
              aria-hidden="true"
            >
              <Download className="w-5 h-5" />
            </div>
            <h2 id="update-dialog-title" className="text-lg font-bold text-[var(--tm-text-primary)] tracking-tight">
              发现新版本 {state.latestVersion}
            </h2>
            <p className="text-xs text-[var(--tm-text-muted)] mt-1 tabular-nums">
              当前版本 {state.currentVersion}
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭更新提示"
            onClick={onDismiss}
            className="w-11 h-11 -mr-1.5 -mt-1 rounded-full flex items-center justify-center text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)] hover:bg-[var(--tm-bg-control-hover)] active:scale-95 transition-all shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="glass-inset rounded-2xl p-3.5 mb-4">
          <p className="whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-xs leading-relaxed text-[var(--tm-text-secondary)] select-text">
            {state.notes || '此版本包含功能改进和问题修复。'}
          </p>
        </div>

        <UpdateDownloadPanel state={state} idPrefix="dialog-" />

        <button
          type="button"
          onClick={onDismiss}
          className="w-full min-h-[44px] mt-2.5 rounded-2xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.98] border border-[var(--tm-border-default)] text-xs font-medium text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] transition-all"
        >
          稍后再说
        </button>

        <p className="text-[11.5px] text-[var(--tm-text-muted)] leading-relaxed mt-3 text-center">
          安装前会校验文件、版本与官方签名，最后由系统确认安装。
        </p>
      </div>
    </dialog>
  );
}
