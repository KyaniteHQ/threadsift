import { modelAttempt } from "./ai-kind-model.ts";
import type {
  AiKindDeclaration,
  BotOnlyDeclaration,
  BotTaskKind,
  IntakeKind,
  PlainDeclaration,
} from "./ai-kind-types.ts";
import { loadAiConfig } from "./ai-load.ts";
import { botStep } from "./bot-step.ts";
import { botFace, botOnlyFace } from "./bot-task-kind.ts";
import { GROK_BOT_PROVIDER } from "./provider-families.ts";

export function defineBasedAiKind<Context, Result, Basis>(
  declaration: Readonly<AiKindDeclaration<Context, Result, Basis>>,
): BotTaskKind {
  const face = botFace(declaration);
  const onModel = modelAttempt(declaration);

  return {
    ...face,
    attempt: async (ports, job) => {
      const ai = await loadAiConfig(ports);

      return ai.state === GROK_BOT_PROVIDER ? botStep(ports, job, face) : onModel(ports, job, ai);
    },
  };
}

export function defineAiKind<Context, Result>(
  declaration: Readonly<PlainDeclaration<Context, Result>>,
): BotTaskKind {
  return defineBasedAiKind({
    ...declaration,
    prepare: async (ports, job) => {
      const prepared = await declaration.prepare(ports, job);

      return prepared.kind === "settled" ? prepared : { ...prepared, basis: undefined };
    },
  });
}

export function defineBotOnlyKind<Context>(
  declaration: Readonly<BotOnlyDeclaration<Context>>,
): IntakeKind {
  const face = botOnlyFace(declaration);

  return { ...face, attempt: (ports, job) => botStep(ports, job, face) };
}
