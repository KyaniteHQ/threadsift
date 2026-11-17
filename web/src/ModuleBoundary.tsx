import { Component, type ReactNode } from "react";

import { ModuleUnavailable } from "./module-unavailable.ts";
import { Unreachable } from "./Unreachable.tsx";

interface BoundaryState {
  readonly error: Error | null;
}

export class ModuleBoundary extends Component<Readonly<{ children: ReactNode }>, BoundaryState> {
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

    if (!(error instanceof ModuleUnavailable)) throw error;

    return <Unreachable retry={this.retry} />;
  }
}
