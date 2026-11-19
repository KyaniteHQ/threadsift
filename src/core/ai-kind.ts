import { modelAttempt } from "./ai-kind-model.ts";
import type {
  AiKindDeclaration,
  BotOnlyDeclaration,
  BotTaskKind,
  IntakeKind,
} from "./ai-kind-types.ts";
import { loadAiConfig } from "./ai-load.ts";
import { botStep } from "./bot-step.ts";
import { botFace, botOnlyFace } from "./bot-task-kind.ts";

export function defineAiKind<Context, Result, Basis = never>(
  declaration: Readonly<AiKindDeclaration<Context, Result, Basis>>,
): BotTaskKind {
  const face = botFace(declaration);
  const onModel = modelAttempt(declaration);

  return {
    ...face,
    attempt: async (ports, job) => {
      const ai = await loadAiConfig(ports);

      return ai.state === "grok-bot" ? botStep(ports, job, face) : onModel(ports, job, ai);
    },
  };
}

export function defineBotOnlyKind<Context>(
  declaration: Readonly<BotOnlyDeclaration<Context>>,
): IntakeKind {
  const face = botOnlyFace(declaration);

  return { ...face, attempt: (ports, job) => botStep(ports, job, face) };
}
