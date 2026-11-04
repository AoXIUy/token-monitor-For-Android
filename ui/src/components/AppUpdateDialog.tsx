import { useEffect, useRef } from 'react';
import { Download, X } from 'lucide-react';
import type { AppUpdateState } from '../types/monitor';
import { UpdateDownloadPanel } from './UpdateDownloadPanel';

export function AppUpdateDialog({ state, open, onDismiss }: { state: AppUpdateState; open: boolean; onDismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog ref={dialog} id="app-update-dialog" aria-labelledby="update-dialog-title"
      onCancel={event => { event.preventDefault(); onDismiss(); }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-[400px] max-h-[85dvh] overflow-y-auto rounded-3xl border border-sky-400/25 bg-[#101923] p-5 text-slate-100 shadow-2xl backdrop:bg-black/75">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <Download className="w-6 h-6 text-sky-300 mb-3" />
          <h2 id="update-dialog-title" className="text-lg font-bold">发现新版本 {state.latestVersion}</h2>
          <p className="text-xs text-slate-400 mt-1">当前版本 {state.currentVersion}</p>
        </div>
        <button type="button" aria-label="关闭更新提示" onClick={onDismiss} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400"><X className="w-5 h-5" /></button>
      </div>
      <p className="whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-xs text-slate-300 leading-relaxed border-y border-white/10 py-3 mb-4">
        {state.notes || '此版本包含功能改进和问题修复。'}
      </p>
      <UpdateDownloadPanel state={state} idPrefix="dialog-" />
      <button type="button" onClick={onDismiss} className="w-full min-h-[44px] mt-2 text-xs text-slate-400">稍后再说</button>
      <p className="text-[11px] text-slate-400 leading-relaxed mt-2">安装前会校验文件、版本与官方签名，最后由系统确认安装。</p>
    </dialog>
  );
}
