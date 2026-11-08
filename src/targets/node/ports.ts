import type { Database, Ports } from "../../core/ports.ts";
import { aiRuntime } from "../shared/ai-runtime.ts";
import { configuredCode, configuredOrigin } from "../shared/configured-code.ts";
import { nodeCrypto } from "../shared/crypto.ts";
import { type CliEnvironments, startCliRunners } from "./cli-runners.ts";
import { dataFileStore } from "./file-store.ts";
import { JobLoop } from "./job-loop.ts";
import { nodeNetwork } from "./network.ts";
import { WorkerPageReader } from "./page-reader.ts";
import { setupCodeOf } from "./setup-code.ts";

interface NodeRuntime {
  readonly ports: Ports;
  readonly stop: () => Promise<void>;
}

export interface NodeOptions extends CliEnvironments {
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
  const { dataDir, setupCode, secretKey, resetCode, publicOrigin, claude, codex } = options;
  const loop = new JobLoop();
  const pages = new WorkerPageReader();
  const cli = await startCliRunners({ claude, codex });

  const ports: Ports = {
    db,
    files: dataFileStore(dataDir),
    ai: await aiRuntime({ publicOnly: false, secretKey, request: fetch, cli }),
    network: nodeNetwork,
    pages,
    jobs: loop.queue,
    crypto: nodeCrypto,
    setupCode: await setupCodeOf(db, configuredCode(setupCode)),
    resetCode: configuredCode(resetCode),
    publicOrigin: configuredOrigin(publicOrigin),
  };

  await loop.start(ports);

  return {
    ports,
    stop: async () => {
      const drained = loop.stop();

      for (const runner of cli) runner.stop();

      await drained;
      pages.stop();
    },
  };
}
