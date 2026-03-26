"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          padding: "20px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12,
          textAlign: "center",
          margin: "8px 0",
        }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
            Something went wrong loading this section.
          </div>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              fontSize: 11,
              color: "#E84855",
              background: "rgba(232,72,85,0.1)",
              border: "1px solid rgba(232,72,85,0.2)",
              borderRadius: 8,
              padding: "6px 16px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
