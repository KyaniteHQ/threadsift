import { useEffect, useState } from "react";

import type { VaultView } from "../../src/core/contract/vault-contract.ts";
import { Alert } from "./Alert.tsx";
import { fetchObsidian } from "./obsidian-api.ts";
import { OBSIDIAN_TEXT as TEXT } from "./obsidian-text.ts";
import { ObsidianForm } from "./ObsidianForm.tsx";
import { PageBar } from "./PageBar.tsx";
import { SETTINGS_PATH } from "./routing.ts";
import type { Loaded } from "./settings-load-types.ts";
import { useLoaded } from "./use-settings-load.ts";

const SETTINGS_BACK = { href: SETTINGS_PATH, label: TEXT.backToSettings };

function ObsidianLoaded({ initial }: Readonly<{ initial: Loaded<VaultView> }>) {
  const { loaded, ready } = useLoaded(initial);
  return (
    <div className="sec">
      <p>
        {loaded.kind === "ready" && loaded.view.folderAvailable ? TEXT.containerIntro : TEXT.intro}
      </p>
      {loaded.kind === "ready" ? (
        <ObsidianForm view={loaded.view} changed={ready} />
      ) : (
        <Alert text={TEXT.loadFailed} />
      )}
    </div>
  );
}

export function ObsidianPage({ back }: Readonly<{ back: () => void }>) {
  const [loaded, setLoaded] = useState<Loaded<VaultView> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchObsidian(controller.signal).then(
      (view) => {
        if (!controller.signal.aborted) setLoaded({ kind: "ready", view });
        return null;
      },
      () => {
        if (!controller.signal.aborted) setLoaded({ kind: "failed" });
        return null;
      },
    );
    return () => {
      controller.abort();
    };
  }, []);
  return (
    <div className="pg">
      <PageBar title={TEXT.title} back={back} backLink={SETTINGS_BACK} />
      <main className="pg-col" aria-busy={loaded === null}>
        {loaded === null ? (
          <div className="pg-ghost it-ghost" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        ) : (
          <ObsidianLoaded initial={loaded} />
        )}
      </main>
    </div>
  );
}
