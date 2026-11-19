import { z } from "zod";

import { claim, refusalBeforeExchange } from "./openrouter-claim.ts";
import type { ConnectNotice } from "./openrouter-contract.ts";
import { saveConnectedKey } from "./openrouter-save.ts";
import type { Ports } from "./ports.ts";
import { HOP_DEADLINE_MS } from "./request-waits.ts";
import { SECRET_INPUT_MAX } from "./secret-input.ts";

const CallbackQuerySchema = z.object({
  code: z.tuple([z.string().min(1).max(SECRET_INPUT_MAX)]),
  state: z.tuple([z.string().regex(/^[\w-]{43}$/u)]),
  error: z.tuple([]),
});

export async function completeOpenRouterConnect(
  ports: Ports,
  { sessionId, search }: Readonly<{ sessionId: string; search: string }>,
): Promise<ConnectNotice> {
  const query = new URLSearchParams(search);

  const parameters = CallbackQuerySchema.safeParse({
    code: query.getAll("code"),
    state: query.getAll("state"),
    error: query.getAll("error"),
  });

  const { publicOrigin: origin } = ports;
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

  const exchange = await ports.ai.exchangeOpenRouterCode(
    { code, verifier },
    AbortSignal.timeout(HOP_DEADLINE_MS),
  );

  if (exchange.kind === "refused") return "incomplete";

  if (exchange.kind !== "key") return "possible-orphan";

  return saveConnectedKey(ports, { sessionId, claimed, key: exchange.key });
}
