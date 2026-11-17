import { useCallback, useState } from "react";

import { logOut } from "./access-api.ts";
import { SETTINGS } from "./access-text.ts";
import { ObsidianLink } from "./ObsidianPage.tsx";
import { PageBar } from "./PageBar.tsx";
import { SettingsSections } from "./SettingsSections.tsx";
import { useHashTarget } from "./use-hash-target.ts";
import { useSettingsLoad } from "./use-settings-load.ts";

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
  const loaded = useSettingsLoad();

  useHashTarget(loaded !== null);

  const [failed, setFailed] = useState(false);

  const signOut = useCallback(() => {
    setFailed(false);
    logOut().then(loggedOut, () => {
      setFailed(true);
    });
  }, [loggedOut]);

  return (
    <div className="pg">
      <PageBar title={SETTINGS.title} back={back} />
      <main className="pg-col" aria-busy={loaded === null}>
        {loaded === null ? (
          <Loading />
        ) : (
          <>
            <ObsidianLink />
            <SettingsSections loaded={loaded} signOut={signOut} signOutFailed={failed} />
          </>
        )}
      </main>
    </div>
  );
}
