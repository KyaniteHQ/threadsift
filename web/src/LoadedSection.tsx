import { type ReactNode, useCallback } from "react";

import { Alert } from "./Alert.tsx";
import type { Loaded } from "./settings-load-types.ts";
import { useLoaded } from "./use-settings-load.ts";

export interface SectionSpec<View> {
  readonly id: string;
  readonly title: string;
  readonly intro: string;
  readonly loadFailed: string;
  readonly lead?: ReactNode;
  readonly foot?: ReactNode;
  readonly Form: (props: Readonly<{ view: View; changed: (view: View) => void }>) => ReactNode;
}

export function LoadedSection<View>({
  id,
  title,
  intro,
  loadFailed,
  lead,
  foot,
  initial,
  after,
  Form,
}: Readonly<SectionSpec<View> & { initial: Loaded<View>; after?: () => void }>) {
  const { loaded, ready } = useLoaded(initial);

  const changed = useCallback(
    (view: View) => {
      ready(view);
      after?.();
    },
    [ready, after],
  );

  return (
    <section id={id} className="sec" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="rd-h" tabIndex={-1}>
        {title}
      </h2>
      <p>{intro}</p>
      {lead}
      {loaded.kind === "ready" ? (
        <Form view={loaded.view} changed={changed} />
      ) : (
        <Alert text={loadFailed} />
      )}
      {foot}
    </section>
  );
}
