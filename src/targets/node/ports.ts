import { randomSecret } from "../../core/encoding.ts";
import { hasOwner } from "../../core/owner.ts";
import type { Database, Ports } from "../../core/ports.ts";
import { nodeCrypto } from "../shared/crypto.ts";
import { configuredSetupCode } from "../shared/setup-code.ts";
import { nodeNetwork } from "./network.ts";

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

export async function nodePorts(db: Database, setupCode: string | undefined): Promise<Ports> {
  return {
    db,
    network: nodeNetwork,
    crypto: nodeCrypto,
    setupCode: await setupCodeOf(db, configuredSetupCode(setupCode)),
  };
}
