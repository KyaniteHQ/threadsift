import { useCallback, useRef, useState } from "react";

import { logOut } from "./access-api.ts";
import { SETTINGS } from "./access-text.ts";
import { PageBar } from "./PageBar.tsx";
import { SettingsSections } from "./SettingsSections.tsx";
import { SETTINGS_READ_MS, useSettingsLoad } from "./use-settings-load.ts";

function Loading() {
  return (
    <div className="pg-ghost it-ghost" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
}

export function SettingsPage({
  back,
  loggedOut,
}: Readonly<{ back: () => void; loggedOut: () => void }>) {
  const column = useRef<HTMLElement>(null);
  const loaded = useSettingsLoad(column);

  const [failed, setFailed] = useState(false);

  const signOut = useCallback(() => {
    setFailed(false);
    logOut().then(loggedOut, () => {
      setFailed(true);
    });
  }, [loggedOut]);

  return (
    <div className="pg">
      <PageBar title={SETTINGS.title} back={back} faceWaitMs={SETTINGS_READ_MS} />
      <main ref={column} className="pg-col" aria-busy={loaded === null}>
        {loaded === null ? (
          <Loading />
        ) : (
          <SettingsSections loaded={loaded} signOut={signOut} signOutFailed={failed} />
        )}
      </main>
    </div>
  );
}
