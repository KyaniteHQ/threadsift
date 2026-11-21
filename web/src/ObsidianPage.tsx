import type { VaultView } from "../../src/core/contract/vault-contract.ts";
import { Alert } from "./Alert.tsx";
import { fetchObsidian } from "./obsidian-api.ts";
import { OBSIDIAN_TEXT as TEXT } from "./obsidian-text.ts";
import { ObsidianForm } from "./ObsidianForm.tsx";
import { PageBar } from "./PageBar.tsx";
import { PageGhost } from "./PageGhost.tsx";
import { SETTINGS_PATH } from "./routing.ts";
import type { Loaded } from "./settings-load-types.ts";
import { useRead } from "./use-read.ts";
import { useLoaded } from "./use-settings-load.ts";

const FAILED: Loaded<VaultView> = { kind: "failed" };

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

async function readObsidian(signal: AbortSignal): Promise<Loaded<VaultView>> {
  return { kind: "ready", view: await fetchObsidian(signal) };
}

export function ObsidianPage() {
  const loaded = useRead<Loaded<VaultView> | null>(readObsidian, null, FAILED);

  return (
    <div className="pg">
      <PageBar title={TEXT.title} backLink={SETTINGS_BACK} />
      <main className="pg-col" aria-busy={loaded === null}>
        {loaded === null ? <PageGhost /> : <ObsidianLoaded initial={loaded} />}
      </main>
    </div>
  );
}
