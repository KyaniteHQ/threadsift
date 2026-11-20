import type { Database } from "../src/core/kernel/database.ts";
import { sealedSecrets } from "../src/core/kernel/sealed-secret.ts";
import { readLinkedPage } from "../src/features/digest/core/digest-hop.ts";
import { digestInput } from "../src/features/digest/core/digest-input.ts";
import { modelInput } from "../src/features/digest/core/digest-model-input.ts";
import { cutDigestInput } from "../src/features/digest/core/digest-prompt.ts";
import { postTextOf } from "../src/features/thread/core/post-text.ts";
import { readCatalog } from "../src/features/wiki/core/catalog.ts";
import { dataFileStore } from "../src/targets/node/file-store.ts";
import { nodeNetwork } from "../src/targets/node/network.ts";
import { threadPageReader } from "../src/targets/node/page-reader.ts";

export async function libraryReader(dataDir: string) {
  const pages = threadPageReader();
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

      if (hop === null && !item.hasContent)
        return { kind: "unavailable", reason: "no-digest-content" } as const;
      const prompt = await modelInput(db, item, text, await readCatalog(db), hop);

      return prompt.kind === "ready"
        ? prompt
        : ({ kind: "unavailable", reason: "digest-input-too-large" } as const);
    },
  };
}
