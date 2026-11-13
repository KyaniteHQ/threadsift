import type { ReactNode } from "react";

import { Alert } from "./Alert.tsx";
import type { Loaded } from "./settings-load-types.ts";
import { useLoaded } from "./use-settings-load.ts";

export type { Loaded };

export interface SectionSpec<View> {
  readonly id: string;
  readonly title: string;
  readonly intro: string;
  readonly loadFailed: string;
  readonly lead?: ReactNode;
  readonly foot?: ReactNode;
  readonly form: (view: View, changed: (view: View) => void) => ReactNode;
}

export function LoadedSection<View>({
  id,
  title,
  intro,
  loadFailed,
  lead,
  foot,
  initial,
  form,
}: Readonly<SectionSpec<View> & { initial: Loaded<View> }>) {
  const { loaded, ready } = useLoaded(initial);

  return (
    <section id={id} className="sec" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="rd-h">
        {title}
      </h2>
      <p>{intro}</p>
      {lead}
      {loaded.kind === "ready" ? form(loaded.view, ready) : <Alert text={loadFailed} />}
      {foot}
    </section>
  );
}
