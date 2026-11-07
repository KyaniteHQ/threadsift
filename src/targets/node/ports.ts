import { randomSecret } from "../../core/encoding.ts";
import { hasOwner } from "../../core/owner.ts";
import type { Database, Ports } from "../../core/ports.ts";
import { aiRuntime } from "../shared/ai-runtime.ts";
import { configuredCode } from "../shared/configured-code.ts";
import { nodeCrypto } from "../shared/crypto.ts";
import { dataFileStore } from "./file-store.ts";
import { JobLoop } from "./job-loop.ts";
import { nodeNetwork } from "./network.ts";
import { WorkerPageReader } from "./page-reader.ts";

const GENERATED_CODE_BYTES = 32;

function printGeneratedCode(): string {
  const generated = randomSecret(nodeCrypto, GENERATED_CODE_BYTES);
  console.log(`Setup code: ${generated}`);

  return generated;
}

async function setupCodeOf(db: Database, configured: string | undefined) {
  if (configured !== undefined) {
    return configured;
  }

  return (await hasOwner(db)) ? undefined : printGeneratedCode();
}

interface NodeRuntime {
  readonly ports: Ports;
  readonly stop: () => void;
}

export async function startNode(
  db: Database,
  dataDir: string,
  setupCode: string | undefined,
  secretKey: string | undefined,
  resetCode: string | undefined,
): Promise<NodeRuntime> {
  const loop = new JobLoop();
  const pages = new WorkerPageReader();

  const ports: Ports = {
    db,
    files: dataFileStore(dataDir),
    ai: await aiRuntime({ publicOnly: false, secretKey, request: fetch }),
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
    stop: () => {
      loop.stop();
      pages.stop();
    },
  };
}
