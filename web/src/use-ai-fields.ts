import { useCallback, useState, type ChangeEvent } from "react";

import {
  PROVIDERS,
  ProviderSchema,
  CliChoiceSchema,
  type CliChoice,
  type Provider,
  isCliProvider,
} from "../../src/core/contract/provider-families.ts";
import type { AiView } from "./ai-api.ts";
import { type FieldState, useField } from "./use-form.ts";

function useCliChoice(
  savedChoice: CliChoice | undefined,
  provider: Provider,
  recommendations: Readonly<AiView["recommendations"]>,
  clearError: () => void,
) {
  const [choice, setChoice] = useState(savedChoice);
  const recommendation = isCliProvider(provider) ? recommendations[provider] : undefined;
  const preference = choice ?? (recommendation === undefined ? "cli-defaults" : "recommended");
  const fallsBack = preference === "recommended" && recommendation === undefined;
  const cliChoice = fallsBack ? "cli-defaults" : preference;

  const changeCliChoice = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      clearError();
      setChoice(CliChoiceSchema.parse(event.target.value));
    },
    [clearError],
  );

  return { preference, cliChoice, fallsBack, recommendation, setChoice, changeCliChoice } as const;
}

function useClearing(field: FieldState, clear: () => void): FieldState {
  const { change } = field;

  const changed = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      clear();
      change(event);
    },
    [clear, change],
  );

  return { ...field, change: changed };
}

function useModelFields(savedModel: string, savedEffort: string) {
  const modelField = useField(null, savedModel);
  const effortField = useField(null, savedEffort);
  const { fail } = modelField;

  const clearError = useCallback(() => {
    fail(null);
  }, [fail]);

  return {
    model: useClearing(modelField, clearError),
    effort: useClearing(effortField, clearError),
    clearError,
  };
}

interface Saved {
  readonly provider: Provider | undefined;
  readonly model: string;
  readonly effort: string;
  readonly choice: CliChoice | undefined;
}

interface Resets {
  readonly setProvider: (provider: Provider) => void;
  readonly setModel: (model: string) => void;
  readonly setEffort: (effort: string) => void;
  readonly setChoice: (choice: CliChoice | undefined) => void;
  readonly clearError: () => void;
  readonly clearKey: () => void;
  readonly stayOnPage: () => void;
}

function useChangeProvider(
  { provider, model, effort, choice }: Readonly<Saved>,
  {
    setProvider,
    setModel,
    setEffort,
    setChoice,
    clearError,
    clearKey,
    stayOnPage,
  }: Readonly<Resets>,
) {
  return useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      stayOnPage();
      const next = ProviderSchema.parse(event.target.value);
      const saved = next === provider;
      setProvider(next);
      setModel(saved ? model : "");
      setEffort(saved ? effort : "");
      setChoice(saved ? choice : undefined);
      clearError();
      clearKey();
    },
    [
      provider,
      model,
      effort,
      choice,
      setProvider,
      setModel,
      setEffort,
      setChoice,
      clearError,
      clearKey,
      stayOnPage,
    ],
  );
}

export function useAiFields(view: AiView, stayOnPage: () => void) {
  const { settings, providers, recommendations } = view;
  const offered = settings !== null && providers.includes(settings.provider) ? settings : null;

  const [provider, setProvider] = useState<Provider>(
    offered?.provider ?? providers[0] ?? PROVIDERS["openai-compatible"].id,
  );

  const baseUrl = useField(null, offered?.provider === "openai-compatible" ? offered.baseUrl : "");
  const savedEffort = offered && "effort" in offered ? offered.effort : "";
  const savedChoice = offered && "choice" in offered ? offered.choice : undefined;
  const { model, effort, clearError } = useModelFields(offered?.model ?? "", savedEffort);
  const { setChoice, ...cli } = useCliChoice(savedChoice, provider, recommendations, clearError);
  const key = useField();

  const changeProvider = useChangeProvider(
    {
      provider: offered?.provider,
      model: offered?.model ?? "",
      effort: savedEffort,
      choice: savedChoice,
    },
    {
      setProvider,
      setModel: model.set,
      setEffort: effort.set,
      setChoice,
      clearError,
      clearKey: key.clear,
      stayOnPage,
    },
  );

  return {
    provider,
    providers,
    ...cli,
    baseUrl,
    model,
    effort,
    key,
    changeProvider,
  } as const;
}
