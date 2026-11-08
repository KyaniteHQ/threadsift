import { Component, type ReactNode } from "react";

import { PostTextUnavailable } from "./post-text-module.ts";
import { POST_TEXT_FAILED } from "./reader-text.ts";
import { RETRY_LABEL } from "./text.ts";

interface BoundaryState {
  readonly error: Error | null;
}

export class PostTextBoundary extends Component<Readonly<{ children: ReactNode }>, BoundaryState> {
  static getDerivedStateFromError(error: Readonly<Error>): BoundaryState {
    return { error };
  }

  override state: BoundaryState = { error: null };

  private readonly retry = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    const { error } = this.state;

    if (error === null) return this.props.children;

    if (!(error instanceof PostTextUnavailable)) throw error;

    return (
      <div className="rd-orig" role="alert">
        <p className="rd-note">{POST_TEXT_FAILED}</p>
        <button type="button" className="btn btn-block" onClick={this.retry}>
          {RETRY_LABEL}
        </button>
      </div>
    );
  }
}
