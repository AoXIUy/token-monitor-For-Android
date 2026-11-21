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

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
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
      className="tm-dialog m-auto w-[calc(100vw-1.5rem)] max-w-[420px] max-h-[88dvh] overflow-y-auto overscroll-contain rounded-3xl border-sky-400/25 p-5"
    >
      <div className="flex items-start justify-between gap-3 mb-3.5">
        <div className="min-w-0 flex-1">
          <div
            className="w-10 h-10 rounded-2xl bg-sky-500/14 border border-sky-400/30 flex items-center justify-center text-sky-300 mb-3"
            aria-hidden="true"
          >
            <Download className="w-5 h-5" />
          </div>
          <h2 id="update-dialog-title" className="text-lg font-bold text-white tracking-tight">
            发现新版本 {state.latestVersion}
          </h2>
          <p className="text-xs text-slate-400 mt-1 tabular-nums">
            当前版本 {state.currentVersion}
          </p>
        </div>
        <button
          type="button"
          aria-label="关闭更新提示"
          onClick={onDismiss}
          className="w-11 h-11 -mr-1.5 -mt-1 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="glass-inset rounded-2xl p-3.5 mb-4">
        <p className="whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-xs leading-relaxed text-slate-200 select-text">
          {state.notes || '此版本包含功能改进和问题修复。'}
        </p>
      </div>

      <UpdateDownloadPanel state={state} idPrefix="dialog-" />

      <button
        type="button"
        onClick={onDismiss}
        className="w-full min-h-[44px] mt-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] active:scale-[0.98] border border-white/[0.08] text-xs font-medium text-slate-300 hover:text-slate-100 transition-all"
      >
        稍后再说
      </button>

      <p className="text-[11px] text-slate-400 leading-relaxed mt-3 text-center">
        安装前会校验文件、版本与官方签名，最后由系统确认安装。
      </p>
    </dialog>
  );
}
