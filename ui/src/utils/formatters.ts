import { MonitorModel } from '../model/monitorModel';
import { PageId, PeriodId } from '../types/monitor';

export const PAGE_LABELS: Record<PageId, string> = {
  overview: '用量总览',
  devices: '我的设备',
  limits: '额度与订阅',
  sessions: '会话与状态',
  sessionDetail: '会话详情',
  settings: '连接 Hub',
};

export const PERIOD_LABELS: Record<PeriodId, string> = {
  today: '今日',
  month: '本月',
  allTime: '累计',
};

export const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  copilot: 'GitHub Copilot',
  deepseek: 'DeepSeek',
  opencode: 'OpenCode',
  antigravity: 'Antigravity',
  openrouter: 'OpenRouter',
  muse: 'Muse Code',
  ollama: 'Ollama',
};

export function providerName(id?: string): string {
  if (!id) return '未知工具';
  return PROVIDER_LABELS[id] || id;
}

export function clientTone(client?: string): {
  text: string;
  dot: string;
  bar: string;
  tint: string;
} {
  switch (client) {
    case 'claude':
      return {
        text: 'text-violet-300',
        dot: 'bg-violet-400',
        bar: 'from-violet-400 to-fuchsia-400',
        tint: 'bg-violet-500/12 border-violet-400/25 text-violet-300',
      };
    case 'cursor':
      return {
        text: 'text-sky-300',
        dot: 'bg-sky-400',
        bar: 'from-sky-400 to-cyan-300',
        tint: 'bg-sky-500/12 border-sky-400/25 text-sky-300',
      };
    case 'codex':
      return {
        text: 'text-emerald-300',
        dot: 'bg-emerald-400',
        bar: 'from-emerald-400 to-teal-300',
        tint: 'bg-emerald-500/12 border-emerald-400/25 text-emerald-300',
      };
    case 'antigravity':
      return {
        text: 'text-cyan-300',
        dot: 'bg-cyan-400',
        bar: 'from-cyan-400 to-sky-400',
        tint: 'bg-cyan-500/14 border-cyan-400/30 text-cyan-200',
      };
    case 'copilot':
      return {
        text: 'text-indigo-300',
        dot: 'bg-indigo-400',
        bar: 'from-indigo-400 to-blue-400',
        tint: 'bg-indigo-500/12 border-indigo-400/25 text-indigo-300',
      };
    case 'deepseek':
      return {
        text: 'text-teal-300',
        dot: 'bg-teal-400',
        bar: 'from-teal-400 to-emerald-400',
        tint: 'bg-teal-500/12 border-teal-400/25 text-teal-300',
      };
    case 'openrouter':
      return {
        text: 'text-amber-300',
        dot: 'bg-amber-400',
        bar: 'from-amber-400 to-orange-400',
        tint: 'bg-amber-500/12 border-amber-400/25 text-amber-300',
      };
    default:
      return {
        text: 'text-slate-300',
        dot: 'bg-slate-400',
        bar: 'from-sky-400 to-emerald-400',
        tint: 'bg-white/6 border-white/12 text-slate-300',
      };
  }
}

export function formatShortTime(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '未知';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '未知';
}

export function formatFullTime(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('zh-CN', { hour12: false })
    : '—';
}

export function formatExact(value: unknown): string {
  return MonitorModel.numeric(value) === null
    ? '—'
    : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
}
