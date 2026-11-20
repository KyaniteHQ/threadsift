import { z } from "zod";

import type { ConnectNotice } from "../../../core/contract/openrouter-contract.ts";
import { HOP_DEADLINE_MS } from "../../../core/contract/request-waits.ts";
import { SECRET_INPUT_MAX } from "../../../core/contract/secret-input.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { claim, refusalBeforeExchange } from "./openrouter-claim.ts";
import { exchangeOpenRouterCode } from "./openrouter-exchange.ts";
import { saveConnectedKey } from "./openrouter-save.ts";

const CallbackQuerySchema = z.object({
  code: z.tuple([z.string().min(1).max(SECRET_INPUT_MAX)]),
  state: z.tuple([z.string().regex(/^[\w-]{43}$/u)]),
  error: z.tuple([]),
});

export async function completeOpenRouterConnect(
  ports: Ports,
  { sessionId, search }: Readonly<{ sessionId: string | undefined; search: string }>,
): Promise<ConnectNotice> {
  if (sessionId === undefined) return "incomplete";

  const query = new URLSearchParams(search);

  const parameters = CallbackQuerySchema.safeParse({
    code: query.getAll("code"),
    state: query.getAll("state"),
    error: query.getAll("error"),
  });

  const { publicOrigin: origin } = ports.config;
  const sealer = ports.secrets;

  if (!parameters.success || origin === null || sealer === null) return "incomplete";

  const {
    code: [code],
    state: [state],
  } = parameters.data;

  const claimed = await claim(ports, origin, { sessionId, state });

  if (claimed === undefined) return refusalBeforeExchange(ports, { sessionId, state });

  const verifier = await sealer.open(claimed.sealedVerifier);

  if (verifier === null) return "incomplete";

  const exchange = await exchangeOpenRouterCode(
    ports.ai,
    { code, verifier },
    AbortSignal.timeout(HOP_DEADLINE_MS),
  );

  if (exchange.kind === "refused") return "incomplete";

  if (exchange.kind !== "key") return "possible-orphan";

  return saveConnectedKey(ports, { sessionId, claimed, key: exchange.key });
}
