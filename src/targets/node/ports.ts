import { base64url } from "../../core/encoding.ts";
import { hasOwner } from "../../core/owner.ts";
import type { Database, Ports } from "../../core/ports.ts";
import { nodeCrypto } from "../shared/crypto.ts";
import { nodeNetwork } from "./network.ts";

const GENERATED_CODE_BYTES = 32;

function printGeneratedCode(): string {
  const generated = base64url(nodeCrypto.randomBytes(GENERATED_CODE_BYTES));
  console.log(`Setup code: ${generated}`);

  return generated;
}

async function setupCodeOf(db: Database, configured: string | undefined) {
  if (configured !== undefined && configured !== "") {
    return configured;
  }

  return (await hasOwner(db)) ? undefined : printGeneratedCode();
}

export async function nodePorts(
  db: Database,
  configuredSetupCode: string | undefined,
): Promise<Ports> {
  return {
    db,
    network: nodeNetwork,
    crypto: nodeCrypto,
    setupCode: await setupCodeOf(db, configuredSetupCode),
  };
}
