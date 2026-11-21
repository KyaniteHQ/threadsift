import { SETTINGS } from "./access-text.ts";
import { ObsidianLink } from "./ObsidianLink.tsx";
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

export function SettingsPage({ loggedOut }: Readonly<{ loggedOut: () => void }>) {
  const loaded = useSettingsLoad();

  useHashTarget(loaded !== null);

  return (
    <div className="pg">
      <PageBar title={SETTINGS.title} />
      <main className="pg-col" aria-busy={loaded === null}>
        {loaded === null ? (
          <Loading />
        ) : (
          <>
            <ObsidianLink />
            <SettingsSections loaded={loaded} loggedOut={loggedOut} />
          </>
        )}
      </main>
    </div>
  );
}
