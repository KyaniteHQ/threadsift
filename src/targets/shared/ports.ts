import type { AiRuntime } from "../../core/ai-runtime.ts";
import type { Ports } from "../../core/ports.ts";
import { sealedSecrets } from "../../core/sealed-secret.ts";
import { nodeCrypto } from "./crypto.ts";
import { publicOriginOf } from "./public-origin.ts";
import type { Settings } from "./settings.ts";

export interface TargetAdapters extends Omit<Ports, "config" | "secrets" | "crypto" | "ai"> {
  readonly ai: Omit<AiRuntime, "zeroOpenRouterPrice">;
}

export async function portsOf(
  { secretKey, zeroOpenRouterPrice, publicOrigin, ...plain }: Readonly<Settings>,
  adapters: Readonly<TargetAdapters>,
): Promise<Ports> {
  return {
    ...adapters,
    ai: { ...adapters.ai, zeroOpenRouterPrice },
    secrets: await sealedSecrets(secretKey),
    crypto: nodeCrypto,
    config: { ...plain, publicOrigin: publicOriginOf(publicOrigin) },
  };
}
