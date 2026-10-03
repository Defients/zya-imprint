import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryKey: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, retryKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`ErrorBoundary${this.props.label ? ` (${this.props.label})` : ""} caught:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-[28px] border border-red-500/30 bg-red-500/5 p-8 text-center">
          <div className="text-4xl">💥</div>
          <h3 className="text-xl font-black text-white">
            {this.props.label ? `${this.props.label} crashed` : "Something went wrong"}
          </h3>
          <p className="max-w-md text-sm leading-6 text-slate-300">
            {this.state.error?.message || "An unexpected error occurred in this panel."}
          </p>
          <button
            className="cosmo-btn cosmo-btn-primary rounded-2xl px-5 py-2.5 text-sm font-bold"
            onClick={() => this.setState({ hasError: false, error: null, retryKey: this.state.retryKey + 1 })}
          >
            Reload panel
          </button>
        </div>
      );
    }

    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}
