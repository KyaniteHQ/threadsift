import type { Database, Ports } from "../../core/ports.ts";
import { aiRuntime } from "../shared/ai-runtime.ts";
import { configuredCode } from "../shared/configured-code.ts";
import { nodeCrypto } from "../shared/crypto.ts";
import { type ClaudeEnvironment, claudeCode } from "./claude-code.ts";
import { dataFileStore } from "./file-store.ts";
import { JobLoop } from "./job-loop.ts";
import { nodeNetwork } from "./network.ts";
import { WorkerPageReader } from "./page-reader.ts";
import { setupCodeOf } from "./setup-code.ts";

interface NodeRuntime {
  readonly ports: Ports;
  readonly stop: () => Promise<void>;
}

export interface NodeOptions {
  readonly dataDir: string;
  readonly setupCode: string | undefined;
  readonly secretKey: string | undefined;
  readonly resetCode: string | undefined;
  readonly claude: Readonly<ClaudeEnvironment>;
}

export async function startNode(
  db: Database,
  options: Readonly<NodeOptions>,
): Promise<NodeRuntime> {
  const { dataDir, setupCode, secretKey, resetCode, claude } = options;
  const loop = new JobLoop();
  const pages = new WorkerPageReader();
  const cli = await claudeCode(claude);

  const ports: Ports = {
    db,
    files: dataFileStore(dataDir),
    ai: await aiRuntime({ publicOnly: false, secretKey, request: fetch, cli: cli ?? undefined }),
    network: nodeNetwork,
    pages,
    jobs: loop.queue,
    crypto: nodeCrypto,
    setupCode: await setupCodeOf(db, configuredCode(setupCode)),
    resetCode: configuredCode(resetCode),
  };

  await loop.start(ports);

  return {
    ports,
    stop: async () => {
      const drained = loop.stop();

      pages.stop();
      cli?.stop();
      await drained;
    },
  };
}
