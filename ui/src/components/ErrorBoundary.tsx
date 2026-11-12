import React from 'react';
import { AlertTriangle, RotateCcw, Settings } from 'lucide-react';

interface ErrorBoundaryProps {
  onOpenSettings?: () => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message ? String(error.message).slice(0, 160) : '界面渲染发生异常',
    };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-[#090C10] text-slate-100 flex items-center justify-center p-5">
        <section
          role="alert"
          className="w-full max-w-[400px] glass-panel rounded-3xl p-6 text-center space-y-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-amber-500/12 border border-amber-400/25 flex items-center justify-center text-amber-300 mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-base font-bold text-white">界面暂时无法显示</h1>
            <p className="text-xs text-slate-400 leading-relaxed break-words">
              {this.state.errorMessage || '发生意外渲染错误，请尝试重新加载视图。'}
            </p>
          </div>
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
              className="w-full min-h-[44px] rounded-2xl bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>重新加载视图</span>
            </button>
            {this.props.onOpenSettings && (
              <button
                type="button"
                onClick={() => {
                  this.props.onOpenSettings?.();
                  this.setState({ hasError: false, errorMessage: '' });
                }}
                className="w-full min-h-[44px] rounded-2xl glass-inset text-sky-300 font-semibold text-xs flex items-center justify-center gap-2"
              >
                <Settings className="w-4 h-4" />
                <span>返回连接设置</span>
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }
}
