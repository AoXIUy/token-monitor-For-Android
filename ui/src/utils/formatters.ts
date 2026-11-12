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
  opencode: 'OpenCode',
  cursor: 'Cursor',
  antigravity: 'Antigravity',
  cline: 'Cline',
  factory: 'Factory Droid',
  kimi: 'Kimi',
  grok: 'Grok',
  copilot: 'GitHub Copilot',
  zed: 'Zed',
  commandcode: 'Command Code',
  mimo: 'MiMo',
  muse: 'Muse Code',
  zai: 'GLM',
  zaiteam: 'GLM Team',
  kiro: 'Kiro',
  workbuddy: 'WorkBuddy',
  qoder: 'Qoder',
  deepseek: 'DeepSeek',
  devin: 'Devin',
  minimax: 'MiniMax',
  mcode: 'MiniMax Code',
  mistral: 'Mistral',
  typesafe: 'TypeSafe',
  openrouter: 'OpenRouter',
  volcengine: 'Volcengine',
  ollama: 'Ollama',
  trae: 'Trae CN',
  alibaba: 'Alibaba Cloud',
  stepfun: 'StepFun',
  notion: 'Notion AI',
  manus: 'Manus',
  hark: 'Hark',
  opendesign: 'OpenDesign',
  thirdparty: 'Third-party APIs',
  gemini: 'Gemini',
};

export function providerName(id?: string): string {
  if (!id) return '未知工具';
  return PROVIDER_LABELS[id] || id;
}

export function clientName(id?: string): string { return MonitorModel.clientLabel(id); }

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
    case 'zed':
    case 'opencode':
      return {
        text: 'text-indigo-300',
        dot: 'bg-indigo-400',
        bar: 'from-indigo-400 to-blue-400',
        tint: 'bg-indigo-500/12 border-indigo-400/25 text-indigo-300',
      };
    case 'deepseek':
    case 'qoder':
    case 'mimo':
      return {
        text: 'text-teal-300',
        dot: 'bg-teal-400',
        bar: 'from-teal-400 to-emerald-400',
        tint: 'bg-teal-500/12 border-teal-400/25 text-teal-300',
      };
    case 'openrouter':
    case 'alibaba':
    case 'mistral':
      return {
        text: 'text-amber-300',
        dot: 'bg-amber-400',
        bar: 'from-amber-400 to-orange-400',
        tint: 'bg-amber-500/12 border-amber-400/25 text-amber-300',
      };
    case 'minimax':
    case 'kimi':
    case 'trae':
      return {
        text: 'text-rose-300',
        dot: 'bg-rose-400',
        bar: 'from-rose-400 to-pink-400',
        tint: 'bg-rose-500/12 border-rose-400/25 text-rose-300',
      };
    case 'zai':
    case 'zaiteam':
    case 'volcengine':
    case 'commandcode':
    case 'hark':
      return {
        text: 'text-blue-300',
        dot: 'bg-blue-400',
        bar: 'from-blue-400 to-cyan-400',
        tint: 'bg-blue-500/12 border-blue-400/25 text-blue-300',
      };
    case 'kiro':
    case 'cline':
    case 'factory':
    case 'opendesign':
    case 'muse':
      return {
        text: 'text-fuchsia-300',
        dot: 'bg-fuchsia-400',
        bar: 'from-fuchsia-400 to-violet-400',
        tint: 'bg-fuchsia-500/12 border-fuchsia-400/25 text-fuchsia-300',
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

export function formatRelativeCountdown(value?: string | number | null, nowMs: number = Date.now()): string {
  if (value === undefined || value === null || value === '') return '';
  const target = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(target)) return '';
  const diffMs = target - nowMs;
  if (diffMs <= 0) return '即将重置';
  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes < 1) return '不到 1 分钟';
  if (totalMinutes < 60) return `${totalMinutes} 分钟后`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours < 24) return mins > 0 ? `${hours} 小时 ${mins} 分后` : `${hours} 小时后`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days} 天 ${remHours} 小时后` : `${days} 天后`;
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

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to selection copy when WebView clipboard API rejects
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}
