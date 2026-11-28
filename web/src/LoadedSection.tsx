import { type ReactNode, useCallback } from "react";

import { Alert } from "./Alert.tsx";
import type { Loaded } from "./settings-load-types.ts";
import { SettingsSection } from "./SettingsSection.tsx";
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
}: Readonly<SectionSpec<View> & { initial: Loaded<View>; after?: (view: View) => void }>) {
  const { loaded, ready } = useLoaded(initial);

  const changed = useCallback(
    (view: View) => {
      ready(view);
      after?.(view);
    },
    [ready, after],
  );

  return (
    <SettingsSection id={id} title={title} intro={intro}>
      {lead}
      {loaded.kind === "ready" ? (
        <Form view={loaded.view} changed={changed} />
      ) : (
        <Alert text={loadFailed} />
      )}
      {foot}
    </SettingsSection>
  );
}
