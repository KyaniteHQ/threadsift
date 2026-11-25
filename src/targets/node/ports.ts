import type { Database } from "../../core/kernel/database.ts";
import type { Ports } from "../../core/kernel/ports.ts";
import { portsOf } from "../shared/ports.ts";
import { settingsOf } from "../shared/settings.ts";
import type { NodeEnvironment } from "./environment.ts";
import { dataFileStore } from "./file-store.ts";
import { JobLoop } from "./job-loop.ts";
import { nodeNetwork } from "./network.ts";
import { startOperatorCode } from "./operator-code.ts";
import { threadPageReader } from "./page-reader.ts";
import { setupCodeOf } from "./setup-code.ts";
import { vaultFolder } from "./vault-folder.ts";

interface NodeRuntime {
  readonly ports: Ports;
  readonly stop: () => Promise<void>;
}

export async function startNode(
  db: Database,
  { dataDir, variables, operator: operatorOptions }: Readonly<NodeEnvironment>,
): Promise<NodeRuntime> {
  const operator = await startOperatorCode(operatorOptions);
  const loop = new JobLoop(() => ports);
  const pages = threadPageReader();
  const files = dataFileStore(dataDir);
  const settings = settingsOf(variables);

  const ports = await portsOf(
    { ...settings, setupCode: await setupCodeOf(db, settings.setupCode) },
    {
      db,
      files,
      network: nodeNetwork,
      vaultFolder,
      pages,
      jobs: loop.queue,
      fetchers: operator.fetchers,
      xFetcher: operator.xFetcher,
      ai: { publicOnly: false, request: fetch, binding: null, cli: operator.cli },
    },
  );

  await loop.start();

  return {
    ports,
    stop: async () => {
      const drained = loop.stop();

      operator.stop();

      await drained;
      pages.stop();
    },
  };
}
