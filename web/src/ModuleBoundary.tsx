import { Component, type ComponentType, type ReactNode, lazy } from "react";

import { ModuleUnavailable, unavailable } from "./module-unavailable.ts";

export function lazyModule<Props extends object>(load: () => Promise<ComponentType<Props>>) {
  return lazy(() => load().then((component) => ({ default: component }), unavailable));
}

interface BoundaryState {
  readonly error: Error | null;
}

export class ModuleBoundary extends Component<
  Readonly<{ fallback: (retry: () => void) => ReactNode; children: ReactNode }>,
  BoundaryState
> {
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

    return this.props.fallback(this.retry);
  }
}
