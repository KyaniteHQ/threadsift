import { randomSecret } from "../../core/contract/encoding.ts";
import type { Database } from "../../core/kernel/database.ts";
import { hasOwner } from "../../features/access/core/owner.ts";
import { nodeCrypto } from "../shared/crypto.ts";

const GENERATED_CODE_BYTES = 32;

function printGeneratedCode(): string {
  const generated = randomSecret(nodeCrypto, GENERATED_CODE_BYTES);
  console.log(`Setup code: ${generated}`);

  return generated;
}

export async function setupCodeOf(db: Database, configured: string | undefined) {
  if (configured !== undefined) {
    return configured;
  }

  return (await hasOwner(db)) ? undefined : printGeneratedCode();
}
