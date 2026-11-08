import { useCallback, useRef, useState } from "react";

import { logOut } from "./access-api.ts";
import { SETTINGS } from "./access-text.ts";
import { useInternalLink } from "./routing.ts";
import { SettingsSections } from "./SettingsSections.tsx";
import { useBarFaces } from "./use-bar-faces.ts";
import { useFocusOnMount } from "./use-form.ts";
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
  signedOut,
}: Readonly<{ back: () => void; signedOut: () => void }>) {
  const titleField = useRef<HTMLHeadingElement>(null);
  const bar = useRef<HTMLElement>(null);
  const barFaces = useBarFaces(bar);

  useFocusOnMount(titleField);

  const follow = useInternalLink(back);

  const column = useRef<HTMLElement>(null);
  const loaded = useSettingsLoad(column);

  const [failed, setFailed] = useState(false);

  const signOut = useCallback(() => {
    setFailed(false);
    logOut().then(signedOut, () => {
      setFailed(true);
    });
  }, [signedOut]);

  return (
    <div className="pg">
      <header ref={bar} className="pg-bar" data-faces={barFaces ? "loaded" : "loading"}>
        <div className="pg-bar-in">
          <a className="btn" href="/" onClick={follow}>
            {SETTINGS.back}
          </a>
          <h1 ref={titleField} className="pg-title" tabIndex={-1}>
            {SETTINGS.title}
          </h1>
        </div>
      </header>
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
