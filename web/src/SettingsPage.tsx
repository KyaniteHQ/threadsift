import { SETTINGS } from "./access-text.ts";
import { PageFrame } from "./PageFrame.tsx";
import { PageGhost } from "./PageGhost.tsx";
import { SettingsRail } from "./SettingsRail.tsx";
import { SettingsSections } from "./SettingsSections.tsx";
import { useHashTarget } from "./use-hash-target.ts";
import { useSettingsLoad } from "./use-settings-load.ts";

export function SettingsPage() {
  const loaded = useSettingsLoad();

  useHashTarget(loaded !== null);

  return (
    <PageFrame title={SETTINGS.title} column="settings">
      <div className="pg-col st-page">
        <SettingsRail />
        <main className="st-main" aria-busy={loaded === null}>
          {loaded === null ? <PageGhost /> : <SettingsSections loaded={loaded} />}
        </main>
      </div>
    </PageFrame>
  );
}
