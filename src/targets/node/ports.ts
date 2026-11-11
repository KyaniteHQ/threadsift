import type { Database, Ports } from "../../core/ports.ts";
import { aiRuntime } from "../shared/ai-runtime.ts";
import { configuredCode, configuredOrigin } from "../shared/configured-code.ts";
import { nodeCrypto } from "../shared/crypto.ts";
import { dataFileStore } from "./file-store.ts";
import { JobLoop } from "./job-loop.ts";
import { nodeNetwork } from "./network.ts";
import { type OperatorCodeOptions, startOperatorCode } from "./operator-code.ts";
import { WorkerPageReader } from "./page-reader.ts";
import { setupCodeOf } from "./setup-code.ts";

interface NodeRuntime {
  readonly ports: Ports;
  readonly stop: () => Promise<void>;
}

export interface NodeOptions extends OperatorCodeOptions {
  readonly dataDir: string;
  readonly setupCode: string | undefined;
  readonly secretKey: string | undefined;
  readonly resetCode: string | undefined;
  readonly publicOrigin: string | undefined;
}

export async function startNode(
  db: Database,
  options: Readonly<NodeOptions>,
): Promise<NodeRuntime> {
  const { dataDir, setupCode, secretKey, resetCode, publicOrigin, fetchers, claude, codex } =
    options;

  const operator = await startOperatorCode({ fetchers, claude, codex });
  const loop = new JobLoop();
  const pages = new WorkerPageReader();

  const ports: Ports = {
    db,
    files: dataFileStore(dataDir),
    ai: await aiRuntime({ publicOnly: false, secretKey, request: fetch, cli: operator.cli }),
    network: nodeNetwork,
    pages,
    jobs: loop.queue,
    crypto: nodeCrypto,
    setupCode: await setupCodeOf(db, configuredCode(setupCode)),
    resetCode: configuredCode(resetCode),
    publicOrigin: configuredOrigin(publicOrigin),
    fetchers: operator.fetchers,
  };

  await loop.start(ports);

  return {
    ports,
    stop: async () => {
      const drained = loop.stop();

      for (const runner of operator.cli) runner.stop();

      await drained;
      pages.stop();
    },
  };
}
