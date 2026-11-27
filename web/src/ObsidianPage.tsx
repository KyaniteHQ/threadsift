import type { VaultView } from "../../src/core/contract/vault-contract.ts";
import { Alert } from "./Alert.tsx";
import { fetchObsidian } from "./obsidian-api.ts";
import { OBSIDIAN_TEXT as TEXT } from "./obsidian-text.ts";
import { ObsidianForm } from "./ObsidianForm.tsx";
import { PageFrame } from "./PageFrame.tsx";
import { PageGhost } from "./PageGhost.tsx";
import type { Loaded } from "./settings-load-types.ts";
import { useRead } from "./use-read.ts";
import { useLoaded } from "./use-settings-load.ts";

const FAILED: Loaded<VaultView> = { kind: "failed" };

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
    <PageFrame title={TEXT.title} back="settings">
      <main className="pg-col" aria-busy={loaded === null}>
        {loaded === null ? <PageGhost /> : <ObsidianLoaded initial={loaded} />}
      </main>
    </PageFrame>
  );
}
