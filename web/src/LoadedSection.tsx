import type { ReactNode } from "react";

import { Alert } from "./Alert.tsx";
import { type Loaded, useLoaded } from "./use-settings-load.ts";

export type { Loaded };

export function LoadedSection<View>({
  id,
  title,
  intro,
  loadFailed,
  initial,
  form,
}: Readonly<{
  id: string;
  title: string;
  intro: string;
  loadFailed: string;
  initial: Loaded<View>;
  form: (view: View, changed: (view: View) => void) => ReactNode;
}>) {
  const { loaded, ready } = useLoaded(initial);

  return (
    <section className="sec" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="rd-h">
        {title}
      </h2>
      <p>{intro}</p>
      {loaded.kind === "ready" ? form(loaded.view, ready) : <Alert text={loadFailed} />}
    </section>
  );
}
