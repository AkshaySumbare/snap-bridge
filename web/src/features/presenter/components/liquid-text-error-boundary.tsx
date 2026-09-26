/**
 * Keeps a Presenter failure inside Presenter.
 *
 * A render exception anywhere in the reader — a page whose geometry is
 * malformed, a connector measuring against a node that has gone — otherwise
 * bubbles to the app's root boundary and replaces the entire workspace with
 * "Something went wrong". The reader loses the nav, the case, and any sense
 * of what they were doing.
 *
 * Two things this offers that the root boundary cannot:
 *
 *   - **The real message.** Field reports carry the actual cause rather than
 *     a dead page, which is the difference between a fixable bug report and
 *     "it broke".
 *   - **Recovery without a reload.** Remounting is usually enough, because
 *     the store survives and the next render starts from server state again.
 *
 * Annotations are not at risk here: everything the reader has done is already
 * in the store and pushed by the sync loop, which lives above this boundary.
 */

import { AlertCircle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class LiquidTextErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The component stack is the useful half — it says which pane failed, and
    // is lost by the time this reaches any reporting layer.
    void error;
    void info;
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-surface-base p-8 text-center">
        <AlertCircle className="h-6 w-6 text-status-danger" />
        <p className="text-sm font-medium text-foreground">Presenter hit an error.</p>
        <p className="max-w-md break-words text-xs text-text-muted">
          {error.message || "Unknown error"}
        </p>
        <p className="max-w-md text-xs text-text-muted">
          Your points and highlights are saved — they are kept on the server, not on this screen.
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    );
  }
}
