import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

/** Keep a render failure actionable instead of replacing the entire app with white. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Aether Map editor failed", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="map-crash" role="alert">
      <div className="map-crash-card">
        <img src="./favicon.ico" alt="" width="40" height="40" />
        <h1>Aether Map needs to reopen this workspace</h1>
        <p>Your latest document edits are held by autosave. Reopen the workspace to continue.</p>
        <button type="button" onClick={() => location.reload()}>Reopen workspace</button>
        <details><summary>Technical detail</summary><code>{this.state.error.message}</code></details>
      </div>
    </main>;
  }
}
