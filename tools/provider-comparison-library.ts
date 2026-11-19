import { readCatalog } from "../src/core/catalog.ts";
import type { Database } from "../src/core/database.ts";
import { readLinkedPage } from "../src/core/digest-hop.ts";
import { hasContent } from "../src/core/digest-prepare.ts";
import { cutDigestInput } from "../src/core/digest-prompt.ts";
import { digestInput, modelInput } from "../src/core/digest-source.ts";
import { postTextOf } from "../src/core/post-text.ts";
import { sealedSecrets } from "../src/core/sealed-secret.ts";
import { dataFileStore } from "../src/targets/node/file-store.ts";
import { nodeNetwork } from "../src/targets/node/network.ts";
import { WorkerPageReader } from "../src/targets/node/page-reader.ts";

export async function libraryReader(dataDir: string) {
  const pages = new WorkerPageReader();
  const files = dataFileStore(dataDir);
  const secrets = await sealedSecrets(process.env["THREADSIFT_SECRET_KEY"]);

  return {
    stop: () => {
      pages.stop();
    },
    prepare: async (db: Database, itemId: number) => {
      const [item] = await digestInput(db, itemId);

      if (item === undefined) return { kind: "unavailable", reason: "item-not-found" } as const;
      const storedText = await postTextOf(files, itemId, item);

      if (item.postTextKey !== null && storedText === null)
        return { kind: "unavailable", reason: "post-text-unreadable" } as const;
      const text =
        item.postTextKey === null || storedText === null ? storedText : cutDigestInput(storedText);
      const hop =
        item.linkedUrl === null
          ? null
          : (await readLinkedPage({ db, pages, secrets, network: nodeNetwork }, item.linkedUrl))
              .page;

      if (hop === null && !hasContent(item))
        return { kind: "unavailable", reason: "no-digest-content" } as const;
      const prompt = await modelInput(db, item, text, await readCatalog(db), hop);

      return prompt.kind === "ready"
        ? prompt
        : ({ kind: "unavailable", reason: "digest-input-too-large" } as const);
    },
  };
}
