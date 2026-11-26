import { MonitorModel } from '../model/monitorModel';
import { LimitProvider, PageId, PeriodId } from '../types/monitor';

export const PAGE_LABELS: Record<PageId, string> = {
  overview: '用量总览',
  devices: '我的设备',
  limits: '额度与订阅',
  sessions: '会话与状态',
  sessionDetail: '会话详情',
  reports: '分析报告',
  settings: '连接 Hub',
};

export const PERIOD_LABELS: Record<PeriodId, string> = {
  today: '今日',
  yesterday: '昨日',
  week: '本周',
  last7: '近7天',
  month: '本月',
  last30: '近30天',
  allTime: '累计',
};

export const PERIOD_SHORT_LABELS: Record<PeriodId, string> = {
  today: '今日',
  yesterday: '昨日',
  week: '本周',
  last7: '7天',
  month: '本月',
  last30: '30天',
  allTime: '累计',
};

export const ALL_PERIOD_OPTIONS: PeriodId[] = [
  'today',
  'yesterday',
  'week',
  'last7',
  'month',
  'last30',
  'allTime',
];

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
} {
  switch (client) {
    case 'claude':
    case 'stepfun':
      return {
        text: 'tm-tone-violet',
        dot: 'bg-violet-500',
        bar: 'from-violet-500 to-fuchsia-500',
      };
    case 'cursor':
      return {
        text: 'tm-tone-sky',
        dot: 'bg-sky-500',
        bar: 'from-sky-500 to-cyan-400',
      };
    case 'codex':
    case 'junie':
    case 'opencodereview':
    case 'ollama':
      return {
        text: 'tm-tone-emerald',
        dot: 'bg-emerald-500',
        bar: 'from-emerald-500 to-teal-400',
      };
    case 'antigravity':
    case 'devin':
      return {
        text: 'tm-tone-cyan',
        dot: 'bg-cyan-500',
        bar: 'from-cyan-500 to-sky-500',
      };
    case 'copilot':
    case 'zed':
    case 'opencode':
    case 'typesafe':
      return {
        text: 'tm-tone-indigo',
        dot: 'bg-indigo-500',
        bar: 'from-indigo-500 to-blue-500',
      };
    case 'deepseek':
    case 'qoder':
    case 'qodercn':
    case 'mimo':
    case 'workbuddy':
      return {
        text: 'tm-tone-teal',
        dot: 'bg-teal-500',
        bar: 'from-teal-500 to-emerald-500',
      };
    case 'openrouter':
    case 'alibaba':
    case 'mistral':
    case 'thirdparty':
      return {
        text: 'tm-tone-amber',
        dot: 'bg-amber-500',
        bar: 'from-amber-500 to-orange-500',
      };
    case 'grok':
      return {
        text: 'tm-tone-orange',
        dot: 'bg-orange-500',
        bar: 'from-orange-500 to-amber-500',
      };
    case 'minimax':
    case 'mcode':
    case 'kimi':
    case 'trae':
    case 'manus':
      return {
        text: 'tm-tone-rose',
        dot: 'bg-rose-500',
        bar: 'from-rose-500 to-pink-500',
      };
    case 'gemini':
    case 'zai':
    case 'zaiteam':
    case 'volcengine':
    case 'commandcode':
    case 'hark':
      return {
        text: 'tm-tone-blue',
        dot: 'bg-blue-500',
        bar: 'from-blue-500 to-cyan-500',
      };
    case 'kiro':
    case 'cline':
    case 'factory':
    case 'opendesign':
    case 'muse':
      return {
        text: 'tm-tone-fuchsia',
        dot: 'bg-fuchsia-500',
        bar: 'from-fuchsia-500 to-violet-500',
      };
    case 'notion':
      return {
        text: 'tm-tone-slate',
        dot: 'bg-slate-400',
        bar: 'from-slate-400 to-sky-400',
      };
    default:
      return {
        text: 'tm-tone-slate',
        dot: 'bg-slate-400',
        bar: 'from-sky-500 to-emerald-500',
      };
  }
}

const LIMIT_STATUS_LABELS: Record<string, string> = {
  ok: '正常',
  checking: '检查中…',
  unavailable: '读取失败',
  unauthorized: '需重新登录',
  authExpired: '需重新登录',
  unconfigured: '未配置',
  notConfigured: '未配置',
  disabled: '已停用',
  rateLimited: '已限流',
  sourceRateLimited: '查询受限',
  stale: '读数已过期',
  error: '读取失败',
};

export function limitStatusLabel(
  target?: Pick<LimitProvider, 'provider' | 'source' | 'status' | 'stale'> | string | null,
): string {
  if (!target) return '状态未知';
  if (typeof target === 'string') {
    return LIMIT_STATUS_LABELS[target] || target;
  }
  if (target.stale) return '读数已过期';
  if (target.provider === 'minimax' && target.source === 'oauth' && target.status === 'notConfigured') {
    return '需登录 Code';
  }
  if (target.provider === 'minimax' && target.source === 'api' && target.status === 'unauthorized') {
    return 'API 凭据失效';
  }
  const status = target.status || '';
  return LIMIT_STATUS_LABELS[status] || status || '状态未知';
}

export function formatRelativeCountdown(
  value?: string | number | null,
  nowMs: number = Date.now(),
  expiredLabel: string = '即将重置',
): string {
  if (value === undefined || value === null || value === '') return '';
  const target = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(target)) return '';
  const diffMs = target - nowMs;
  if (diffMs <= 0) return expiredLabel;
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
    if (typeof window !== 'undefined' && window.HubNative?.copyText) {
      if (window.HubNative.copyText(text)) return true;
    }
  } catch {
    // Fall through to web clipboard APIs if the native bridge call fails
  }
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
