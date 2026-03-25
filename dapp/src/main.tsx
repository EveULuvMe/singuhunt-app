import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { EveFrontierProvider } from "@evefrontier/dapp-kit";
import "./main.css";
import App from "./App.tsx";

const queryClient = new QueryClient();

class RootErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { error: string | null }
> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app">
          <div className="bulletin-board">
            <h3>CLIENT ERROR</h3>
            <p className="error-text">{this.state.error}</p>
            <p className="hint">
              If this appears inside EVE, reload the gate URL with the latest
              `?v=2` suffix.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <EveFrontierProvider queryClient={queryClient}>
        <App />
      </EveFrontierProvider>
    </RootErrorBoundary>
  </React.StrictMode>,
);
