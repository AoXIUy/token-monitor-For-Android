import React from 'react';
import { AlertTriangle, RotateCcw, Settings } from 'lucide-react';

interface ErrorBoundaryProps {
  onOpenSettings?: () => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  resetKey: number;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '', resetKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error?.message ? String(error.message).slice(0, 160) : '界面渲染发生异常',
    };
  }

  render() {
    if (!this.state.hasError) {
      return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
    }
    return (
      <div className="min-h-screen bg-[var(--tm-bg-canvas)] text-[var(--tm-text-primary)] flex items-center justify-center p-5">
        <section
          role="alert"
          className="w-full max-w-[400px] glass-panel rounded-3xl p-6 text-center space-y-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-[var(--tm-warning-soft-bg)] border border-[var(--tm-warning-soft-border)] flex items-center justify-center text-[var(--tm-warning)] mx-auto">
            <AlertTriangle className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-base font-bold text-[var(--tm-text-primary)]">界面暂时无法显示</h1>
            <p className="text-xs text-[var(--tm-text-muted)] leading-relaxed break-words">
              {this.state.errorMessage || '发生意外渲染错误，请尝试重新加载视图。'}
            </p>
          </div>
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() =>
                this.setState((prev) => ({
                  hasError: false,
                  errorMessage: '',
                  resetKey: prev.resetKey + 1,
                }))
              }
              className="w-full min-h-[44px] rounded-2xl [background-image:var(--tm-accent-gradient)] text-[var(--tm-text-inverse)] font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.985] transition-transform"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>重新加载视图</span>
            </button>
            {this.props.onOpenSettings && (
              <button
                type="button"
                onClick={() => {
                  this.props.onOpenSettings?.();
                  this.setState((prev) => ({
                    hasError: false,
                    errorMessage: '',
                    resetKey: prev.resetKey + 1,
                  }));
                }}
                className="w-full min-h-[44px] rounded-2xl glass-inset text-[var(--tm-accent-text)] font-semibold text-xs flex items-center justify-center gap-2 active:scale-[0.985] transition-transform"
              >
                <Settings className="w-4 h-4" aria-hidden="true" />
                <span>返回连接设置</span>
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }
}
