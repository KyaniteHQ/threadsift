import { z } from "zod";

import { AI_KEY_MAX } from "./ai-contract.ts";
import type { JobWrites } from "./job-outcome.ts";
import { claim, refusalBeforeExchange } from "./openrouter-claim.ts";
import type { ConnectNotice } from "./openrouter-contract.ts";
import { saveConnectedKey } from "./openrouter-save.ts";
import { HOP_DEADLINE_MS, type Ports } from "./ports.ts";

const NO_WRITES = (): JobWrites => [];

const CallbackQuerySchema = z.object({
  code: z.tuple([z.string().min(1).max(AI_KEY_MAX)]),
  state: z.tuple([z.string().regex(/^[\w-]{43}$/u)]),
  error: z.tuple([]),
});

export async function completeOpenRouterConnect(
  ports: Ports,
  { sessionId, search }: Readonly<{ sessionId: string; search: string }>,
  extraWrites: () => JobWrites,
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

  const saved = await saveConnectedKey(
    ports,
    { sessionId, claimed, key: exchange.key },
    exchange.active ? extraWrites : NO_WRITES,
  );

  return saved === "connected" && !exchange.active ? "activation-pending" : saved;
}
