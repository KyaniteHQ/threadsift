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
import { useModelList } from "./use-model-list.ts";

export const ANOTHER_MODEL = " another";

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
  const [modelTyped, setModelTyped] = useState(false);
  const { fail } = modelField;
  const { set: setModel } = modelField;
  const { set: setEffort } = effortField;

  const clearError = useCallback(() => {
    fail(null);
  }, [fail]);

  const changeModel = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const { value } = event.target;
      const another = value === ANOTHER_MODEL;

      clearError();
      setModelTyped(another);
      if (!another) setModel(value);
    },
    [clearError, setModel],
  );

  const changeEffort = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      clearError();
      setEffort(event.target.value);
    },
    [clearError, setEffort],
  );

  return {
    model: useClearing(modelField, clearError),
    effort: useClearing(effortField, clearError),
    modelTyped,
    setModelTyped,
    changeModel,
    changeEffort,
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
  readonly setModelTyped: (typed: boolean) => void;
  readonly clearError: () => void;
  readonly clearKey: () => void;
}

function useChangeProvider(
  { provider, model, effort, choice }: Readonly<Saved>,
  {
    setProvider,
    setModel,
    setEffort,
    setChoice,
    setModelTyped,
    clearError,
    clearKey,
  }: Readonly<Resets>,
) {
  return useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const next = ProviderSchema.parse(event.target.value);
      const saved = next === provider;
      setProvider(next);
      setModel(saved ? model : "");
      setEffort(saved ? effort : "");
      setChoice(saved ? choice : undefined);
      setModelTyped(false);
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
      setModelTyped,
      clearError,
      clearKey,
    ],
  );
}

export function useAiFields(view: AiView) {
  const { settings, providers, recommendations } = view;
  const offered = settings !== null && providers.includes(settings.provider) ? settings : null;

  const [provider, setProvider] = useState<Provider>(
    offered?.provider ?? providers[0] ?? PROVIDERS["openai-compatible"].id,
  );

  const baseUrl = useField(null, offered?.provider === "openai-compatible" ? offered.baseUrl : "");
  const savedEffort = offered && "effort" in offered ? offered.effort : "";
  const savedChoice = offered && "choice" in offered ? offered.choice : undefined;
  const { model, effort, modelTyped, setModelTyped, changeModel, changeEffort, clearError } =
    useModelFields(offered?.model ?? "", savedEffort);
  const { setChoice, ...cli } = useCliChoice(savedChoice, provider, recommendations, clearError);
  const key = useField();
  const models = useModelList(provider, baseUrl.value, key.value);

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
      setModelTyped,
      clearError,
      clearKey: key.clear,
    },
  );

  return {
    provider,
    providers,
    ...cli,
    baseUrl,
    model,
    effort,
    modelTyped,
    changeModel,
    changeEffort,
    key,
    models,
    changeProvider,
  } as const;
}
